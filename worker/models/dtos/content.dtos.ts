/**
 * The content endpoints' contracts.
 *
 * `parseSaveRequest` is where an unknown body becomes a typed one, and it is
 * the only narrowing that happens — everything past it is `ContentSet`. It
 * checks the shape and nothing else, because the *values* are checked by
 * `checkContent`, which produces the field-level problems the editor draws.
 * Two gates, two jobs: this one answers 400, that one answers 422.
 */
import type { ContentSet, MediaInfo } from '../../../src/content/types';
import { ApiException } from '../../shared/api-exception';

export interface ContentResponse {
  content: ContentSet;
  media: MediaInfo[];
}

export interface SavedResponse {
  saved: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSaveRequest(body: unknown): ContentSet {
  if (!isRecord(body) || !isRecord(body.content)) {
    throw ApiException.badRequest('Malformed save.');
  }
  return body.content as unknown as ContentSet;
}
