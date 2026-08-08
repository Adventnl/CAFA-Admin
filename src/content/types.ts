/**
 * The shape of the content the studio owns.
 *
 * This mirrors CAFA-Template's `src/lib/types.ts`, and deliberately diverges
 * from it in two places — both of which are the same idea, that the admin's
 * types should describe what the admin can actually change:
 *
 *  - **`SiteContent` has no `nav`, `locales` or `localeNames`.** Those are wired
 *    to the template's lib/routes.ts and to the deployment. worker/bundle.ts
 *    adds them when it builds a published revision, so the template still
 *    receives the complete record it expects.
 *  - **`Dictionary` has `nav` and `localeName`, which the template's does not.**
 *    The *shape* of the nav is code; the *words* in it are copy, and the studio
 *    should be able to rename an item without a deploy. They are stored as copy
 *    rows and lifted back out into `site` by worker/bundle.ts.
 *
 * The copy cannot drift dangerously in either direction: the template re-parses
 * every field at build time, so a mismatch fails the build and never reaches
 * the live site.
 */

export const LOCALES = ['zh', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export type LocalisedText = Record<Locale, string>;

export interface ImageRef {
  /** The R2 object key, e.g. "works/edible-house/01.jpg". */
  src: string;
  /** Required. The empty string is how a decorative image is declared. */
  alt: LocalisedText | '';
}

/** Measured from the file when it is uploaded, and never edited by hand. */
export interface MediaInfo {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export type WorkStatus = 'completed' | 'in-progress' | 'private';

export const WORK_STATUSES: readonly WorkStatus[] = ['completed', 'in-progress', 'private'];

export interface Credit {
  role: LocalisedText;
  name: LocalisedText;
}

export interface Work {
  slug: string;
  index: number;
  title: LocalisedText;
  status: WorkStatus;
  discipline: LocalisedText[];
  year: number;
  summary: LocalisedText;
  credits: Credit[];
  cover: ImageRef;
  media: ImageRef[];
}

export interface Program {
  slug: string;
  name: LocalisedText;
  audience: LocalisedText;
  duration: LocalisedText;
  summary: LocalisedText;
}

export interface Mentor {
  slug: string;
  name: LocalisedText;
  discipline: LocalisedText;
  note: LocalisedText;
  portrait: ImageRef;
}

export interface SiteContent {
  name: LocalisedText;
  url: string;
  studio: ImageRef[];
  contact: {
    email: string;
    wechat: string;
    address: LocalisedText;
    hours: LocalisedText;
  };
}

/** The nav items, by key. The order and the destinations live in the Worker. */
export interface NavCopy {
  works: string;
  programs: string;
  about: string;
  contact: string;
}

export interface Dictionary {
  meta: { title: string; titleTemplate: string; description: string };
  a11y: {
    skipToContent: string;
    primaryNav: string;
    localeSwitch: string;
    worksList: string;
    worksRail: string;
    workPager: string;
    close: string;
  };
  home: { statement: string; worksLink: string };
  works: { title: string; description: string; status: Record<WorkStatus, string> };
  work: {
    index: string;
    status: string;
    year: string;
    discipline: string;
    credits: string;
    previous: string;
    next: string;
  };
  programs: { title: string; description: string; intro: string };
  about: {
    title: string;
    description: string;
    body: string[];
    studioTitle: string;
    mentorsTitle: string;
  };
  contact: {
    title: string;
    email: string;
    wechat: string;
    address: string;
    hours: string;
    note: string;
  };
  notFound: { title: string; body: string; home: string };
  footer: { note: string };
  /** Chrome, lifted into `site` when a revision is published. */
  nav: NavCopy;
  /** What this language calls itself in the switch — "中文", "EN". */
  localeName: string;
}

/** Everything the admin holds in memory. */
export interface ContentSet {
  site: SiteContent;
  works: Work[];
  programs: Program[];
  mentors: Mentor[];
  zh: Dictionary;
  en: Dictionary;
}

export function emptyLocalised(): LocalisedText {
  return { zh: '', en: '' };
}
