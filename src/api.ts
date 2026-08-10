/**
 * Everything the browser knows how to ask the Worker.
 *
 * No database, no bucket and no session secret appear on this side of the wire.
 * The content set goes over whole in both directions — it is 39 KB, and sending
 * all of it is simpler than describing which parts changed and cheaper than
 * getting that description wrong.
 */
import type { ContentSet, MediaInfo } from './content/types';
import type { Problem } from './content/validate';

export interface SiteStatus {
  /** The newest published revision, or null before anything is published. */
  latestRevision: number | null;
  publishedAt: string | null;
  /** Whether the draft differs from that revision. */
  unpublished: boolean;
  /** A fingerprint of the draft, which the preview build reports back. */
  draftRevision: number;
  production: { url: string; revision: number | null };
  preview: { url: string | null; revision: number | null };
}

export interface RevisionSummary {
  id: number;
  message: string;
  published_at: string;
  published_by: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Present when the server rejected the content field by field. */
    readonly problems?: Problem[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    const body = await response
      .json<{ error?: string; problems?: Problem[] }>()
      .catch(() => ({ error: undefined, problems: undefined }));
    throw new ApiError(
      response.status,
      body.error ?? `Request failed (${response.status}).`,
      body.problems,
    );
  }
  return response.json<T>();
}

export async function whoami(): Promise<{ login: string } | null> {
  try {
    return await request<{ login: string }>('/api/session');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function loadContent(): Promise<{ content: ContentSet; media: MediaInfo[] }> {
  return request<{ content: ContentSet; media: MediaInfo[] }>('/api/content');
}

export async function saveContent(content: ContentSet): Promise<void> {
  await request<{ saved: true }>('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/**
 * The bytes go up as the request body rather than in a JSON envelope: base64
 * costs a third again in size for no benefit now that there is no git blob at
 * the other end.
 */
export async function uploadMedia(key: string, image: Blob): Promise<MediaInfo> {
  return request<MediaInfo>(`/api/media?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': image.type },
    body: image,
  });
}

export async function getStatus(): Promise<SiteStatus> {
  return request<SiteStatus>('/api/status');
}

export async function publish(): Promise<{ published: boolean; reason?: string; revision?: number }> {
  return request('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Publish from the studio admin' }),
  });
}

export async function listRevisions(): Promise<RevisionSummary[]> {
  const body = await request<{ revisions: RevisionSummary[] }>('/api/revisions');
  return body.revisions;
}

export async function restoreRevision(id: number): Promise<{ revision: number }> {
  return request<{ revision: number }>(`/api/revisions/${id}/restore`, { method: 'POST' });
}
