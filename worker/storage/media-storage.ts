/**
 * The bucket.
 *
 * Separate from worker/repositories/media.repository.ts on purpose, and for the
 * same reason veyra_api keeps `Storage/S3TalentMediaStorage.cs` apart from its
 * DbContext: one of them holds bytes and the other holds a row about those
 * bytes, and they fail in different ways. The service that uses both is the
 * place that knows the order — object first, then row, because a row pointing
 * at an object that is not there yet is the only ordering that can break a build.
 */
import { contentTypeOf } from '../domain/image';

/**
 * `cacheControl` is stored on the object because the bucket's custom domain
 * serves it verbatim, and that domain is what a browser talks to — through
 * `/cdn-cgi/image/` when the zone can transform, and directly when it cannot.
 * Without a header here the answer carries no freshness of its own and every
 * repeat view is a conditional request at best.
 *
 * An hour, not a year: replacing a photograph under the same key is a normal
 * thing for the studio to do, nothing rewrites the URL when they do, and there
 * is no purge in this repository. An hour is long enough that a page of
 * photographs is free to revisit and short enough that a replacement appears
 * without anyone having to know why it has not.
 */
export async function putMedia(
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer,
): Promise<void> {
  await bucket.put(key, body, {
    httpMetadata: { contentType: contentTypeOf(key), cacheControl: 'public, max-age=3600' },
  });
}

export async function getMedia(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
