/**
 * Published revisions — the append-only history that replaced the git commit.
 *
 * Nothing here updates or deletes. Rolling back inserts a *new* revision holding
 * an old one's content, so anything that was ever live stays recoverable and the
 * production build can keep reading "the newest row" with no special case.
 */
import type { RevisionRow } from '../models/rows';

export type RevisionSummary = Omit<RevisionRow, 'content'>;

/** What the production build reads. */
export async function newestRevision(db: D1Database): Promise<RevisionRow | null> {
  return db.prepare('SELECT * FROM revision ORDER BY id DESC LIMIT 1').first<RevisionRow>();
}

export async function findRevision(db: D1Database, id: number): Promise<RevisionRow | null> {
  return db.prepare('SELECT * FROM revision WHERE id = ?').bind(id).first<RevisionRow>();
}

/**
 * The list the studio picks a rollback from. Capped because the sidebar shows a
 * history, not an archive, and the content column is deliberately not selected —
 * it is ~39 KB a row and nothing on that screen draws it.
 */
export async function listRevisions(db: D1Database, limit = 50): Promise<RevisionSummary[]> {
  const rows = await db
    .prepare('SELECT id, message, published_at, published_by FROM revision ORDER BY id DESC LIMIT ?')
    .bind(limit)
    .all<RevisionSummary>();
  return rows.results;
}

export async function insertRevision(
  db: D1Database,
  revision: { content: string; message: string; publishedBy: string },
): Promise<number> {
  const created = await db
    .prepare('INSERT INTO revision (content, message, published_by) VALUES (?, ?, ?) RETURNING id')
    .bind(revision.content, revision.message, revision.publishedBy)
    .first<{ id: number }>();

  if (created === null) throw new Error('The revision could not be written.');
  return created.id;
}
