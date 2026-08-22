/**
 * The rules, stated once, in the language of the person breaking them.
 *
 * The template validates the same things at build time and throws on the first
 * failure — right for a build, useless for a form. This collects every problem
 * at once and names each one where the editor can see it, so nothing is saved
 * that would fail the build and nobody has to read a stack trace to find out
 * which field was blank.
 *
 * A problem names its field and its fault as **phrases rather than sentences**:
 * a translation key and the numbers to fill it with. This module runs in two
 * places that cannot share a translator — the form, where react-i18next is
 * loaded, and the Worker, which has no UI at all and sends its problems back
 * over the wire — so the one thing both can produce is a key. `ui/ProblemList`
 * turns them into words in whichever language the studio is reading, which is
 * the whole point: the banner that appears when someone is stuck was the last
 * surface in this admin still speaking English at a Chinese studio.
 *
 * The keys are the form's own, wherever the form has one. A problem about a
 * work's title says `fields.title`, which is the label the studio was just
 * looking at — so the banner and the field it points to cannot drift apart, and
 * translating one translates the other.
 */
import {
  HEADING_KINDS,
  HOME_SLUG,
  LOCALES,
  SECTION_KINDS,
  WORK_STATUSES,
  type ContentSet,
  type Dictionary,
  type ImageRef,
  type LocalisedText,
  type Locale,
  type Page,
} from './types';

/**
 * Something to say, before anyone has decided which language to say it in.
 *
 * `values` may hold another phrase — "Cover (Chinese)" is one key filled with
 * two others — so the renderer resolves it depth-first. Nesting rather than
 * concatenation because the pieces do not join in the same order in both
 * languages, and a phrase built by `+` can only ever be right in one of them.
 */
export interface Phrase {
  key: string;
  values?: Record<string, string | number | Phrase>;
}

export interface Problem {
  section: keyof ContentSet;
  /**
   * The record the problem sits in — a slug, or a dictionary group's name. Data
   * rather than copy, so it is not a phrase. The front page's slug is the empty
   * string, and the list names it from `problems.record.frontPage`.
   */
  record: string;
  /** Which field, in the words the form uses for it. */
  label: Phrase;
  /** What is wrong with it. */
  message: Phrase;
}

/** A phrase, short enough to read inline at a call site. */
function say(key: string, values?: Phrase['values']): Phrase {
  return values === undefined ? { key } : { key, values };
}

/** The faults. One key each, so a new rule is a new line here and in the copy. */
const fault = {
  empty: say('problems.message.empty'),
  slugChars: say('problems.message.slugChars'),
  needsHeading: say('problems.message.needsHeading'),
  tooManyHeadings: say('problems.message.tooManyHeadings'),
  unknownKind: say('problems.message.unknownKind'),
  needsParagraph: say('problems.message.needsParagraph'),
  needsPhotograph: say('problems.message.needsPhotograph'),
  wholeNumber: say('problems.message.wholeNumber'),
  notAStatus: say('problems.message.notAStatus'),
  needsEntry: say('problems.message.needsEntry'),
  needsFrontPage: say('problems.message.needsFrontPage'),
  duplicatePage: (slug: string) => say('problems.message.duplicatePage', { slug }),
  duplicateWork: (slug: string) => say('problems.message.duplicateWork', { slug }),
} as const;

