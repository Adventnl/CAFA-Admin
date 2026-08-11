/**
 * Photographs, from arrival to registry row.
 *
 * The one rule worth stating: **the object goes into the bucket before the row
 * goes into the database.** A row pointing at an object that is not there yet is
 * the only ordering that can break a build, and it is the ordering you get for
 * free if you do not think about it.
 *
 * Dimensions are measured from the bytes rather than trusted from the browser
 * that sent them. They become the aspect box the template holds a slot open
 * with, so a wrong number here is layout shift on the live site — a value the
 * CLS budget depends on should be derived from the file, not from a form field.
 */
import type { MediaInfo } from '../../src/content/types';
import { measure } from '../domain/image';
import { recordMedia } from '../repositories/media.repository';
import { ApiException } from '../shared/api-exception';
import { getMedia, putMedia } from '../storage/media-storage';

export class MediaService {
  constructor(
    private readonly db: D1Database,
    private readonly bucket: R2Bucket,
  ) {}

  async upload(key: string, body: ArrayBuffer): Promise<MediaInfo> {
    let measured;
    try {
      measured = measure(body);
    } catch (error) {
      throw ApiException.badRequest(
        error instanceof Error ? error.message : 'Unreadable image.',
      );
    }

    await putMedia(this.bucket, key, body);
    await recordMedia(this.db, { key, ...measured });

    return { key, ...measured };
  }

  /** The original, for the editor's own previews. Never for the public site. */
  async fetch(key: string): Promise<R2ObjectBody> {
    const object = await getMedia(this.bucket, key);
    if (object === null) throw ApiException.notFound('No such image.');
    return object;
  }
}
