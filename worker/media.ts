/**
 * Photographs, in the bucket.
 *
 * Dimensions are read out of the uploaded bytes rather than taken from the
 * browser that sent them. They are not decoration: the template turns them into
 * the aspect box that holds a slot open before an image arrives, and a wrong
 * number there is layout shift on the live site. A value the site's CLS budget
 * depends on should be derived from the file, not from a form field.
 *
 * Reading a JPEG or PNG header is forty lines. Decoding the image is not
 * possible in a Worker anyway — there is no sharp here — so this is not a
 * shortcut around a better option, it is the only correct one.
 */

export interface Measured {
  width: number;
  height: number;
  bytes: number;
}

/** IHDR is always the first chunk, at a fixed offset past the signature. */
function pngSize(view: DataView): { width: number; height: number } | null {
  if (view.byteLength < 24 || view.getUint32(0) !== 0x89504e47) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The frame header carries the dimensions. SOF0–SOF15 is the marker range, less
 * C4, C8 and CC — Huffman tables, JPEG extensions and arithmetic coding share
 * the range and carry no frame.
 */
function jpegSize(view: DataView): { width: number; height: number } | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let at = 2;
  while (at < view.byteLength - 9) {
    if (view.getUint8(at) !== 0xff) {
      at += 1;
      continue;
    }
    const marker = view.getUint8(at + 1);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    const length = view.getUint16(at + 2);
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

export function measure(buffer: ArrayBuffer): Measured {
  const view = new DataView(buffer);
  const size = pngSize(view) ?? jpegSize(view);
  if (size === null || size.width === 0 || size.height === 0) {
    throw new Error('That file is not a JPEG or PNG the site can read.');
  }
  return { ...size, bytes: buffer.byteLength };
}

/**
 * A key the admin is allowed to write. Photographs are filed under a work,
 * a mentor or the studio, and nothing may climb out of the bucket with "..".
 */
const KEY = /^(works\/[a-z0-9-]+|mentors|studio)\/[a-z0-9-]+\.(jpg|png)$/;

export function isMediaKey(key: string): boolean {
  return KEY.test(key) && !key.includes('..');
}

export function contentTypeOf(key: string): string {
  return key.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export async function putMedia(bucket: R2Bucket, key: string, body: ArrayBuffer): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType: contentTypeOf(key) } });
}

export async function getMedia(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
