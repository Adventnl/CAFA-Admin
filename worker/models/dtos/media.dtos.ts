/**
 * The media endpoints' contracts.
 *
 * The response is exactly a `MediaInfo` — the key the studio chose, the three
 * numbers measured from the bytes, and the hue measured from the pixels. The
 * client writes it straight into the content set it is holding, so the upload
 * and the save that references it agree without a round trip.
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

/**
 * The `tint` query parameter: an angle on the OKLCH colour circle, or nothing.
 *
 * Absent is a real answer rather than a client that forgot — a monochrome
 * photograph has no hue to give, and neither has one a browser could not read a
 * hue out of — so it becomes null and the site draws its neutral band. A value
 * that is *present and not an angle* is a bug in the client and is refused,
 * because the site's build fails on a hue outside [0, 360) and it should fail
 * here, where the person who caused it is looking, rather than there.
 */
export function parseTint(url: URL): number | null {
  const given = url.searchParams.get('tint');
  if (given === null || given === '') return null;

  const hue = Number(given);
  if (!Number.isFinite(hue) || hue < 0 || hue >= 360) {
    throw ApiException.badRequest('The tint must be a hue in [0, 360).');
  }
  return hue;
}
