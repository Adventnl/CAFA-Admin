/**
 * The media endpoints' contracts.
 *
 * The response is exactly a `MediaInfo` — the key the studio chose plus the
 * three numbers measured from the bytes. The client writes it straight into the
 * content set it is holding, so the upload and the save that references it
 * agree without a round trip.
 */
import type { MediaInfo } from '../../../src/content/types';
import { isMediaKey } from '../../domain/image';
import { ApiException } from '../../shared/api-exception';

export type UploadMediaResponse = MediaInfo;

/**
 * The `key` query parameter, checked against what the admin may write.
 *
 * Both media routes need it and both must refuse the same things, so the check
 * lives here rather than twice in the controller.
 */
export function parseMediaKey(url: URL): string {
  const key = url.searchParams.get('key');
  if (key === null || key === '') throw ApiException.badRequest('No media key given.');
  if (!isMediaKey(key)) throw ApiException.badRequest('Not a media key the admin may write.');
  return key;
}
