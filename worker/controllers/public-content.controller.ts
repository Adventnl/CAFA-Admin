/**
 * GET /api/content/published, GET /api/content/draft
 *
 * The two routes a build reads, and the only two that answer **outside** the
 * `ApiResponse` envelope. That is deliberate and worth stating plainly, because
 * it is the one inconsistency in the API:
 *
 * These are a contract with a different repository. CAFA-Template's
 * `scripts/fetch-content.mjs` runs before `next build`, checks the response is
 * a `{ revision, bundle }` envelope, and writes it to disk. Wrapping them would
 * mean a matching change over there, deployed in lockstep, to buy consistency
 * on two endpoints no human ever reads. The envelope exists for a client that
 * branches on `success` and shows `msg` to someone; a build script that exits
 * non-zero is not that client.
 *
 * The JSON is spliced rather than parsed and re-serialised. A published
 * revision is already stored as JSON text, so `JSON.parse` followed by
 * `JSON.stringify` would be ~39 KB of work per build to produce the same bytes.
 *
 * `published` is unauthenticated. Workers Builds has no session cookie, and a
 * published revision is by definition already on the public website — the row
 * exists because someone pressed Publish, and worker/domain/bundle.ts has
 * already dropped everything a private work would have leaked. There is nothing
 * here to protect, and a shared secret would be ceremony rather than security.
 *
 * `draft` is different: unpublished work is exactly what should not leak, so it
 * requires the preview build's token.
 */
import type { BundleEnvelope, PublishService } from '../services/publish.service';
import type { AuthService } from '../services/auth.service';
import type { RequestContext } from '../shared/router';

export class PublicContentController {
  constructor(
    private readonly publishing: PublishService,
    private readonly auth: AuthService,
  ) {}

  published = async (): Promise<Response> => {
    return envelope(await this.publishing.publishedBundle());
  };

  draft = async ({ request }: RequestContext): Promise<Response> => {
    this.auth.assertPreviewBuild(request.headers.get('X-Preview-Token'));
    return envelope(await this.publishing.draftEnvelope());
  };
}

/**
 * Deliberately uncached: this is read a handful of times a month, always by a
 * build that has just been told there is something new to read. A stale hit
 * would publish the previous revision and look like a lost save.
 */
function envelope({ revision, bundle }: BundleEnvelope): Response {
  return new Response(`{"revision":${revision},"bundle":${bundle}}`, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
