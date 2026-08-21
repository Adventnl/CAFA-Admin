/**
 * Pages — the site's own list of them, and the form behind each row.
 *
 * This is the screen the whole change exists for. The site used to have four
 * pages because CAFA-Template had four route files; it has whatever is in this
 * list now, in this order, composed of whatever sections each row carries.
 * Adding a page adds a URL and — if it carries a name for the menu — an item in
 * the bar; removing one takes both away. Neither is a deploy.
 *
 * The order here is the order of the nav bar, which is why the list is moved by
 * hand rather than sorted: it is an editorial decision, stored as the
 * `position` column on the pages table.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { emptyLocalised, HOME_SLUG, type Page, type PageSection } from '../content/types';
import type { Editor } from '../useEditor';
import { LocalisedField, moved, Repeatable, TextField } from '../ui/fields';
import { blankSection, SectionFields } from '../ui/SectionFields';

/**
 * A new page starts with a heading, because every page needs exactly one thing
 * that sets its `h1` and a heading is the quiet one. The slug is seeded rather
 * than blank: an empty slug is the *front page's* address, so a blank new page
 * would silently claim it.
 */
const NEW_PAGE_SLUG = 'new-page';

function blankPage(): Page {
  return {
    slug: NEW_PAGE_SLUG,
    title: emptyLocalised(),
    description: emptyLocalised(),
    navLabel: emptyLocalised(),
    sections: [{ kind: 'heading' }],
  };
}

/** Where a page's photographs are filed. The front page has no slug to use. */
function pageFolder(slug: string): string {
  return `pages/${slug === HOME_SLUG ? 'home' : slug}`;
}

interface PagesPageProps {
  editor: Editor;
}

export function PagesPage({ editor }: PagesPageProps) {
  const { t } = useTranslation();
  const pages = editor.content.pages;
  const [openAt, setOpenAt] = useState<number | null>(null);

  const replace = (at: number, page: Page) =>
    editor.update(
      'pages',
      pages.map((existing, position) => (position === at ? page : existing)),
    );

  if (openAt !== null) {
    const page = pages[openAt];
    if (page === undefined) {
      setOpenAt(null);
      return null;
    }
    return (
      <PageForm
        page={page}
        editor={editor}
        onChange={(next) => replace(openAt, next)}
        onClose={() => setOpenAt(null)}
      />
    );
  }

  return (
    <section>
      <header className="section-head">
        <h2>{t('pages.pages')}</h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            editor.update('pages', [...pages, blankPage()]);
            setOpenAt(pages.length);
          }}
        >
          {t('pages.addPage')}
        </button>
      </header>

      <p className="section-note">{t('pagePage.order')}</p>

      <ol className="works-list">
        {pages.map((page, at) => (
          <li key={page.slug === '' ? 'front' : page.slug} className="works-row">
            <span className="works-index">{String(at + 1).padStart(2, '0')}</span>

            <button type="button" className="works-open" onClick={() => setOpenAt(at)}>
              <span className="works-title">{page.title.zh || t('pages.untitled')}</span>
              <span className="works-title-en">
                {page.slug === HOME_SLUG ? '/' : `/${page.slug}`} ·{' '}
                {t('pagePage.sectionCount', { count: page.sections.length })}
              </span>
            </button>

            <span className="works-meta">
              {t(page.navLabel === null ? 'pagePage.notInMenu' : 'pagePage.inMenu')}
            </span>

            <span className="works-controls">
              <button
                type="button"
                className="button button-quiet"
                disabled={at === 0}
                aria-label={t('pagePage.moveUp', { page: page.title.en || page.slug })}
                onClick={() => editor.update('pages', moved(pages, at, at - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={at === pages.length - 1}
                aria-label={t('pagePage.moveDown', { page: page.title.en || page.slug })}
                onClick={() => editor.update('pages', moved(pages, at, at + 1))}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface PageFormProps {
  page: Page;
  editor: Editor;
  onChange: (page: Page) => void;
  onClose: () => void;
}

function PageForm({ page, editor, onChange, onClose }: PageFormProps) {
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isHome = page.slug === HOME_SLUG;

  const set = <K extends keyof Page>(key: K, value: Page[K]) => onChange({ ...page, [key]: value });

  const writeSections = (sections: PageSection[]) => set('sections', sections);
  const usedKeys = page.sections.flatMap((section) =>
    section.kind === 'gallery' ? section.images.map((image) => image.src) : [],
  );

  return (
    <section>
      <header className="section-head">
        <button type="button" className="button button-quiet" onClick={onClose}>
          ← {t('pages.allPages')}
        </button>
        <h2>{page.title.zh || page.title.en || t('pages.newPage')}</h2>
      </header>

      <TextField
        label={t('fields.webAddress')}
        value={page.slug}
        onChange={(value) => set('slug', value)}
        placeholder="about"
        hint={isHome ? t('pagePage.addressFront') : t('pagePage.address', { slug: page.slug })}
      />
      <LocalisedField
        label={t('fields.title')}
        value={page.title}
        onChange={(title) => set('title', title)}
        hint={t('pagePage.titleHint')}
      />
      <LocalisedField
        label={t('fields.description')}
        value={page.description}
        onChange={(description) => set('description', description)}
        hint={t('pagePage.descriptionHint')}
        multiline
      />

      {/* Null is not a blank label — it is the page saying it is not in the bar
          at all. So the checkbox owns the null and the field below owns the
          words, and neither can express the other's state. */}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={page.navLabel !== null}
          onChange={(event) => set('navLabel', event.target.checked ? emptyLocalised() : null)}
        />
        <span>
          {t('fields.inMenu')} — {t('pagePage.menuHint')}
        </span>
      </label>
      {page.navLabel !== null && (
        <LocalisedField
          label={t('fields.menuName')}
          value={page.navLabel}
          onChange={(navLabel) => set('navLabel', navLabel)}
        />
      )}

      <Repeatable
        label={t('pages.section')}
        count={page.sections.length}
        addLabel={t('pages.addSection')}
        hint={t('pagePage.sectionsHint')}
        onAdd={() => writeSections([...page.sections, blankSection('prose')])}
        onRemove={(at) =>
          writeSections(page.sections.filter((_, position) => position !== at))
        }
        onMove={(at, to) => writeSections(moved(page.sections, at, to))}
        renderItem={(at) => {
          const section = page.sections[at];
          if (section === undefined) return null;
          return (
            <SectionFields
              section={section}
              onChange={(next) =>
                writeSections(
                  page.sections.map((existing, position) => (position === at ? next : existing)),
                )
              }
              folder={pageFolder(page.slug)}
              usedKeys={usedKeys}
              mediaUrl={editor.mediaUrl}
              onUpload={editor.putMedia}
            />
          );
        }}
      />

      <footer className="form-footer">
        {/* The front page has no remove button. It is not a preference: the site
            answers 404 at its own address without one, which the validator says
            too — this is simply the earlier place to say it. */}
        {isHome ? (
          <p className="field-hint">{t('pagePage.frontPageKept')}</p>
        ) : confirmingDelete ? (
          <div className="confirm">
            <p>{t('pagePage.removeQuestion', { page: page.title.zh || page.title.en || page.slug })}</p>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                editor.update(
                  'pages',
                  editor.content.pages.filter((existing) => existing !== page),
                );
                onClose();
              }}
            >
              {t('pagePage.removeIt')}
            </button>
            <button type="button" className="button" onClick={() => setConfirmingDelete(false)}>
              {t('works.keepIt')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            {t('pagePage.removePage')}
          </button>
        )}
      </footer>
    </section>
  );
}
