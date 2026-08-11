/**
 * The wire contracts, as the browser sees them.
 *
 * These mirror worker/models/dtos/ deliberately and are written out again
 * rather than imported from it. The Worker's DTOs are free to change shape for
 * server reasons; the day one does, this file is where the compiler says so,
 * which is the point of having a boundary at all. The content types themselves
 * (`ContentSet`, `Work`, `MediaInfo`) *are* shared — they are the domain, not
 * the transport.
 */
import type { ContentSet, MediaInfo } from '../content/types';
import type { Problem } from '../content/validate';

/** The envelope every authenticated endpoint answers in. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  code: number;
  msg: string;
  /** Field-level detail on a rejected save. Absent on success. */
  problems?: Problem[];
}

export interface SessionResponse {
  login: string;
}

export interface ContentResponse {
  content: ContentSet;
  media: MediaInfo[];
}

export interface SavedResponse {
  saved: true;
}

export interface DeployedOrigin {
  url: string | null;
  revision: number | null;
}

export interface SiteStatus {
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

export interface PublishResult {
  published: boolean;
  /** Present when nothing was published, and says why. */
  reason?: string;
  revision?: number;
  restoredFrom?: number;
}

export interface RevisionSummary {
  id: number;
  message: string;
  published_at: string;
  published_by: string;
}
