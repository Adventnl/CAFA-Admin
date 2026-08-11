/**
 * The publish and status contracts.
 *
 * `StatusResponse` is the one screen the studio watches after pressing
 * Publish, so it answers three separate questions at once: what is the newest
 * revision, does the draft differ from it, and has each deployed origin caught
 * up yet.
 */
import { ApiException } from '../../shared/api-exception';

export interface DeployedOrigin {
  url: string | null;
  /** What that origin says it was built from, or null if it cannot be read. */
  revision: number | null;
}

export interface StatusResponse {
  /** The newest published revision, or null before anything is published. */
  latestRevision: number | null;
  publishedAt: string | null;
  /** Whether the draft differs from that revision. */
  unpublished: boolean;
  /** A fingerprint of the draft, which the preview build reports back. */
  draftRevision: number;
  production: DeployedOrigin;
  preview: DeployedOrigin;
}

export interface PublishResponse {
  published: boolean;
  /** Present when nothing was published, and says why. */
  reason?: string;
  revision?: number;
  /** Present on a rollback: the revision whose content was re-published. */
  restoredFrom?: number;
}

const DEFAULT_MESSAGE = 'Publish';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A publish message is optional; an empty one is the same as none. */
export function parsePublishRequest(body: unknown): string {
  if (!isRecord(body)) return DEFAULT_MESSAGE;
  const { message } = body;
  if (typeof message !== 'string' || message.trim() === '') return DEFAULT_MESSAGE;
  return message;
}

/** A revision id out of the path. Non-numeric never reaches the repository. */
export function parseRevisionId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw ApiException.badRequest('Not a revision id.');
  return id;
}
