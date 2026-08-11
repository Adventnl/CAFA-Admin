/**
 * Works, and the three tables that hang off them.
 *
 * A work is one aggregate spread over four tables — the row, its disciplines,
 * its credits and its media — so they are read and written together and never
 * apart. `position` is the editorial order the studio sets with the arrows in
 * the works list; it is not derived from year, slug or index.
 *
 * Deletes and inserts are returned as statements rather than executed, because
 * the whole content set is replaced in a single D1 batch. See
 * worker/repositories/content.repository.ts for the ordering that makes that safe.
 */
import type { Work, WorkStatus } from '../../src/content/types';
import type { CreditRow, DisciplineRow, WorkMediaRow, WorkRow } from '../models/rows';
import { groupBy, imageBindings, imageRef, pair } from './mapping';

const STATUSES: readonly WorkStatus[] = ['completed', 'in-progress', 'private'];

/**
 * The column is CHECK-constrained to these three, so a row that is not one of
 * them means the schema and this file have drifted — which is worth a throw
 * rather than a silent default.
 */
function workStatus(value: string): WorkStatus {
  const found = STATUSES.find((known) => known === value);
  if (found === undefined) throw new Error(`Unknown work status "${value}" in the database`);
  return found;
}

export async function readWorks(db: D1Database): Promise<Work[]> {
  const [works, disciplines, credits, media] = await Promise.all([
    db.prepare('SELECT * FROM works ORDER BY position').all<WorkRow>(),
    db.prepare('SELECT * FROM work_discipline ORDER BY work_slug, position').all<DisciplineRow>(),
    db.prepare('SELECT * FROM work_credit ORDER BY work_slug, position').all<CreditRow>(),
    db.prepare('SELECT * FROM work_media ORDER BY work_slug, position').all<WorkMediaRow>(),
  ]);

  const byWork = {
    discipline: groupBy(disciplines.results, (row) => row.work_slug),
    credits: groupBy(credits.results, (row) => row.work_slug),
    media: groupBy(media.results, (row) => row.work_slug),
  };

  return works.results.map((row) => ({
    slug: row.slug,
    index: row.index_no,
    title: pair(row.title_zh, row.title_en),
    status: workStatus(row.status),
    year: row.year,
    summary: pair(row.summary_zh, row.summary_en),
    discipline: (byWork.discipline.get(row.slug) ?? []).map((entry) => pair(entry.zh, entry.en)),
    credits: (byWork.credits.get(row.slug) ?? []).map((entry) => ({
      role: pair(entry.role_zh, entry.role_en),
      name: pair(entry.name_zh, entry.name_en),
    })),
    cover: imageRef(row.cover_key, row.cover_alt_zh, row.cover_alt_en, row.cover_decorative),
    media: (byWork.media.get(row.slug) ?? []).map((entry) =>
      imageRef(entry.media_key, entry.alt_zh, entry.alt_en, entry.decorative),
    ),
  }));
}

/** Children before the parent they reference. */
export function deleteWorks(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM work_media'),
    db.prepare('DELETE FROM work_credit'),
    db.prepare('DELETE FROM work_discipline'),
    db.prepare('DELETE FROM works'),
  ];
}

/** The parent before the children that reference it. */
export function insertWorks(db: D1Database, works: readonly Work[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  works.forEach((work, at) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO works (slug, position, index_no, title_zh, title_en, status, year,
                              summary_zh, summary_en, cover_key, cover_alt_zh, cover_alt_en,
                              cover_decorative)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          work.slug,
          at,
          work.index,
          work.title.zh,
          work.title.en,
          work.status,
          work.year,
          work.summary.zh,
          work.summary.en,
          ...imageBindings(work.cover),
        ),
    );

    work.discipline.forEach((entry, position) => {
      statements.push(
        db
          .prepare('INSERT INTO work_discipline (work_slug, position, zh, en) VALUES (?, ?, ?, ?)')
          .bind(work.slug, position, entry.zh, entry.en),
      );
    });

    work.credits.forEach((credit, position) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO work_credit (work_slug, position, role_zh, role_en, name_zh, name_en)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            work.slug,
            position,
            credit.role.zh,
            credit.role.en,
            credit.name.zh,
            credit.name.en,
          ),
      );
    });

    work.media.forEach((image, position) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO work_media (work_slug, position, media_key, alt_zh, alt_en, decorative)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(work.slug, position, ...imageBindings(image)),
      );
    });
  });

  return statements;
}
