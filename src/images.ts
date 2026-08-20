/**
 * Photographs are resized before they are ever uploaded — and measured on the
 * way past, because this is the only place the pixels are ever open.
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
 *
 * The hue is the exception, and it is one because of where the pixels are. A
 * Worker can read a JPEG's header and cannot decode its image — there is no
 * decoder in the runtime and no sharp — so the only process in the system that
 * has this photograph as colours rather than as bytes is this one, which has
 * just decoded it to resize it. So it measures the hue in the same pass. The
 * Worker still refuses anything that is not an angle, and the column refuses it
 * again; what it cannot do is find the number itself.
 */

/** The largest derivative the site will ever ask for. */
const MAX_EDGE = 2400;
const QUALITY = 0.86;

/**
 * The edge of the thumbnail the hue is read off. Every pixel of it is already
 * an average of a few hundred of the original's, which is what makes 2,304
 * samples enough to describe a photograph's colour.
 */
const SAMPLE_EDGE = 48;

/**
 * Below this mean chroma the photograph has no hue worth drawing — it is
 * monochrome, or so close that a band built from it would be the paper. In
 * OKLab a just-perceptible tint sits around 0.02; a greyscale scan measures
 * about a tenth of that.
 */
const NEUTRAL = 0.015;

/**
 * How much the hues have to agree before one of them speaks for the picture.
 *
 * The measurement is a vector sum, so a photograph of green foliage under an
 * orange sky partly cancels itself out. Under a quarter of the chroma surviving
 * that cancellation means there is no dominant hue, only two — and the site
 * would rather draw its neutral band than pick a winner between them.
 */
const AGREEMENT = 0.25;

export interface PreparedImage {
  /** The re-encoded photograph, at most MAX_EDGE on its longest side. */
  image: Blob;
  /**
   * Its dominant hue, in degrees on the OKLCH colour circle, or null where it
   * has none to give. The site tints the works index's hovered row with it.
   */
  tint: number | null;
}

function scaleToFit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** sRGB, gamma removed. Everything below works in light rather than in bytes. */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * The chromatic half of OKLab — Björn Ottosson's coefficients, unchanged.
 *
 * OKLab rather than HSL because the site spends the answer in `oklch()`: the
 * band behind an index row is `oklch(--tint-l --tint-c H)`, so H has to be an
 * OKLCH angle. An HSL hue would be the same word for a different direction —
 * sRGB red is 0° there and about 29° here — and every band would come out
 * rotated by an amount that changes with the colour.
 *
 * `l` is dropped on the way out for the same reason: lightness is a token, so
 * only the direction the colour points in is ours to measure.
 */
function chromaticity(red: number, green: number, blue: number): { a: number; b: number } {
  const r = linear(red);
  const g = linear(green);
  const bl = linear(blue);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);

  return {
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/**
 * The photograph's dominant hue, or null where it has none.
 *
 * Summing the `a` and `b` of every sample *is* the chroma-weighted circular
 * mean, because each pair is already the hue's direction times its chroma — so
 * a strongly coloured pixel pulls harder than a nearly grey one without a
 * weight having to be written anywhere. The angle of the sum is the answer; its
 * length against the chroma that went in is how much the picture agreed with
 * itself, which is what the two thresholds above read.
 */
function dominantHue(bitmap: ImageBitmap): number | null {
  const canvas = new OffscreenCanvas(SAMPLE_EDGE, SAMPLE_EDGE);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return null;

  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
  const { data } = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE);

  let x = 0;
  let y = 0;
  let chroma = 0;
  let samples = 0;

  for (let at = 0; at < data.length; at += 4) {
    if ((data[at + 3] ?? 0) < 128) continue;
    const { a, b } = chromaticity(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0);
    x += a;
    y += b;
    chroma += Math.hypot(a, b);
    samples += 1;
  }

  if (samples === 0 || chroma / samples < NEUTRAL) return null;
  if (Math.hypot(x, y) / chroma < AGREEMENT) return null;

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const size = scaleToFit(bitmap.width, bitmap.height);

  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser cannot resize images.');

  context.drawImage(bitmap, 0, 0, size.width, size.height);
  // Measured from the original rather than from the derivative above: the same
  // colours either way, and reading a 48px square costs nothing next to reading
  // a 2400px one.
  const tint = dominantHue(bitmap);
  bitmap.close();

  return { image: await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY }), tint };
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
