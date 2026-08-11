/**
 * The file registry: one row per original in the bucket.
 *
 * Deliberately outside the content unit of work. A photograph arrives before
 * the save that references it — that ordering is what lets the foreign keys
 * from `works`, `mentors` and `site_studio` into `media` stay on — so this is
 * never part of the batch that replaces the content.
 *
 * `width` and `height` are what the template turns into the aspect box that
 * holds a slot open before an image loads, so they are the numbers the site's
 * CLS budget rests on.
 */
import type { MediaRow } from '../models/rows';

export async function readMedia(db: D1Database): Promise<MediaRow[]> {
  const rows = await db
    .prepare('SELECT key, width, height, bytes FROM media ORDER BY key')
    .all<MediaRow>();
  return rows.results;
}

/**
 * Upsert rather than insert: replacing a photograph under the same key is a
 * normal thing for the studio to do, and it changes the dimensions.
 */
export async function recordMedia(db: D1Database, row: MediaRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media (key, width, height, bytes) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET width  = excluded.width,
                                       height = excluded.height,
                                       bytes  = excluded.bytes`,
    )
    .bind(row.key, row.width, row.height, row.bytes)
    .run();
}
