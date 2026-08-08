/**
 * The shape of CAFA-Template's content/*.json.
 *
 * This mirrors the template's `src/lib/types.ts`. It is a copy rather than an
 * import because the two repositories deploy separately, and a shared package
 * for six interfaces would cost more than it saves. The copy cannot drift
 * dangerously: the template parses every field again at build time, so a
 * mismatch here fails the draft build and never reaches the live site.
 */

export const LOCALES = ['zh', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export type LocalisedText = Record<Locale, string>;

export interface ImageRef {
  /** Path relative to media-source, e.g. "works/edible-house/01.jpg". */
  src: string;
  /** Required. The empty string is how a decorative image is declared. */
  alt: LocalisedText | '';
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

export type NavEntry =
  | { label: LocalisedText; route: string }
  | { label: LocalisedText; opens: string };

export interface SiteContent {
  name: LocalisedText;
  url: string;
  locales: Locale[];
  localeNames: Record<Locale, string>;
  nav: NavEntry[];
  studio: ImageRef[];
  contact: {
    email: string;
    wechat: string;
    address: LocalisedText;
    hours: LocalisedText;
  };
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
}

/** Everything the admin holds in memory, and the file each part came from. */
export interface ContentSet {
  site: SiteContent;
  works: Work[];
  programs: Program[];
  mentors: Mentor[];
  zh: Dictionary;
  en: Dictionary;
}

export const CONTENT_PATHS: Record<keyof ContentSet, string> = {
  site: 'src/content/site.json',
  works: 'src/content/works.json',
  programs: 'src/content/programs.json',
  mentors: 'src/content/mentors.json',
  zh: 'src/content/dictionaries/zh.json',
  en: 'src/content/dictionaries/en.json',
};

export const MEDIA_ROOT = 'media-source';

export function emptyLocalised(): LocalisedText {
  return { zh: '', en: '' };
}