const LOCALE_LABEL: Record<Locale, Phrase> = {
  zh: say('problems.locale.zh'),
  en: say('problems.locale.en'),
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class Collector {
  readonly problems: Problem[] = [];

  constructor(
    private readonly section: keyof ContentSet,
    private readonly record: string,
  ) {}

  add(label: Phrase, message: Phrase): void {
    this.problems.push({ section: this.section, record: this.record, label, message });
  }

  text(value: string, label: Phrase): void {
    if (value.trim() === '') this.add(label, fault.empty);
  }

  localised(value: LocalisedText, label: Phrase): void {
    for (const locale of LOCALES) {
      if ((value[locale] ?? '').trim() === '') {
        this.add(say('problems.label.inLocale', { field: label, locale: LOCALE_LABEL[locale] }), fault.empty);
      }
    }
  }

  slug(value: string, label: Phrase): void {
    if (value.trim() === '') return this.add(label, fault.empty);
    if (!SLUG.test(value)) this.add(label, fault.slugChars);
  }

  /**
   * CLAUDE.md §10: alt text is required. A decorative image says so with an
   * empty alt; a half-filled one is the failure this catches.
   */
  image(value: ImageRef, label: Phrase): void {
    this.text(value.src, say('problems.label.imageFile', { field: label }));
    if (value.alt === '') return;
    this.localised(value.alt, say('problems.label.imageAlt', { field: label }));
  }
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function checkDictionary(dictionary: Dictionary, locale: Locale): Problem[] {
  const section: keyof ContentSet = locale;
  const problems: Problem[] = [];

  const walk = (value: unknown, trail: string[]): void => {
    if (typeof value === 'string') {
      if (value.trim() === '') {
        problems.push({
          section,
          record: trail[0] ?? 'text',
          // The trail is a path through the dictionary rather than a field name
          // the form has a label for, so it travels as a value inside a phrase
          // that does have one. It is the one label here that is not the
          // studio's own words for the field, and it is the one place where the
          // words belong to the schema rather than to a form.
          label: say('problems.label.siteText', { trail: trail.join(' › ') }),
          message: fault.empty,
        });
      }
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, nested] of Object.entries(value)) walk(nested, [...trail, key]);
    }
  };

  walk(dictionary, []);
  return problems;
}

/**
 * A page, and the two rules about a *set* of its parts that no column can hold.
 *
 * The h1 rule is the one worth stating out loud: `heading` sets the page's own
 * title as its h1 and `statement` sets its line as one, so exactly one of them
 * has to be on a page. Two is a broken document outline; none is a page a
 * screen reader cannot name. The template refuses to build either, and catching
 * it here means the editor is told which page rather than the build.
 */
function checkPage(page: Page): Problem[] {
  const check = new Collector('pages', page.slug);

  // The front page's address is the site's own, which the empty slug is the
  // spelling of. Every other page is a segment under the locale.
  if (page.slug !== HOME_SLUG) check.slug(page.slug, say('fields.webAddress'));
  check.localised(page.title, say('fields.title'));
  check.localised(page.description, say('fields.description'));
  if (page.navLabel !== null) check.localised(page.navLabel, say('fields.menuName'));

  const headings = page.sections.filter((section) => HEADING_KINDS.includes(section.kind));
  if (headings.length === 0) check.add(say('problems.label.sections'), fault.needsHeading);
  if (headings.length > 1) check.add(say('problems.label.sections'), fault.tooManyHeadings);

  page.sections.forEach((section, at) => {
    const number = at + 1;
    if (!SECTION_KINDS.includes(section.kind)) {
      return check.add(say('problems.label.section', { number }), fault.unknownKind);
    }
    switch (section.kind) {
      case 'statement':
        return check.localised(section.text, say('problems.label.sectionLine', { number }));
      case 'works-grid':
      case 'mentors':
        return check.localised(section.text, say('problems.label.sectionHeading', { number }));
      case 'prose':
        if (section.paragraphs.length === 0) {
          check.add(say('problems.label.section', { number }), fault.needsParagraph);
        }
        return section.paragraphs.forEach((paragraph, position) =>
          check.localised(
            paragraph,
            say('problems.label.sectionParagraph', { number, position: position + 1 }),
          ),
        );
      case 'gallery':
        if (section.images.length === 0) {
          check.add(say('problems.label.section', { number }), fault.needsPhotograph);
        }
        return section.images.forEach((image, position) =>
          check.image(
            image,
            say('problems.label.sectionPhotograph', { number, position: position + 1 }),
          ),
        );
      case 'heading':
      case 'works-index':
      case 'programs':
        return;
    }
  });

  return check.problems;
}

/**
 * The one rule this file cannot check on its own: that every photograph a
 * record names is actually in storage.
 *
 * A photograph is uploaded before the record pointing at it is saved, so the
 * `media` table is the list of files that exist and an image src that is not in
 * it is a foreign key waiting to fail. Separate from `checkContent` because it
 * needs that list, which the form has and the pure rules do not — the editor
 * passes what it has loaded, and the Worker passes what the table says.
 *
 * Without this the save still cannot corrupt anything: the constraint refuses
 * it. It just refuses it as `D1_ERROR: FOREIGN KEY constraint failed`, which is
 * a sentence for a developer reading logs rather than for the person who has to
 * fix it.
 */
