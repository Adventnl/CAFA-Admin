/**
 * The four conversions every repository in here needs.
 *
 * Localised text is two columns and an object; an image is four columns and an
 * `ImageRef`. Both appear in five tables, so they are written once rather than
 * five times — which is also the only place the `decorative` convention is
 * explained.
 */
import type { ImageRef, LocalisedText } from '../../src/content/types';

export function pair(zh: string, en: string): LocalisedText {
  return { zh, en };
}

/**
 * Four columns back into an ImageRef. `decorative` is what distinguishes a
 * deliberate empty alt from a forgotten one — the schema refuses the second,
 * so by the time a row is read only the first is possible.
 */
export function imageRef(
  key: string,
  altZh: string,
  altEn: string,
  decorative: number,
): ImageRef {
  return { src: key, alt: decorative === 1 ? '' : pair(altZh, altEn) };
}

/** The four columns an ImageRef occupies, ready to bind. */
export function imageBindings(image: ImageRef): [string, string, string, number] {
  if (image.alt === '') return [image.src, '', '', 1];
  return [image.src, image.alt.zh, image.alt.en, 0];
}

/** Rows grouped by the column that owns them, preserving the query's order. */
export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const owner = key(row);
    const existing = grouped.get(owner);
    if (existing === undefined) grouped.set(owner, [row]);
    else existing.push(row);
  }
  return grouped;
}
