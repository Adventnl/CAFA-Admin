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

export const mediaService = {
  upload: (key: string, image: Blob) =>
    request<MediaInfo>('/api/media', {
      method: 'POST',
      query: { key },
      headers: { 'Content-Type': image.type },
      raw: image,
    }),

  url: (key: string, version: number) =>
    `/api/media?key=${encodeURIComponent(key)}&v=${version}`,
};
