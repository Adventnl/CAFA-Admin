/**
 * Mentors. One table, with a portrait that references the media registry — so
 * the photograph has to be uploaded before the save that names it, which is
 * what lets the foreign key stay on.
 */
import type { Mentor } from '../../src/content/types';
import type { MentorRow } from '../models/rows';
import { imageBindings, imageRef, pair } from './mapping';

export async function readMentors(db: D1Database): Promise<Mentor[]> {
  const rows = await db.prepare('SELECT * FROM mentors ORDER BY position').all<MentorRow>();

  return rows.results.map((row) => ({
    slug: row.slug,
    name: pair(row.name_zh, row.name_en),
    discipline: pair(row.discipline_zh, row.discipline_en),
    note: pair(row.note_zh, row.note_en),
    portrait: imageRef(
      row.portrait_key,
      row.portrait_alt_zh,
      row.portrait_alt_en,
      row.portrait_decorative,
    ),
  }));
}

export function deleteMentors(db: D1Database): D1PreparedStatement[] {
  return [db.prepare('DELETE FROM mentors')];
}

export function insertMentors(db: D1Database, mentors: readonly Mentor[]): D1PreparedStatement[] {
  return mentors.map((mentor, at) =>
    db
      .prepare(
        `INSERT INTO mentors (slug, position, name_zh, name_en, discipline_zh, discipline_en,
                              note_zh, note_en, portrait_key, portrait_alt_zh, portrait_alt_en,
                              portrait_decorative)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        mentor.slug,
        at,
        mentor.name.zh,
        mentor.name.en,
        mentor.discipline.zh,
        mentor.discipline.en,
        mentor.note.zh,
        mentor.note.en,
        ...imageBindings(mentor.portrait),
      ),
  );
}
