/**
 * Programmes. One table, no children — the simplest aggregate here, and the
 * one worth reading first to see the shape the other repositories follow.
 */
import type { Program } from '../../src/content/types';
import type { ProgramRow } from '../models/rows';
import { pair } from './mapping';

export async function readPrograms(db: D1Database): Promise<Program[]> {
  const rows = await db.prepare('SELECT * FROM programs ORDER BY position').all<ProgramRow>();

  return rows.results.map((row) => ({
    slug: row.slug,
    name: pair(row.name_zh, row.name_en),
    audience: pair(row.audience_zh, row.audience_en),
    duration: pair(row.duration_zh, row.duration_en),
    summary: pair(row.summary_zh, row.summary_en),
  }));
}

export function deletePrograms(db: D1Database): D1PreparedStatement[] {
  return [db.prepare('DELETE FROM programs')];
}

export function insertPrograms(
  db: D1Database,
  programs: readonly Program[],
): D1PreparedStatement[] {
  return programs.map((program, at) =>
    db
      .prepare(
        `INSERT INTO programs (slug, position, name_zh, name_en, audience_zh, audience_en,
                               duration_zh, duration_en, summary_zh, summary_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        program.slug,
        at,
        program.name.zh,
        program.name.en,
        program.audience.zh,
        program.audience.en,
        program.duration.zh,
        program.duration.en,
        program.summary.zh,
        program.summary.en,
      ),
  );
}