export function checkImagesInStorage(content: ContentSet, keys: Iterable<string>): Problem[] {
  const known = new Set(keys);
  const problems: Problem[] = [];

  const check = (
    section: keyof ContentSet,
    record: string,
    label: Phrase,
    image: ImageRef,
  ): void => {
    if (image.src === '' || known.has(image.src)) return;
    problems.push({ section, record, label, message: say('problems.message.notInStorage', { file: image.src }) });
  };

  for (const page of content.pages) {
    page.sections.forEach((section, at) => {
      if (section.kind !== 'gallery') return;
      section.images.forEach((image, position) =>
        check(
          'pages',
          page.slug,
          say('problems.label.sectionPhotograph', { number: at + 1, position: position + 1 }),
          image,
        ),
      );
    });
  }

  for (const work of content.works) {
    check('works', work.slug, say('fields.cover'), work.cover);
    work.media.forEach((image, at) =>
      check('works', work.slug, say('works.photoNumber', { number: at + 1 }), image),
    );
  }

  for (const mentor of content.mentors) {
    check('mentors', mentor.slug, say('fields.portrait'), mentor.portrait);
  }

  return problems;
}

export function checkContent(content: ContentSet): Problem[] {
  const problems: Problem[] = [];

  for (const page of content.pages) problems.push(...checkPage(page));

  for (const slug of duplicates(content.pages.map((page) => page.slug))) {
    problems.push({
      section: 'pages',
      record: slug,
      label: say('fields.webAddress'),
      message: fault.duplicatePage(slug),
    });
  }

  // A site with no front page answers 404 at its own address, so this is not a
  // preference — it is the one page that cannot be deleted.
  const home = content.pages.filter((page) => page.slug === HOME_SLUG);
  if (home.length === 0) {
    problems.push({
      section: 'pages',
      record: HOME_SLUG,
      label: say('pages.pages'),
      message: fault.needsFrontPage,
    });
  }

  for (const work of content.works) {
    const check = new Collector('works', work.slug);
    check.slug(work.slug, say('fields.webAddress'));
    check.localised(work.title, say('fields.title'));
    check.localised(work.summary, say('fields.summary'));
    if (!Number.isInteger(work.year)) check.add(say('fields.year'), fault.wholeNumber);
    if (!Number.isInteger(work.index)) check.add(say('fields.number'), fault.wholeNumber);
    if (!WORK_STATUSES.includes(work.status)) check.add(say('fields.status'), fault.notAStatus);
    if (work.discipline.length === 0) check.add(say('fields.discipline'), fault.needsEntry);
    work.discipline.forEach((entry, at) =>
      check.localised(entry, say('works.disciplineNumber', { number: at + 1 })),
    );
    work.credits.forEach((credit, at) => {
      check.localised(credit.role, say('problems.label.creditRole', { number: at + 1 }));
      check.localised(credit.name, say('problems.label.creditName', { number: at + 1 }));
    });
    check.image(work.cover, say('fields.cover'));
    work.media.forEach((image, at) =>
      check.image(image, say('works.photoNumber', { number: at + 1 })),
    );
    problems.push(...check.problems);
  }

  for (const slug of duplicates(content.works.map((work) => work.slug))) {
    problems.push({
      section: 'works',
      record: slug,
      label: say('fields.webAddress'),
      message: fault.duplicateWork(slug),
    });
  }

  for (const program of content.programs) {
    const check = new Collector('programs', program.slug);
    check.slug(program.slug, say('fields.key'));
    check.localised(program.name, say('fields.name'));
    check.localised(program.audience, say('fields.audience'));
    check.localised(program.duration, say('fields.duration'));
    check.localised(program.summary, say('fields.summary'));
    problems.push(...check.problems);
  }

  for (const mentor of content.mentors) {
    const check = new Collector('mentors', mentor.slug);
    check.slug(mentor.slug, say('fields.key'));
    check.localised(mentor.name, say('fields.name'));
    check.localised(mentor.discipline, say('fields.discipline'));
    check.localised(mentor.note, say('fields.oneLine'));
    check.image(mentor.portrait, say('fields.portrait'));
    problems.push(...check.problems);
  }

  const site = new Collector('site', 'site');
  site.localised(content.site.name, say('fields.studioName'));
  site.text(content.site.contact.email, say('fields.email'));
  site.text(content.site.contact.wechat, say('fields.wechat'));
  site.localised(content.site.contact.address, say('fields.address'));
  site.localised(content.site.contact.hours, say('fields.hours'));
  problems.push(...site.problems);

  problems.push(...checkDictionary(content.zh, 'zh'));
  problems.push(...checkDictionary(content.en, 'en'));

  return problems;
}
