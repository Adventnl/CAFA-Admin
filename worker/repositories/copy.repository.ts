/**
 * The UI copy, flat.
 *
 * The dictionaries are ~60 nested strings each. Modelling nested UI copy
 * relationally is a trap; a dotted path is the honest shape. The two
 * conversions below are the whole of it — `flatten` on the way in, `unflatten`
 * on the way out — and a run of consecutive integer segments rebuilds as an
 * array, which is what carries `about.body` across the round trip as a list of
 * paragraphs rather than an object with numeric keys.
 *
 * Keys are schema, not data: a key exists because the template's `Dictionary`
 * type has a field for it. The admin edits values and never adds or removes
 * keys — new keys arrive by migration, beside the code that reads them.
 */
import { LOCALES, type Dictionary, type Locale } from '../../src/content/types';
import type { CopyRow } from '../models/rows';

/**
 * Dotted copy keys back into the nested object the dictionary type describes.
 */
function unflatten(entries: readonly (readonly [string, string])[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const [path, value] of entries) {
    const segments = path.split('.');
    let node: Record<string, unknown> = root;

    for (let at = 0; at < segments.length - 1; at += 1) {
      const segment = segments[at];
      if (segment === undefined) continue;
      const existing = node[segment];
      if (typeof existing === 'object' && existing !== null) {
        node = existing as Record<string, unknown>;
      } else {
        const created: Record<string, unknown> = {};
        node[segment] = created;
        node = created;
      }
    }

    const last = segments[segments.length - 1];
    if (last !== undefined) node[last] = value;
  }

  return arraysFromNumericKeys(root) as Record<string, unknown>;
}

/** An object whose keys are exactly 0…n-1 was an array before it was flattened. */
function arraysFromNumericKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const rebuilt: Record<string, unknown> = {};
  for (const key of keys) rebuilt[key] = arraysFromNumericKeys(record[key]);

  const looksLikeArray = keys.length > 0 && keys.every((key, at) => key === String(at));
  return looksLikeArray ? keys.map((key) => rebuilt[key]) : rebuilt;
}

/** A dictionary back to the dotted rows the copy table stores. */
function flatten(value: unknown, trail: string[], into: Map<string, string>): void {
  if (typeof value === 'string') {
    into.set(trail.join('.'), value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, at) => flatten(item, [...trail, String(at)], into));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) flatten(nested, [...trail, key], into);
  }
}

export type Dictionaries = Record<Locale, Dictionary>;

export async function readCopy(db: D1Database): Promise<Dictionaries> {
  const rows = await db.prepare('SELECT * FROM copy ORDER BY key').all<CopyRow>();

  const forLocale = (locale: Locale): Dictionary =>
    unflatten(rows.results.map((row) => [row.key, row[locale]] as const)) as unknown as Dictionary;

  return { zh: forLocale('zh'), en: forLocale('en') };
}

export function deleteCopy(db: D1Database): D1PreparedStatement[] {
  return [db.prepare('DELETE FROM copy')];
}

export function insertCopy(db: D1Database, dictionaries: Dictionaries): D1PreparedStatement[] {
  const flattened: Record<Locale, Map<string, string>> = { zh: new Map(), en: new Map() };
  for (const locale of LOCALES) flatten(dictionaries[locale], [], flattened[locale]);

  // The union rather than one locale's keys: both dictionaries are the same
  // type and so always agree, but a key that somehow existed in only one of
  // them should arrive as a blank the validator can catch, not vanish.
  const keys = [...new Set([...flattened.zh.keys(), ...flattened.en.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  return keys.map((key) =>
    db
      .prepare('INSERT INTO copy (key, zh, en) VALUES (?, ?, ?)')
      .bind(key, flattened.zh.get(key) ?? '', flattened.en.get(key) ?? ''),
  );
}
