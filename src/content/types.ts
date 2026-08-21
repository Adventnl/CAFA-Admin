/**
 * The shape of the content the studio owns.
 *
 * This mirrors CAFA-Template's `src/lib/types.ts`, and deliberately diverges
 * from it in two places — both of which are the same idea, that the admin's
 * types should describe what the admin can actually change:
 *
 *  - **`SiteContent` has no `locales` or `localeNames`.** Those are wired to the
 *    template's lib/routes.ts and to the deployment. worker/domain/bundle.ts
 *    adds them when it builds a published revision, so the template still
 *    receives the complete record it expects.
 *  - **`Dictionary` has `localeName`, which the template's does not.** What a
 *    language calls itself in the switch is a word on a screen, so the studio
 *    should be able to change it without a deploy. It is stored as a copy row
 *    and lifted back out into `site` by worker/domain/bundle.ts.
 *
 * The nav used to be the third divergence and is not one any more: it is a
 * projection of the pages now, built by the template from `navLabel`, so
 * nothing here or there holds a second list that could disagree with the first.
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
  /**
   * The dominant hue, in degrees on the OKLCH colour circle, or null where the
   * photograph has none — it is monochrome, or it was uploaded before the admin
   * measured such things. The template draws the works index's hover band from
   * it and falls back to a neutral one when it is null.
   */
  tint: number | null;
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

/**
 * A block on a page, and the unit a page is composed out of.
 *
 * **Every kind is exactly one component in CAFA-Template, and every component
 * that can stand on a page is exactly one kind.** That correspondence is what
 * makes this editor worth having: a page is a row with a list of these under it
 * rather than a file in a git repository, so adding a block, reordering two or
 * deleting one is a save here. Adding a *kind* is still code over there, and
 * correctly so — a kind nothing draws is a blank on a page.
 *
 * A discriminated union rather than one shape with eight optional fields, so
 * every form below knows exactly which fields the kind it is editing has.
 *
 * `text` is the section's own line of copy, and the kinds that carry one mean
 * different things by it — a front page's statement is a sentence, a grid's
 * heading is a word or two. They share the field because they share the shape.
 */
export type PageSection =
  /** The page's own title, set as its h1. */
  | { kind: 'heading' }
  /** One line, centred, holding the first screen on its own. */
  | { kind: 'statement'; text: LocalisedText }
  /** Prose, one entry per paragraph. */
  | { kind: 'prose'; paragraphs: LocalisedText[] }
  /** Photographs, full bleed, one at a time. */
  | { kind: 'gallery'; images: ImageRef[] }
  /** Every work as a row of numbers and titles. */
  | { kind: 'works-index' }
  /** The published works as a grid of covers. */
  | { kind: 'works-grid'; text: LocalisedText }
  /** Every programme, one screen at a time. */
  | { kind: 'programs' }
  /** The mentors, read across a pinned window. */
  | { kind: 'mentors'; text: LocalisedText };

export type SectionKind = PageSection['kind'];

/**
 * The kinds, in the order the "add a section" menu offers them, which is
 * roughly the order a page is built in. Derived nowhere: this is the list, and
 * `satisfies` is what keeps it the same list the union is.
 */
export const SECTION_KINDS = [
  'heading',
  'statement',
  'prose',
  'gallery',
  'works-index',
  'works-grid',
  'programs',
  'mentors',
] as const satisfies readonly SectionKind[];

/** The two kinds that set a page's h1. Exactly one per page — see validate.ts. */
export const HEADING_KINDS: readonly SectionKind[] = ['heading', 'statement'];

/** The front page's slug. It is a page like the others, at the site's own address. */
export const HOME_SLUG = '';

export interface Page {
  slug: string;
  title: LocalisedText;
  description: LocalisedText;
  /** The word in the nav bar, or null for a page the bar does not carry. */
  navLabel: LocalisedText | null;
  sections: PageSection[];
}

/**
 * No `url`. The site's origin is deployment configuration rather than content —
 * it comes from the PRODUCTION_URL var and is stamped into the published bundle
 * by worker/domain/bundle.ts, which is also where the reasoning lives.
 *
 * No `studio` either. The studio photographs are a `gallery` section on the
 * front page now, which is the same photographs with one owner instead of two.
 */
export interface SiteContent {
  name: LocalisedText;
  contact: {
    email: string;
    wechat: string;
    address: LocalisedText;
    hours: LocalisedText;
  };
}

/**
 * The words on the chrome — everything that is not a page, a work, a programme
 * or a person.
 *
 * What is *not* here is as deliberate as what is. A page's title, its prose and
 * the headings over its sections belong to a page that can be deleted, so they
 * are fields on `Page`; the pager on a work, the labels a screen reader hears,
 * the contact card and the footer outlive every page, so they are copy. A key
 * exists because a component in the template reads it by name, which is why the
 * set is fixed: the admin edits values and never adds or removes keys.
 */
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
  /** The three words for a work's state, read by the index and by a work page. */
  works: { status: Record<WorkStatus, string> };
  work: {
    index: string;
    status: string;
    year: string;
    discipline: string;
    credits: string;
    previous: string;
    next: string;
  };
  contact: {
    /** The word in the nav bar that opens the card. The one nav label that is
        copy rather than a page, because the card is not a page. */
    nav: string;
    title: string;
    email: string;
    wechat: string;
    address: string;
    hours: string;
    note: string;
    /** The message form: two field labels, the subject the reader's mail client
        opens with, and the word on the button. */
    from: string;
    message: string;
    subject: string;
    send: string;
  };
  notFound: { title: string; body: string; home: string };
  footer: { note: string };
  /** Chrome, lifted into `site` when a revision is published. */
  localeName: string;
}

/** Everything the admin holds in memory. */
export interface ContentSet {
  site: SiteContent;
  pages: Page[];
  works: Work[];
  programs: Program[];
  mentors: Mentor[];
  zh: Dictionary;
  en: Dictionary;
}

export function emptyLocalised(): LocalisedText {
  return { zh: '', en: '' };
}
