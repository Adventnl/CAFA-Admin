/**
 * Publishing, and everything that answers "is it live yet".
 *
 * The publishing model, in one paragraph. Saving writes the live tables — that
 * is the draft, and it is what the preview build reads. Publishing snapshots
 * those tables into an append-only `revision` row and pokes a Cloudflare deploy
 * hook, and the production build reads the newest revision. So the draft/main
 * branch pair became live-tables/newest-revision, "how far ahead is the draft"
 * became "does the draft differ from the newest revision", and the commit SHA
 * in build-info.json became a revision number.
 *
 * Everything here compares two bundles as strings. That works because
 * `buildBundle` is deterministic over the same content — same key order, same
 * projection — so equality of the JSON is equality of the published result, and
 * "nothing to publish" needs no diffing.
 */
import type { Env } from '../env';
import type { CurrentUser } from '../shared/current-user';
import type { PublishResponse, StatusResponse } from '../models/dtos/publish.dtos';
import { buildBundle } from '../domain/bundle';
import { readContent } from '../repositories/content.repository';
import { readMedia } from '../repositories/media.repository';
import {
  findRevision,
  insertRevision,
  listRevisions,
  newestRevision,
  type RevisionSummary,
} from '../repositories/revision.repository';
import { ApiException } from '../shared/api-exception';
import type { DeployService } from './deploy.service';

/**
 * A number that changes when the draft does.
 *
 * The preview is built from the draft, which has no revision id — so it needs
 * something else to write into build-info.json for "is the preview showing what
 * I last saved" to be answerable the same way the production question is.
 * FNV-1a over the bundle is enough: this compares two builds of the same
 * content, so a collision would have to be between two drafts one save apart.
 */
function fingerprint(text: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A published revision, in the envelope the template's build script expects. */
export interface BundleEnvelope {
  revision: number;
  /** Already-serialised JSON, spliced in rather than parsed and re-stringified. */
  bundle: string;
}

/** The same snapshot, plus when it went live. What the read API answers from. */
export interface PublishedSnapshot extends BundleEnvelope {
  publishedAt: string;
}

export class PublishService {
  constructor(
    private readonly env: Env,
    private readonly deploy: DeployService,
  ) {}

  /** The draft, in exactly the form a published revision takes, so the two compare. */
  async draftBundle(): Promise<string> {
    const [content, media] = await Promise.all([
      readContent(this.env.DB),
      readMedia(this.env.DB),
    ]);
    return JSON.stringify(
      buildBundle(content, media, this.env.MEDIA_BASE, this.env.PRODUCTION_URL),
    );
  }

  async status(): Promise<StatusResponse> {
    const [newest, draft] = await Promise.all([newestRevision(this.env.DB), this.draftBundle()]);
    const [live, preview] = await Promise.all([
      this.deploy.liveRevision(this.env.PRODUCTION_URL),
      this.deploy.liveRevision(this.env.PREVIEW_URL),
    ]);

    return {
      latestRevision: newest?.id ?? null,
      publishedAt: newest?.published_at ?? null,
      // No revision yet means everything is unpublished, including nothing.
      unpublished: newest === null ? true : newest.content !== draft,
      draftRevision: fingerprint(draft),
      production: { url: this.env.PRODUCTION_URL, revision: live },
      preview: { url: this.env.PREVIEW_URL ?? null, revision: preview },
    };
  }

  async publish(user: CurrentUser, message: string): Promise<PublishResponse> {
    const [newest, draft] = await Promise.all([newestRevision(this.env.DB), this.draftBundle()]);
    if (newest !== null && newest.content === draft) {
      return { published: false, reason: 'Nothing to publish.' };
    }

    const revision = await insertRevision(this.env.DB, {
      content: draft,
      message,
      publishedBy: user.login,
    });

    await this.deploy.pokeProduction();
    return { published: true, revision };
  }

  /**
   * Rolling back is publishing an old snapshot as a new one. History is
   * append-only, so what was live at any point stays recoverable.
   */
  async restore(user: CurrentUser, id: number): Promise<PublishResponse> {
    const wanted = await findRevision(this.env.DB, id);
    if (wanted === null) throw ApiException.notFound('No such revision.');

    const revision = await insertRevision(this.env.DB, {
      content: wanted.content,
      message: `Restore revision ${id}`,
      publishedBy: user.login,
    });

    await this.deploy.pokeProduction();
    return { published: true, revision, restoredFrom: id };
  }

  async history(): Promise<RevisionSummary[]> {
    return listRevisions(this.env.DB);
  }

  /**
   * The newest revision, whole.
   *
   * One read, two callers: the build endpoint splices `bundle` into its answer
   * without parsing it, and the read API parses it once and cuts views out of
   * it. Both need the same "nothing has been published yet" answer, so the rule
   * is stated here rather than twice.
   */
  async publishedSnapshot(): Promise<PublishedSnapshot> {
    const newest = await newestRevision(this.env.DB);
    if (newest === null) throw ApiException.notFound('Nothing has been published yet.');
    return { revision: newest.id, bundle: newest.content, publishedAt: newest.published_at };
  }

  /** What the production build reads. */
  async publishedBundle(): Promise<BundleEnvelope> {
    return this.publishedSnapshot();
  }

  /** What the preview build reads. The draft has no id, so it gets a fingerprint. */
  async draftEnvelope(): Promise<BundleEnvelope> {
    const draft = await this.draftBundle();
    return { revision: fingerprint(draft), bundle: draft };
  }
}
