/**
 * The pages, and the sections under them.
 *
 * Four tables and the deepest aggregate here: a page has sections, and two
 * kinds of section have rows of their own — paragraphs and photographs. They
 * are keyed by `(page_slug, section_position)` rather than by an id of their
 * own, because a section has no identity beyond where it sits on its page.
 * That is the same decision `work_discipline` and `work_credit` took, one level
 * deeper, and it is what lets the whole set be replaced on every save without
 * anything having to match old rows to new ones.
 *
 * A section's *kind* decides which of those child tables it reads, which is why
 * `read` groups all of them once and then hands each section its own slice —
 * three queries and a lookup, rather than a query per section.
 */
import {
  SECTION_KINDS,
  type ImageRef,
  type LocalisedText,
  type Page,
  type PageSection,
  type SectionKind,
} from '../../src/content/types';
import type {
  PageRow,
  PageSectionRow,
  SectionMediaRow,
  SectionParagraphRow,
} from '../models/rows';
import { groupBy, imageBindings, imageRef, pair } from './mapping';

/** `slug|position`: a section's whole identity, as a key its children group by. */
function sectionKey(pageSlug: string, position: number): string {
  return `${pageSlug}|${position}`;
}

function isSectionKind(value: string): value is SectionKind {
  return SECTION_KINDS.some((known) => known === value);
}

/**
 * A row plus its children, as the union the rest of the admin works in.
 *
 * A kind the code does not know is the one thing that can arrive here and not
 * fit. It cannot come from this admin — the editor only ever writes the eight
 * — so it means a row was written by hand or by an older deploy, and the honest
 * answer is to say so rather than to render a page with a hole in it.
 */
function section(
  row: PageSectionRow,
  paragraphs: readonly SectionParagraphRow[],
  media: readonly SectionMediaRow[],
): PageSection {
  if (!isSectionKind(row.kind)) {
    throw new Error(`Unknown section kind "${row.kind}" on page "${row.page_slug}".`);
  }

  const text: LocalisedText = pair(row.text_zh, row.text_en);

  switch (row.kind) {
    case 'heading':
    case 'works-index':
    case 'programs':
      return { kind: row.kind };
    case 'statement':
    case 'works-grid':
    case 'mentors':
      return { kind: row.kind, text };
    case 'prose':
      return { kind: row.kind, paragraphs: paragraphs.map((entry) => pair(entry.zh, entry.en)) };
    case 'gallery':
      return {
        kind: row.kind,
        images: media.map((entry) =>
          imageRef(entry.media_key, entry.alt_zh, entry.alt_en, entry.decorative),
        ),
      };
  }
}

export async function readPages(db: D1Database): Promise<Page[]> {
  const [pages, sections, paragraphs, media] = await Promise.all([
    db.prepare('SELECT * FROM pages ORDER BY position').all<PageRow>(),
    db.prepare('SELECT * FROM page_section ORDER BY page_slug, position').all<PageSectionRow>(),
    db
      .prepare(
        'SELECT * FROM section_paragraph ORDER BY page_slug, section_position, position',
      )
      .all<SectionParagraphRow>(),
    db
      .prepare('SELECT * FROM section_media ORDER BY page_slug, section_position, position')
      .all<SectionMediaRow>(),
  ]);

  const bySection = groupBy(sections.results, (row) => row.page_slug);
  const proseBySection = groupBy(paragraphs.results, (row) =>
    sectionKey(row.page_slug, row.section_position),
  );
  const mediaBySection = groupBy(media.results, (row) =>
    sectionKey(row.page_slug, row.section_position),
  );

  return pages.results.map((row) => ({
    slug: row.slug,
    title: pair(row.title_zh, row.title_en),
    description: pair(row.description_zh, row.description_en),
    navLabel: row.in_nav === 1 ? pair(row.nav_zh, row.nav_en) : null,
    sections: (bySection.get(row.slug) ?? []).map((entry) =>
      section(
        entry,
        proseBySection.get(sectionKey(row.slug, entry.position)) ?? [],
        mediaBySection.get(sectionKey(row.slug, entry.position)) ?? [],
      ),
    ),
  }));
}

/** Children before parents, so no statement in the batch leaves a dangling row. */
export function deletePages(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM section_media'),
    db.prepare('DELETE FROM section_paragraph'),
    db.prepare('DELETE FROM page_section'),
    db.prepare('DELETE FROM pages'),
  ];
}

export function insertPages(db: D1Database, pages: readonly Page[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  pages.forEach((page, at) => {
    const nav = page.navLabel;
    statements.push(
      db
        .prepare(
          `INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,
                              in_nav, nav_zh, nav_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          page.slug,
          at,
          page.title.zh,
          page.title.en,
          page.description.zh,
          page.description.en,
          nav === null ? 0 : 1,
          nav?.zh ?? '',
          nav?.en ?? '',
        ),
    );

    page.sections.forEach((entry, position) => {
      // `text` is the one column two kinds fill and six leave blank, which is
      // why it is read off the union rather than spread: the compiler knows
      // which kinds have it and this is where that knowledge is spent.
      const text = 'text' in entry ? entry.text : { zh: '', en: '' };
      statements.push(
        db
          .prepare(
            `INSERT INTO page_section (page_slug, position, kind, text_zh, text_en)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(page.slug, position, entry.kind, text.zh, text.en),
      );

      if (entry.kind === 'prose') {
        entry.paragraphs.forEach((paragraph, at) => {
          statements.push(
            db
              .prepare(
                `INSERT INTO section_paragraph (page_slug, section_position, position, zh, en)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .bind(page.slug, position, at, paragraph.zh, paragraph.en),
          );
        });
      }

      if (entry.kind === 'gallery') {
        entry.images.forEach((image: ImageRef, at) => {
          statements.push(
            db
              .prepare(
                `INSERT INTO section_media (page_slug, section_position, position, media_key,
                                            alt_zh, alt_en, decorative)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(page.slug, position, at, ...imageBindings(image)),
          );
        });
      }
    });
  });

  return statements;
}
