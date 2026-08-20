/**
 * Photographs.
 *
 * `url` is a plain string rather than a fetch, because what consumes it is an
 * `<img src>`. The `v` parameter is a cache-buster: the Worker keys the object
 * by path alone, so replacing a photograph under the same key would otherwise
 * keep showing the old bytes for as long as the browser cached them.
 */
import { request } from './http';
import type { MediaInfo } from '../content/types';
import type { PreparedImage } from '../images';

export const mediaService = {
  /**
   * The bytes are the body; the key and the measured hue ride in the query,
   * because there is nowhere else for them to sit. A hue of null is simply left
   * out — the Worker reads an absent one as "no hue to give", which is the same
   * thing a monochrome photograph has.
   */
  upload: (key: string, { image, tint }: PreparedImage) =>
    request<MediaInfo>('/api/media', {
      method: 'POST',
      query: { key, tint: tint ?? undefined },
      headers: { 'Content-Type': image.type },
      raw: image,
    }),

  url: (key: string, version: number) =>
    `/api/media?key=${encodeURIComponent(key)}&v=${version}`,
};
