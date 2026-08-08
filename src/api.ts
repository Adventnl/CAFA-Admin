/**
 * Everything the browser knows how to ask the Worker. No GitHub URLs and no
 * token ever appear on this side of the wire.
 */
import { CONTENT_PATHS, type ContentSet } from './content/types';

export interface Standing {
  status: 'identical' | 'ahead' | 'behind' | 'diverged';
  ahead: number;
  behind: number;
}

export interface SiteStatus {
  draftHead: string;
  productionHead: string;
  standing: Standing;
  unpublished: number;
  production: { url: string; commit: string | null };
  preview: { url: string | null; commit: string | null };
}

export interface FileEdit {
  path: string;
  content: string | null;
  encoding: 'utf-8' | 'base64';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    const body = await response.json<{ error?: string }>().catch(() => ({ error: undefined }));
    throw new ApiError(response.status, body.error ?? `Request failed (${response.status}).`);
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

export async function loadContent(): Promise<{ head: string; content: ContentSet }> {
  const loaded = await request<{ head: string; files: Record<string, string | null> }>(
    '/api/content',
  );

  const read = <T,>(key: keyof ContentSet): T => {
    const raw = loaded.files[CONTENT_PATHS[key]];
    if (raw === null || raw === undefined) {
      throw new Error(`${CONTENT_PATHS[key]} is missing from the site's repository.`);
    }
    return JSON.parse(raw) as T;
  };

  return {
    head: loaded.head,
    content: {
      site: read('site'),
      works: read('works'),
      programs: read('programs'),
      mentors: read('mentors'),
      zh: read('zh'),
      en: read('en'),
    },
  };
}

export async function saveEdits(
  head: string,
  edits: FileEdit[],
  message: string,
): Promise<{ head: string }> {
  return request<{ head: string }>('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ head, edits, message }),
  });
}

export async function getStatus(): Promise<SiteStatus> {
  return request<SiteStatus>('/api/status');
}

export async function publish(): Promise<{ published: boolean; reason?: string }> {
  return request<{ published: boolean; reason?: string }>('/api/publish', { method: 'POST' });
}

export async function catchUp(): Promise<{ head: string }> {
  return request<{ head: string }>('/api/catch-up', { method: 'POST' });
}
