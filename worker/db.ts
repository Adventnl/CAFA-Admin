/**
 * The database, as a content set.
 *
 * Everything above this file — the editors, the validator, the publish bar —
 * works on one `ContentSet` held whole in memory. That was true when the
 * content was six JSON files and it stays true now: this module is the only
 * place that knows the content is really eleven tables.
 *
 * Writes are one `batch()`, which D1 runs as a single transaction. There are no
 * interactive transactions to reach for, and at twenty records a whole-content
 * replace is both simpler than diffing and immune to the ordering bugs diffing
 * invites. The delete order is children-then-parents and the insert order is the
 * reverse, so no statement in the batch ever leaves a dangling reference.
 *
 * `media` is deliberately not touched here. Photographs arrive through
 * worker/media.ts before the save that references them, which is what lets the
 * foreign keys stay on.
 */
import type {
  ContentSet,
  Dictionary,
  ImageRef,
  Locale,
  LocalisedText,
  Mentor,
  Program,
  SiteContent,
  Work,
  WorkStatus,
} from '../src/content/types';

interface SiteRow {
  name_zh: string;
  name_en: string;
  contact_email: string;
  contact_wechat: string;
  address_zh: string;
  address_en: string;
  hours_zh: string;
  hours_en: string;
}

interface WorkRow {
  slug: string;
  index_no: number;
  title_zh: string;
  title_en: string;
  status: string;
  year: number;
  summary_zh: string;
  summary_en: string;
  cover_key: string;
  cover_alt_zh: string;
  cover_alt_en: string;
  cover_decorative: number;
}

interface DisciplineRow {
  work_slug: string;
  zh: string;
  en: string;
}

interface CreditRow {
  work_slug: string;
  role_zh: string;
  role_en: string;
  name_zh: string;
  name_en: string;
}

interface WorkMediaRow {
  work_slug: string;
  media_key: string;
  alt_zh: string;
  alt_en: string;
  decorative: number;
}

interface ProgramRow {
  slug: string;
  name_zh: string;
  name_en: string;
  audience_zh: string;
  audience_en: string;
  duration_zh: string;
  duration_en: string;
  summary_zh: string;
  summary_en: string;
}

interface MentorRow {
  slug: string;
  name_zh: string;
  name_en: string;
  discipline_zh: string;
  discipline_en: string;
  note_zh: string;
  note_en: string;
  portrait_key: string;
  portrait_alt_zh: string;
  portrait_alt_en: string;
  portrait_decorative: number;
}

interface StudioRow {
  media_key: string;
  alt_zh: string;
  alt_en: string;
  decorative: number;
}

interface CopyRow {
  key: string;
  zh: string;
  en: string;
}

export interface MediaRow {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

const pair = (zh: string, en: string): LocalisedText => ({ zh, en });

/**
 * Four columns back into an ImageRef. `decorative` is what distinguishes a
 * deliberate empty alt from a forgotten one — the schema refuses the second,
 * so by the time a row is read only the first is possible.
 */
function imageRef(key: string, altZh: string, altEn: string, decorative: number): ImageRef {
  return { src: key, alt: decorative === 1 ? '' : pair(altZh, altEn) };
}

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

/** Rows grouped by the column that owns them, preserving the query's order. */
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const owner = key(row);
    const existing = grouped.get(owner);
    if (existing === undefined) grouped.set(owner, [row]);
    else existing.push(row);
  }
  return grouped;
}

/**
 * Dotted copy keys back into the nested object the dictionary type describes.
 * A run of consecutive integer segments rebuilds as an array, which is what
 * carries `about.body` across the round trip as a list of paragraphs rather
 * than an object with numeric keys.
 */
function unflatten(entries: [string, string][]): Record<string, unknown> {
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

  const looksLikeArray =
    keys.length > 0 && keys.every((key, at) => key === String(at));
  return looksLikeArray ? keys.map((key) => rebuilt[key]) : rebuilt;
}

/**
 * The whole editable content set, in one round of concurrent reads.
 *
 * `position` is the editorial order everywhere it appears — it is what the
 * studio moves with the arrows in the works list, and it is not derived from
 * year, slug or index.
 */
