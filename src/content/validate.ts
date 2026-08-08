/**
 * The rules, stated once, in the language of the person breaking them.
 *
 * The template validates the same things at build time and throws on the first
 * failure — right for a build, useless for a form. This collects every problem
 * at once and names each one where the editor can see it, so nothing is saved
 * that would fail the build and nobody has to read a stack trace to find out
 * which field was blank.
 */
import {
  LOCALES,
  WORK_STATUSES,
  type ContentSet,
  type Dictionary,
  type ImageRef,
  type LocalisedText,
  type Locale,
} from './types';

export interface Problem {
  section: keyof ContentSet;
  /** The record the problem sits in — a slug, or the field group's name. */
  record: string;
  /** What the editor sees as the field's name. */
  label: string;
  message: string;
}

const LOCALE_NAMES: Record<Locale, string> = { zh: 'Chinese', en: 'English' };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class Collector {
  readonly problems: Problem[] = [];

  constructor(
    private readonly section: keyof ContentSet,
    private readonly record: string,
  ) {}

  add(label: string, message: string): void {
    this.problems.push({ section: this.section, record: this.record, label, message });
  }

  text(value: string, label: string): void {
    if (value.trim() === '') this.add(label, 'is empty');
  }

  localised(value: LocalisedText, label: string): void {
    for (const locale of LOCALES) {
      if ((value[locale] ?? '').trim() === '') {
        this.add(`${label} (${LOCALE_NAMES[locale]})`, 'is empty');
      }
    }
  }

  slug(value: string, label: string): void {
    if (value.trim() === '') return this.add(label, 'is empty');
    if (!SLUG.test(value)) {
      this.add(label, 'may only use lowercase letters, numbers and single hyphens');
    }
  }

  /**
   * CLAUDE.md §10: alt text is required. A decorative image says so with an
   * empty alt; a half-filled one is the failure this catches.
   */
  image(value: ImageRef, label: string): void {
    this.text(value.src, `${label} file`);
    if (value.alt === '') return;
    this.localised(value.alt, `${label} description`);
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
          label: trail.join(' › '),
          message: 'is empty',
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        problems.push({
          section,
          record: trail[0] ?? 'text',
          label: trail.join(' › '),
          message: 'needs at least one paragraph',
        });
      }
      value.forEach((item, at) => walk(item, [...trail, `paragraph ${at + 1}`]));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, nested] of Object.entries(value)) walk(nested, [...trail, key]);
    }
  };

  walk(dictionary, []);
  return problems;
}

export function checkContent(content: ContentSet): Problem[] {
  const problems: Problem[] = [];

  for (const work of content.works) {
    const check = new Collector('works', work.slug);
    check.slug(work.slug, 'Web address');
    check.localised(work.title, 'Title');
    check.localised(work.summary, 'Summary');
    if (!Number.isInteger(work.year)) check.add('Year', 'must be a whole number');
    if (!Number.isInteger(work.index)) check.add('Number', 'must be a whole number');
    if (!WORK_STATUSES.includes(work.status)) check.add('Status', 'is not one of the three states');
    if (work.discipline.length === 0) check.add('Discipline', 'needs at least one entry');
    work.discipline.forEach((entry, at) => check.localised(entry, `Discipline ${at + 1}`));
    work.credits.forEach((credit, at) => {
      check.localised(credit.role, `Credit ${at + 1} role`);
      check.localised(credit.name, `Credit ${at + 1} name`);
    });
    check.image(work.cover, 'Cover image');
    work.media.forEach((image, at) => check.image(image, `Image ${at + 1}`));
    problems.push(...check.problems);
  }

  for (const slug of duplicates(content.works.map((work) => work.slug))) {
    problems.push({
      section: 'works',
      record: slug,
      label: 'Web address',
      message: `is used by more than one work ("${slug}")`,
    });
  }

  for (const program of content.programs) {
    const check = new Collector('programs', program.slug);
    check.slug(program.slug, 'Key');
    check.localised(program.name, 'Name');
    check.localised(program.audience, 'Who it is for');
    check.localised(program.duration, 'How long');
    check.localised(program.summary, 'Summary');
    problems.push(...check.problems);
  }

  for (const mentor of content.mentors) {
    const check = new Collector('mentors', mentor.slug);
    check.slug(mentor.slug, 'Key');
    check.localised(mentor.name, 'Name');
    check.localised(mentor.discipline, 'Discipline');
    check.localised(mentor.note, 'One line');
    check.image(mentor.portrait, 'Portrait');
    problems.push(...check.problems);
  }

  const site = new Collector('site', 'site');
  site.localised(content.site.name, 'Studio name');
  site.text(content.site.url, 'Site address');
  site.text(content.site.contact.email, 'Email');
  site.text(content.site.contact.wechat, 'WeChat');
  site.localised(content.site.contact.address, 'Address');
  site.localised(content.site.contact.hours, 'Opening hours');
  if (content.site.studio.length === 0) site.add('Studio photographs', 'needs at least one');
  content.site.studio.forEach((image, at) => site.image(image, `Studio photograph ${at + 1}`));
  problems.push(...site.problems);

  problems.push(...checkDictionary(content.zh, 'zh'));
  problems.push(...checkDictionary(content.en, 'en'));

  return problems;
}
