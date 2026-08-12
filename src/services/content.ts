/**
 * Reading and saving the draft.
 *
 * The content set goes over whole in both directions — 39 KB, which is cheaper
 * to send than a description of which parts of it moved.
 */
import { request } from './http';
import type { ContentResponse, SavedResponse } from './types';
import type { ContentSet } from '../content/types';

export const contentService = {
  load: () => request<ContentResponse>('/api/content'),

  save: (content: ContentSet) =>
    request<SavedResponse>('/api/save', { method: 'POST', body: { content } }),
};
