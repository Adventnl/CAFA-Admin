/**
 * What the public site is built from.
 *
 * A published revision is not the editable content set — it is a projection of
 * it, and the difference is load-bearing in two ways.
 *
 * First, **a private work publishes nothing but its row in the index.** The
 * site lists private works and gives them no page; the guarantee that their
 * photographs never reach a browser lives here, where the data leaves the
 * database, rather than in the frontend that draws them.
 *
 * Second, **the parts of `site` that are not editable are added here.** The
 * locales and their names are wired to the template's lib/routes.ts and to the
 * deployment, so they are code rather than content — but what a language calls
 * itself in the switch is a word on a screen, so it lives in the copy table as
 * `localeName` and is lifted out into `site` here.
 *
 * The nav used to be here too, as a hardcoded array of four items whose labels
 * were looked up from `nav.*` copy keys. It is gone, and that is the point of
 * this change: the bar is a projection of the pages now, derived by the
 * template from each page's `navLabel`, so nothing in this repository decides
 * which pages the site has or which of them the bar carries. Adding a page adds
 * a URL and, if it has a label, an item — with no deploy on either side.
 *
 * `url` is the same kind of thing as the locales, and arrives the same way. It
 * is the origin the site is deployed on — every canonical, hreflang, og:url and
 * sitemap entry in the template is resolved against it — so it belongs to the
 * deployment, not to the content. It comes from PRODUCTION_URL, which is the
 * same value the admin already polls for build-info.json: one origin, named
 * once. Migration 0002 dropped the column it used to have.
 */
import {
  SECTION_KINDS,
  LOCALES,
  type ContentSet,
  type Dictionary,
  type Work,
} from '../../src/content/types';
import type { MediaRow } from '../models/rows';

/**
 * The section kinds, for the document api.json compiles.
 *
 * Re-exported rather than retyped: a client generating types from the document
 * gets the real set, and a kind added to `PageSection` widens the document in
 * the same edit that widens the union.
 */
export const PAGE_SECTION_KINDS: readonly string[] = SECTION_KINDS;

/**
 * Copy that describes the chrome rather than a page, and is lifted into `site`
 * instead of staying in the dictionary.
 */
const CHROME_KEYS = ['localeName'];

export interface PublishedBundle {
  site: unknown;
  /**
   * Every page, in the studio's order — which is also the order of the nav bar,
   * since the template derives the bar from the pages that carry a `navLabel`.
   */
  pages: unknown;
  works: unknown;
  programs: unknown;
  mentors: unknown;
  dictionaries: { zh: unknown; en: unknown };
  /**
   * What was measured about each photograph the published content cites, and
   * nothing about the ones it does not: the intrinsic size the template holds
   * an aspect box open with, and the dominant hue it draws the works index's
   * hover band from. `tint` is null for a monochrome photograph and for one
   * uploaded before the admin measured such things; the site reads both as no
   * hue and uses its neutral band.
   */
  media: Record<string, { width: number; height: number; tint: number | null }>;
  /** Where the originals live, so the template can build transform URLs. */
  mediaBase: string;
  /**
   * Whether those URLs may go through `/cdn-cgi/image/`. False is not a
   * preference — it is a zone that cannot transform, and it tells the site to
   * point at the originals rather than at a path that answers 404.
   */
  mediaTransform: boolean;
}

/** A dictionary minus the chrome keys, which belong to `site` instead. */
function pageCopy(dictionary: Dictionary): Record<string, unknown> {
  const record = dictionary as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !CHROME_KEYS.includes(key)));
}

/** The chrome copy, which was stored flat under `localeName`. */
function localeNameOf(dictionary: Dictionary): string {
  const record = dictionary as unknown as Record<string, unknown>;
  return typeof record.localeName === 'string' ? record.localeName : '';
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

/**
 * `MEDIA_TRANSFORM`, as a decision rather than a string.
 *
 * Image Transformations are a zone setting, and on a Free zone it is readable
 * and not writable — no token and no API call turns it on. The site cannot see
 * the zone, so this is how it is told: absent means the documented setup, where
 * the zone transforms; the word `off` means it does not, and every photograph
 * should be requested straight from `mediaBase`.
 *
 * The asymmetry is deliberate. Only a value that plainly says off turns it off,
 * so a typo cannot quietly drop the whole site onto full-size originals — and
 * the opposite mistake, a var that says on for a zone that is not, is exactly
 * what `npm run media` fetches a real photograph to catch.
 */
export function transformsOn(value: string | undefined): boolean {
  const said = (value ?? '').trim().toLowerCase();
  return said !== 'off' && said !== 'false' && said !== '0';
}

export function buildBundle(
  content: ContentSet,
  media: MediaRow[],
  mediaBase: string,
  siteUrl: string,
  mediaTransform: string | undefined,
): PublishedBundle {
  const works = content.works.map(project);

  // Only the photographs public content actually cites. A private work's
  // originals are in the bucket and in the media table; they are not in here,
  // so nothing published names them — not their size, not their colour.
  const cited = new Set<string>();
  for (const work of content.works) {
    if (work.status === 'private') continue;
    cited.add(work.cover.src);
    for (const image of work.media) cited.add(image.src);
  }
  for (const mentor of content.mentors) cited.add(mentor.portrait.src);
  for (const page of content.pages) {
    for (const section of page.sections) {
      if (section.kind !== 'gallery') continue;
      for (const image of section.images) cited.add(image.src);
    }
  }

  const measured: PublishedBundle['media'] = {};
  for (const row of media) {
    if (cited.has(row.key)) {
      measured[row.key] = { width: row.width, height: row.height, tint: row.tint };
    }
  }

  return {
    site: {
      ...content.site,
      // Trailing slash stripped for the same reason lib/media.ts strips one off
      // mediaBase: everything downstream resolves against it, and `new URL()`
      // against a base ending in a slash is not the same URL.
      url: siteUrl.replace(/\/$/, ''),
      locales: [...LOCALES],
      localeNames: { zh: localeNameOf(content.zh), en: localeNameOf(content.en) },
    },
    pages: content.pages,
    works,
    programs: content.programs,
    mentors: content.mentors,
    dictionaries: { zh: pageCopy(content.zh), en: pageCopy(content.en) },
    media: measured,
    mediaBase,
    mediaTransform: transformsOn(mediaTransform),
  };
}
