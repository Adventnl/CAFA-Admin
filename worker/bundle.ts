/**
 * What the public site is built from.
 *
 * A published revision is not the editable content set — it is a projection of
 * it, and the difference is load-bearing in two ways.
 *
 * First, **a private work publishes nothing but its row in the index.** The
 * site lists private works and gives them no page; until now the guarantee that
 * their photographs never reach a browser lived in the frontend, in
 * `getIndexCovers`. Once the content set is fetchable over a public endpoint
 * that is the wrong place for it, so the cover and the media are dropped here,
 * where the data leaves the database.
 *
 * Second, **the parts of `site` that are not editable are added here.** The
 * locales, their names and the shape of the nav are wired to the template's
 * lib/routes.ts, so they are code rather than content — but the nav's *labels*
 * are copy, and the studio should be able to rename an item without a deploy.
 * They live in the copy table under `nav.*` and are lifted out into `site`
 * here, so the template's `Dictionary` type never has to know about them.
 */
import { LOCALES, type ContentSet, type Dictionary, type Work } from '../src/content/types';
import type { MediaRow } from './db';

/**
 * The nav, as structure. Each entry names a route or a panel in the template's
 * lib/routes.ts; the label is looked up from the copy key of the same name.
 * Adding an item here without adding its copy key is caught by the build.
 */
const NAV = [
  { key: 'works', route: 'works' },
  { key: 'programs', route: 'programs' },
  { key: 'about', route: 'about' },
  { key: 'contact', opens: 'contact' },
] as const;

/**
 * Copy that describes the chrome rather than a page, and is lifted into `site`
 * instead of staying in the dictionary.
 *
 * These are the keys as they appear *after* unflattening, so `nav.works` and
 * `nav.about` have already become one `nav` object by the time this is applied.
 */
const CHROME_KEYS = ['nav', 'localeName'];

export interface PublishedBundle {
  site: unknown;
  works: unknown;
  programs: unknown;
  mentors: unknown;
  dictionaries: { zh: unknown; en: unknown };
  /** Intrinsic dimensions, for the aspect box. Only what public content cites. */
  media: Record<string, { width: number; height: number }>;
  /** Where the originals live, so the template can build transform URLs. */
  mediaBase: string;
}

/** A dictionary minus the chrome keys, which belong to `site` instead. */
function pageCopy(dictionary: Dictionary): Record<string, unknown> {
  const record = dictionary as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !CHROME_KEYS.includes(key)));
}

/** The chrome copy, which was stored flat under `nav` and `localeName`. */
interface Chrome {
  nav: Record<string, string>;
  localeName: string;
}

function chromeOf(dictionary: Dictionary): Chrome {
  const record = dictionary as unknown as Record<string, unknown>;
  const nav = record.nav;
  return {
    nav: typeof nav === 'object' && nav !== null ? (nav as Record<string, string>) : {},
    localeName: typeof record.localeName === 'string' ? record.localeName : '',
  };
}

/**
 * A private work keeps only what the index draws: its number, its title, its
 * year, its disciplines and the fact that it is private. No cover, no media,
 * no URL for either.
 */
function project(work: Work): unknown {
  if (work.status !== 'private') return work;
  return {
    slug: work.slug,
    index: work.index,
    title: work.title,
    status: work.status,
    discipline: work.discipline,
    year: work.year,
    summary: work.summary,
    credits: work.credits,
    cover: { src: '', alt: '' },
    media: [],
  };
}

export function buildBundle(
  content: ContentSet,
  media: MediaRow[],
  mediaBase: string,
): PublishedBundle {
  const works = content.works.map(project);

  // Only the photographs public content actually cites. A private work's
  // originals are in the bucket and in the media table; they are not in here,
  // so nothing published names them.
  const cited = new Set<string>();
  for (const work of content.works) {
    if (work.status === 'private') continue;
    cited.add(work.cover.src);
    for (const image of work.media) cited.add(image.src);
  }
  for (const mentor of content.mentors) cited.add(mentor.portrait.src);
  for (const image of content.site.studio) cited.add(image.src);

  const dimensions: Record<string, { width: number; height: number }> = {};
  for (const row of media) {
    if (cited.has(row.key)) dimensions[row.key] = { width: row.width, height: row.height };
  }

  const zhChrome = chromeOf(content.zh);
  const enChrome = chromeOf(content.en);

  return {
    site: {
      ...content.site,
      locales: [...LOCALES],
      localeNames: { zh: zhChrome.localeName, en: enChrome.localeName },
      nav: NAV.map((entry) => {
        const label = { zh: zhChrome.nav[entry.key] ?? '', en: enChrome.nav[entry.key] ?? '' };
        return 'route' in entry ? { label, route: entry.route } : { label, opens: entry.opens };
      }),
    },
    works,
    programs: content.programs,
    mentors: content.mentors,
    dictionaries: { zh: pageCopy(content.zh), en: pageCopy(content.en) },
    media: dimensions,
    mediaBase,
  };
}