export async function readContent(db: D1Database): Promise<ContentSet> {
  const [site, works, disciplines, credits, workMedia, programs, mentors, studio, copy] =
    await Promise.all([
      db.prepare('SELECT * FROM site WHERE id = 1').first<SiteRow>(),
      db.prepare('SELECT * FROM works ORDER BY position').all<WorkRow>(),
      db.prepare('SELECT * FROM work_discipline ORDER BY work_slug, position').all<DisciplineRow>(),
      db.prepare('SELECT * FROM work_credit ORDER BY work_slug, position').all<CreditRow>(),
      db.prepare('SELECT * FROM work_media ORDER BY work_slug, position').all<WorkMediaRow>(),
      db.prepare('SELECT * FROM programs ORDER BY position').all<ProgramRow>(),
      db.prepare('SELECT * FROM mentors ORDER BY position').all<MentorRow>(),
      db.prepare('SELECT * FROM site_studio ORDER BY position').all<StudioRow>(),
      db.prepare('SELECT * FROM copy ORDER BY key').all<CopyRow>(),
    ]);

  if (site === null) throw new Error('The site row is missing. Has the seed been run?');

  const byWork = {
    discipline: groupBy(disciplines.results, (row) => row.work_slug),
    credits: groupBy(credits.results, (row) => row.work_slug),
    media: groupBy(workMedia.results, (row) => row.work_slug),
  };

  const parsedWorks: Work[] = works.results.map((row) => ({
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

  const parsedPrograms: Program[] = programs.results.map((row) => ({
    slug: row.slug,
    name: pair(row.name_zh, row.name_en),
    audience: pair(row.audience_zh, row.audience_en),
    duration: pair(row.duration_zh, row.duration_en),
    summary: pair(row.summary_zh, row.summary_en),
  }));

  const parsedMentors: Mentor[] = mentors.results.map((row) => ({
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

  const parsedSite: SiteContent = {
    name: pair(site.name_zh, site.name_en),
    studio: studio.results.map((row) =>
      imageRef(row.media_key, row.alt_zh, row.alt_en, row.decorative),
    ),
    contact: {
      email: site.contact_email,
      wechat: site.contact_wechat,
      address: pair(site.address_zh, site.address_en),
      hours: pair(site.hours_zh, site.hours_en),
    },
  };

  const dictionary = (locale: Locale): Dictionary =>
    unflatten(copy.results.map((row) => [row.key, row[locale]])) as unknown as Dictionary;

  return {
    site: parsedSite,
    works: parsedWorks,
    programs: parsedPrograms,
    mentors: parsedMentors,
    zh: dictionary('zh'),
    en: dictionary('en'),
  };
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

/** The four columns an ImageRef occupies, ready to bind. */
function imageBindings(image: ImageRef): [string, string, string, number] {
  if (image.alt === '') return [image.src, '', '', 1];
  return [image.src, image.alt.zh, image.alt.en, 0];
}

/**
 * The whole content set, replaced in one transaction.
 *
 * Deletes run children-first and inserts run parents-first, so no intermediate
 * state in the batch has a row pointing at something that is not there. That is
 * why this needs no `defer_foreign_keys`.
 */
export async function writeContent(db: D1Database, content: ContentSet): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM work_media'),
    db.prepare('DELETE FROM work_credit'),
    db.prepare('DELETE FROM work_discipline'),
    db.prepare('DELETE FROM site_studio'),
    db.prepare('DELETE FROM works'),
    db.prepare('DELETE FROM programs'),
    db.prepare('DELETE FROM mentors'),
    db.prepare('DELETE FROM copy'),
    db.prepare('DELETE FROM site'),
  ];

  statements.push(
    db
      .prepare(
        `INSERT INTO site (id, name_zh, name_en, contact_email, contact_wechat,
                           address_zh, address_en, hours_zh, hours_en)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        content.site.name.zh,
        content.site.name.en,
        content.site.contact.email,
        content.site.contact.wechat,
        content.site.contact.address.zh,
        content.site.contact.address.en,
        content.site.contact.hours.zh,
        content.site.contact.hours.en,
      ),
  );

  content.site.studio.forEach((image, at) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO site_studio (position, media_key, alt_zh, alt_en, decorative)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(at, ...imageBindings(image)),
    );
  });

  content.works.forEach((work, at) => {
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
          .prepare(
            'INSERT INTO work_discipline (work_slug, position, zh, en) VALUES (?, ?, ?, ?)',
          )
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
          .bind(work.slug, position, credit.role.zh, credit.role.en, credit.name.zh, credit.name.en),
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

  content.programs.forEach((program, at) => {
    statements.push(
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
  });

  content.mentors.forEach((mentor, at) => {
    statements.push(
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
  });

  const zh = new Map<string, string>();
  const en = new Map<string, string>();
  flatten(content.zh, [], zh);
  flatten(content.en, [], en);

  for (const [key, value] of [...zh].sort(([a], [b]) => a.localeCompare(b))) {
    statements.push(
      db.prepare('INSERT INTO copy (key, zh, en) VALUES (?, ?, ?)').bind(key, value, en.get(key) ?? ''),
    );
  }

  await db.batch(statements);
}

/** Intrinsic dimensions for every photograph, which is all the build needs. */
export async function readMedia(db: D1Database): Promise<MediaRow[]> {
  const rows = await db.prepare('SELECT key, width, height, bytes FROM media ORDER BY key').all<MediaRow>();
  return rows.results;
}

export async function recordMedia(db: D1Database, row: MediaRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media (key, width, height, bytes) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET width = excluded.width,
                                       height = excluded.height,
                                       bytes = excluded.bytes`,
    )
    .bind(row.key, row.width, row.height, row.bytes)
    .run();
}
