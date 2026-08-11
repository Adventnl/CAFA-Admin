/**
 * Photographs are resized before they are ever uploaded.
 *
 * The site asks Cloudflare for derivatives no wider than 2400 pixels, so a
 * 6000-pixel original contributes nothing but storage and upload time.
 * Downscaling here — in the browser, before the bytes leave it — turns a 6 MB
 * phone photograph into something a few hundred kilobytes wide, and drops the
 * EXIF block (which routinely carries GPS coordinates) on the way through,
 * since canvas encoding keeps pixels and nothing else.
 *
 * The dimensions are deliberately not returned. The Worker measures them from
 * the bytes it receives, because they become the aspect box that holds the
 * page still while an image loads, and a number the site's CLS budget depends
 * on should come from the file rather than from whatever the client claimed.
 */

/** The largest derivative the site will ever ask for. */
const MAX_EDGE = 2400;
const QUALITY = 0.86;

function scaleToFit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = scaleToFit(bitmap.width, bitmap.height);

  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser cannot resize images.');

  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  return canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
}

/**
 * Photographs are filed under a work, a mentor or the studio, and the content
 * record stores exactly the key the bucket uses — so both are derived here and
 * there is no prefix to get wrong. worker/domain/image.ts holds the allowlist that
 * refuses anything this would not have produced.
 */
export function mediaKey(folder: string, name: string): string {
  return `${folder}/${name}.jpg`;
}

/** A file name that will not collide with what is already in the folder. */
export function nextMediaName(existing: string[], prefix: string): string {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${prefix}${String(n).padStart(2, '0')}`;
    if (!existing.some((key) => key.endsWith(`/${candidate}.jpg`))) return candidate;
  }
  throw new Error('Too many images in one folder.');
}
