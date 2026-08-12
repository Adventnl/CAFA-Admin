/**
 * Publishing, and the history it appends to.
 *
 * Restoring is a publish, not an edit: it appends a new revision holding an old
 * one's content, so nothing that was ever live becomes unreachable.
 */
import { request } from './http';
import type { PublishResult, RevisionSummary, SiteStatus } from './types';

export const publishService = {
  status: () => request<SiteStatus>('/api/status'),

  publish: () =>
    request<PublishResult>('/api/publish', {
      method: 'POST',
      body: { message: 'Publish from the studio admin' },
    }),

  revisions: () => request<RevisionSummary[]>('/api/revisions'),

  restore: (id: number) =>
    request<PublishResult>(`/api/revisions/${id}/restore`, { method: 'POST' }),
};
