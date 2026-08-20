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
 *
 * The hue is the one number that arrives the other way round, and the asymmetry
 * is the point rather than an inconsistency. Finding it means reading pixels,
 * and a Worker has no decoder to read them with — there is no sharp here, and
 * `measure` gets away with a header because a header is all a dimension is. The
 * browser has already decoded the photograph to resize it, so it measures the
 * hue in that same pass and sends the angle along. What is not trusted is the
 * *shape* of what it sends: `parseTint` refuses anything that is not an angle,
 * and the column's CHECK refuses it again. What a wrong-but-valid hue costs is
 * a slightly wrong ground behind one row of the works index, which is not what
 * the CLS budget is made of.
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

  async upload(key: string, body: ArrayBuffer, tint: number | null): Promise<MediaInfo> {
    let measured;
    try {
      measured = measure(body);
    } catch (error) {
      throw ApiException.badRequest(
        error instanceof Error ? error.message : 'Unreadable image.',
      );
    }

    const info: MediaInfo = { key, ...measured, tint };

    await putMedia(this.bucket, key, body);
    await recordMedia(this.db, info);

    return info;
  }

  /** The original, for the editor's own previews. Never for the public site. */
  async fetch(key: string): Promise<R2ObjectBody> {
    const object = await getMedia(this.bucket, key);
    if (object === null) throw ApiException.notFound('No such image.');
    return object;
  }
}
