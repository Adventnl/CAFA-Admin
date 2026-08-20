/**
 * The site's own words — everything that is not a work, a programme or a person.
 *
 * The dictionary's *keys* are structure: the template reads them by name, so a
 * renamed key is a broken build and a missing one is a blank on the page. So
 * this form exposes values only. Each field carries a typed reader and writer
 * rather than a dotted path string, which is a few more characters per line and
 * buys the compiler's word that every one of them points somewhere real.
 */
import type { Dictionary, Locale } from '../content/types';
import { LOCALES } from '../content/types';
import type { Editor } from '../useEditor';
import { moved, Repeatable, TextField } from '../ui/fields';

interface CopyField {
  label: string;
  hint?: string;
  multiline?: boolean;
  read: (dictionary: Dictionary) => string;
  write: (dictionary: Dictionary, value: string) => Dictionary;
}

interface CopyGroup {
  title: string;
  note?: string;
  fields: CopyField[];
}

const GROUPS: CopyGroup[] = [
  {
    title: 'Home',
    fields: [
      {
        label: 'Statement',
        multiline: true,
        hint: 'The one sentence the home page is built around.',
        read: (d) => d.home.statement,
        write: (d, v) => ({ ...d, home: { ...d.home, statement: v } }),
      },
    ],
  },
  {
    title: 'About',
    fields: [
      {
        label: 'Page title',
        read: (d) => d.about.title,
        write: (d, v) => ({ ...d, about: { ...d.about, title: v } }),
      },
      {
        label: 'Description for search engines',
        multiline: true,
        read: (d) => d.about.description,
        write: (d, v) => ({ ...d, about: { ...d.about, description: v } }),
      },
      {
        label: 'Heading above the mentors',
        read: (d) => d.about.mentorsTitle,
        write: (d, v) => ({ ...d, about: { ...d.about, mentorsTitle: v } }),
      },
      {
        label: 'Heading above the works',
        read: (d) => d.about.worksTitle,
        write: (d, v) => ({ ...d, about: { ...d.about, worksTitle: v } }),
      },
    ],
  },
  {
    title: 'Works',
    fields: [
      {
        label: 'Page title',
        read: (d) => d.works.title,
        write: (d, v) => ({ ...d, works: { ...d.works, title: v } }),
      },
      {
        label: 'Description for search engines',
        multiline: true,
        read: (d) => d.works.description,
        write: (d, v) => ({ ...d, works: { ...d.works, description: v } }),
      },
      {
        label: 'Status word — completed',
        read: (d) => d.works.status.completed,
        write: (d, v) => ({ ...d, works: { ...d.works, status: { ...d.works.status, completed: v } } }),
      },
      {
        label: 'Status word — in progress',
        read: (d) => d.works.status['in-progress'],
        write: (d, v) => ({
          ...d,
          works: { ...d.works, status: { ...d.works.status, 'in-progress': v } },
        }),
      },
      {
        label: 'Status word — private',
        read: (d) => d.works.status.private,
        write: (d, v) => ({ ...d, works: { ...d.works, status: { ...d.works.status, private: v } } }),
      },
    ],
  },
  {
    title: 'Labels on a work page',
    note: 'The words down the left of a work, against its number, year and credits.',
    fields: [
      {
        label: 'Number',
        read: (d) => d.work.index,
        write: (d, v) => ({ ...d, work: { ...d.work, index: v } }),
      },
      {
        label: 'Status',
        read: (d) => d.work.status,
        write: (d, v) => ({ ...d, work: { ...d.work, status: v } }),
      },
      {
        label: 'Year',
        read: (d) => d.work.year,
        write: (d, v) => ({ ...d, work: { ...d.work, year: v } }),
      },
      {
        label: 'Discipline',
        read: (d) => d.work.discipline,
        write: (d, v) => ({ ...d, work: { ...d.work, discipline: v } }),
      },
      {
        label: 'Credits',
        read: (d) => d.work.credits,
        write: (d, v) => ({ ...d, work: { ...d.work, credits: v } }),
      },
      {
        label: 'Previous',
        read: (d) => d.work.previous,
        write: (d, v) => ({ ...d, work: { ...d.work, previous: v } }),
      },
      {
        label: 'Next',
        read: (d) => d.work.next,
        write: (d, v) => ({ ...d, work: { ...d.work, next: v } }),
      },
    ],
  },
  {
    title: 'Programmes page',
    fields: [
      {
        label: 'Page title',
        read: (d) => d.programs.title,
        write: (d, v) => ({ ...d, programs: { ...d.programs, title: v } }),
      },
      {
        label: 'Description for search engines',
        multiline: true,
        read: (d) => d.programs.description,
        write: (d, v) => ({ ...d, programs: { ...d.programs, description: v } }),
      },
      {
        label: 'Introduction',
        multiline: true,
        read: (d) => d.programs.intro,
        write: (d, v) => ({ ...d, programs: { ...d.programs, intro: v } }),
      },
    ],
  },
  {
    title: 'Contact card',
    fields: [
      {
        label: 'Card title',
        read: (d) => d.contact.title,
        write: (d, v) => ({ ...d, contact: { ...d.contact, title: v } }),
      },
      {
        label: 'Label — email',
        read: (d) => d.contact.email,
        write: (d, v) => ({ ...d, contact: { ...d.contact, email: v } }),
      },
      {
        label: 'Label — WeChat',
        read: (d) => d.contact.wechat,
        write: (d, v) => ({ ...d, contact: { ...d.contact, wechat: v } }),
      },
      {
        label: 'Label — address',
        read: (d) => d.contact.address,
        write: (d, v) => ({ ...d, contact: { ...d.contact, address: v } }),
      },
      {
        label: 'Label — hours',
        read: (d) => d.contact.hours,
        write: (d, v) => ({ ...d, contact: { ...d.contact, hours: v } }),
      },
      {
        label: 'Note',
        multiline: true,
        hint: 'How to apply, and what happens next.',
        read: (d) => d.contact.note,
        write: (d, v) => ({ ...d, contact: { ...d.contact, note: v } }),
      },
      {
        label: 'Message form — the address field',
        read: (d) => d.contact.from,
        write: (d, v) => ({ ...d, contact: { ...d.contact, from: v } }),
      },
      {
        label: 'Message form — the message field',
        read: (d) => d.contact.message,
        write: (d, v) => ({ ...d, contact: { ...d.contact, message: v } }),
      },
      {
        label: 'Message form — subject line',
        hint: 'The line the reader’s own mail client opens with. Send hands them a draft; nothing is collected here.',
        read: (d) => d.contact.subject,
        write: (d, v) => ({ ...d, contact: { ...d.contact, subject: v } }),
      },
      {
        label: 'Message form — the send button',
        read: (d) => d.contact.send,
        write: (d, v) => ({ ...d, contact: { ...d.contact, send: v } }),
      },
    ],
  },
  {
    title: 'Footer and missing pages',
    fields: [
      {
        label: 'Footer note',
        read: (d) => d.footer.note,
        write: (d, v) => ({ ...d, footer: { ...d.footer, note: v } }),
      },
      {
        label: 'Missing page — title',
        read: (d) => d.notFound.title,
        write: (d, v) => ({ ...d, notFound: { ...d.notFound, title: v } }),
      },
      {
        label: 'Missing page — text',
        multiline: true,
        read: (d) => d.notFound.body,
        write: (d, v) => ({ ...d, notFound: { ...d.notFound, body: v } }),
      },
      {
        label: 'Missing page — link home',
        read: (d) => d.notFound.home,
        write: (d, v) => ({ ...d, notFound: { ...d.notFound, home: v } }),
      },
    ],
  },
  {
    title: 'Search engines and sharing',
    note: 'What appears in a search result or when someone pastes a link into a chat.',
    fields: [
      {
        label: 'Site title',
        read: (d) => d.meta.title,
        write: (d, v) => ({ ...d, meta: { ...d.meta, title: v } }),
      },
      {
        label: 'Title pattern for inner pages',
        hint: '%s is replaced by the page’s own title.',
        read: (d) => d.meta.titleTemplate,
        write: (d, v) => ({ ...d, meta: { ...d.meta, titleTemplate: v } }),
      },
      {
        label: 'Site description',
        multiline: true,
        read: (d) => d.meta.description,
        write: (d, v) => ({ ...d, meta: { ...d.meta, description: v } }),
      },
    ],
  },
  {
    title: 'Read aloud by screen readers',
    note: 'Never shown on screen. Changing these changes what a blind visitor hears.',
    fields: [
      {
        label: 'Skip to content',
        read: (d) => d.a11y.skipToContent,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, skipToContent: v } }),
      },
      {
        label: 'Main navigation',
        read: (d) => d.a11y.primaryNav,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, primaryNav: v } }),
      },
      {
        label: 'Language switch',
        read: (d) => d.a11y.localeSwitch,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, localeSwitch: v } }),
      },
      {
        label: 'Index of works',
        read: (d) => d.a11y.worksList,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, worksList: v } }),
      },
      {
        label: 'Work numbers',
        read: (d) => d.a11y.worksRail,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, worksRail: v } }),
      },
      {
        label: 'Works navigation',
        read: (d) => d.a11y.workPager,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, workPager: v } }),
      },
      {
        label: 'Close',
        read: (d) => d.a11y.close,
        write: (d, v) => ({ ...d, a11y: { ...d.a11y, close: v } }),
      },
    ],
  },
];

