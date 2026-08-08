/**
 * Photographs are resized before they are ever committed.
 *
 * The site's image pipeline emits derivatives at 480, 768, 1200, 1800 and 2400
 * pixels wide, so a 6000-pixel original contributes nothing but weight to a git
 * history that keeps every version of it forever. Downscaling here — in the
 * browser, before upload — turns a 6 MB phone photograph into something the
 * size of the originals already in the repository, and drops the EXIF block
 * (which routinely carries GPS coordinates) on the way through, since canvas
 * encoding keeps pixels and nothing else.
 */

/** The largest derivative scripts/build-images.mjs will ever emit. */
const MAX_EDGE = 2400;
const QUALITY = 0.86;

export interface PreparedImage {
  /** Base64 of the encoded JPEG, ready for a git blob. */
  base64: string;
  width: number;
  height: number;
  bytes: number;
}

function scaleToFit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  // Chunked so a multi-megabyte image does not blow the argument limit on
  // String.fromCharCode, which is the failure mode that only shows up in
  // production on somebody's large photograph.
  let binary = '';
  const CHUNK = 0x8000;
  for (let at = 0; at < buffer.length; at += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const size = scaleToFit(bitmap.width, bitmap.height);

  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser cannot resize images.');

  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  return {
    base64: await toBase64(blob),
    width: size.width,
    height: size.height,
    bytes: blob.size,
  };
}

/**
 * Media lives at media-source/<folder>/<name>.jpg and the content record stores
 * the path relative to that root, so both are derived from one place.
 */
export function mediaPath(folder: string, name: string): string {
  return `${folder}/${name}.jpg`;
}

/** A file name that will not collide with what is already in the folder. */
export function nextMediaName(existing: string[], prefix: string): string {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${prefix}${String(n).padStart(2, '0')}`;
    if (!existing.some((path) => path.endsWith(`/${candidate}.jpg`))) return candidate;
  }
  throw new Error('Too many images in one folder.');
}