const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' };

interface CopyPageProps {
  editor: Editor;
}

export function CopyPage({ editor }: CopyPageProps) {
  const set = (locale: Locale, next: Dictionary) => editor.update(locale, next);

  return (
    <section>
      <header className="section-head">
        <h2>Site text</h2>
      </header>
      <p className="section-note">
        Every one of these exists in both languages. A blank in either is caught before saving.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} className="copy-group">
          <h3 className="copy-group-title">{group.title}</h3>
          {group.note !== undefined && <p className="section-note">{group.note}</p>}

          {group.fields.map((field) => (
            <fieldset key={field.label} className="field localised">
              <legend className="field-label">{field.label}</legend>
              <div className="localised-pair">
                {LOCALES.map((locale) => (
                  <TextField
                    key={locale}
                    label={LOCALE_NAMES[locale]}
                    multiline={field.multiline}
                    value={field.read(editor.content[locale])}
                    onChange={(value) => set(locale, field.write(editor.content[locale], value))}
                  />
                ))}
              </div>
              {field.hint !== undefined && <p className="field-hint">{field.hint}</p>}
            </fieldset>
          ))}
        </section>
      ))}

      <section className="copy-group">
        <h3 className="copy-group-title">About — the paragraphs</h3>
        <p className="section-note">
          Both languages need the same number of paragraphs; they sit side by side on the page.
        </p>

        {LOCALES.map((locale) => {
          const dictionary = editor.content[locale];
          const body = dictionary.about.body;
          const writeBody = (next: string[]) =>
            set(locale, { ...dictionary, about: { ...dictionary.about, body: next } });

          return (
            <Repeatable
              key={locale}
              label={`${LOCALE_NAMES[locale]} paragraph`}
              count={body.length}
              addLabel={`Add a ${LOCALE_NAMES[locale]} paragraph`}
              onAdd={() => writeBody([...body, ''])}
              onRemove={(at) => writeBody(body.filter((_, position) => position !== at))}
              onMove={(at, to) => writeBody(moved(body, at, to))}
              renderItem={(at) => (
                <TextField
                  label={`Paragraph ${at + 1}`}
                  multiline
                  value={body[at] ?? ''}
                  onChange={(value) =>
                    writeBody(body.map((existing, position) => (position === at ? value : existing)))
                  }
                />
              )}
            />
          );
        })}
      </section>
    </section>
  );
}
