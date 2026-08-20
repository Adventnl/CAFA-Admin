/**
 * Works — the index, and the form behind each row.
 *
 * The list's order is the site's order. That is an editorial decision rather
 * than anything derived from year or number, which is why it is moved by hand
 * here and stored as the `position` column on the works table.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  emptyLocalised,
  WORK_STATUSES,
  type ImageRef,
  type Work,
  type WorkStatus,
} from '../content/types';
import { nextMediaName } from '../images';
import type { Editor } from '../useEditor';
import {
  Field,
  LocalisedField,
  moved,
  NumberField,
  Repeatable,
  SelectField,
  TextField,
} from '../ui/fields';
import { ImageField } from '../ui/ImageField';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function blankImage(): ImageRef {
  return { src: '', alt: emptyLocalised() };
}

function blankWork(existing: readonly Work[]): Work {
  const highest = existing.reduce((most, work) => Math.max(most, work.index), 0);
  return {
    slug: '',
    index: highest + 1,
    title: emptyLocalised(),
    status: 'in-progress',
    discipline: [emptyLocalised()],
    year: new Date().getFullYear(),
    summary: emptyLocalised(),
    credits: [],
    cover: blankImage(),
    media: [],
  };
}

interface WorksPageProps {
  editor: Editor;
}

export function WorksPage({ editor }: WorksPageProps) {
  const { t } = useTranslation();
  const works = editor.content.works;
  const [openAt, setOpenAt] = useState<number | null>(null);

  const replace = (at: number, work: Work) =>
    editor.update(
      'works',
      works.map((existing, position) => (position === at ? work : existing)),
    );

  if (openAt !== null) {
    const work = works[openAt];
    if (work === undefined) {
      setOpenAt(null);
      return null;
    }
    return (
      <WorkForm
        work={work}
        editor={editor}
        onChange={(next) => replace(openAt, next)}
        onClose={() => setOpenAt(null)}
      />
    );
  }

  return (
    <section>
      <header className="section-head">
        <h2>{t('pages.works')}</h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            editor.update('works', [...works, blankWork(works)]);
            setOpenAt(works.length);
          }}
        >
          {t('pages.addWork')}
        </button>
      </header>

      <p className="section-note">
        {t('pages.worksOrder')}
      </p>

      <ol className="works-list">
        {works.map((work, at) => (
          <li key={work.slug === '' ? `new-${at}` : work.slug} className="works-row">
            <span className="works-index">{String(work.index).padStart(2, '0')}</span>

            <button type="button" className="works-open" onClick={() => setOpenAt(at)}>
              <span className="works-title">{work.title.zh || t('pages.untitled')}</span>
              <span className="works-title-en">{work.title.en || t('pages.untitled')}</span>
            </button>

            <span className="works-meta">{work.year}</span>
            <span className={`badge badge-${work.status}`}>{t(`works.statusShort.${work.status}`)}</span>

            <span className="works-controls">
              <button
                type="button"
                className="button button-quiet"
                disabled={at === 0}
                aria-label={`Move ${work.title.en || 'work'} up`}
                onClick={() => editor.update('works', moved(works, at, at - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={at === works.length - 1}
                aria-label={`Move ${work.title.en || 'work'} down`}
                onClick={() => editor.update('works', moved(works, at, at + 1))}
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

interface WorkFormProps {
  work: Work;
  editor: Editor;
  onChange: (work: Work) => void;
  onClose: () => void;
}

function WorkForm({ work, editor, onChange, onClose }: WorkFormProps) {
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const namedYet = SLUG.test(work.slug);
  const folder = `works/${work.slug}`;

  const set = <K extends keyof Work>(key: K, value: Work[K]) => onChange({ ...work, [key]: value });

  return (
    <section>
      <header className="section-head">
        <button type="button" className="button button-quiet" onClick={onClose}>
          ← {t('pages.allWorks')}
        </button>
        <h2>{work.title.zh || work.title.en || t('pages.newWork')}</h2>
      </header>

      <TextField
        label={t('fields.webAddress')}
        value={work.slug}
        onChange={(value) => set('slug', value)}
        placeholder="salt-and-scaffold"
        hint={
          namedYet
            ? t('works.addressReady', { slug: work.slug })
            : t('works.addressEmpty')
        }
      />

      <div className="row">
        <NumberField
          label={t('fields.number')}
          value={work.index}
          onChange={(value) => set('index', value)}
          hint={t('works.numberHint')}
        />
        <NumberField label={t('fields.year')} value={work.year} onChange={(value) => set('year', value)} />
      </div>

      <SelectField
        label={t('fields.status')}
        value={work.status}
        options={WORK_STATUSES.map((status: WorkStatus) => ({ value: status, label: t(`works.status.${status}`) }))}
        onChange={(value) => set('status', value)}
      />

      <LocalisedField label={t('fields.title')} value={work.title} onChange={(value) => set('title', value)} />

      <LocalisedField
        label={t('fields.summary')}
        value={work.summary}
        onChange={(value) => set('summary', value)}
        multiline
      />

      <Repeatable
        label={t('fields.discipline')}
        count={work.discipline.length}
        addLabel={t('works.addDiscipline')}
        onAdd={() => set('discipline', [...work.discipline, emptyLocalised()])}
        onRemove={(at) =>
          set(
            'discipline',
            work.discipline.filter((_, position) => position !== at),
          )
        }
        onMove={(at, to) => set('discipline', moved(work.discipline, at, to))}
        renderItem={(at) => {
          const entry = work.discipline[at];
          if (entry === undefined) return null;
          return (
            <LocalisedField
              label={t('works.disciplineNumber', { number: at + 1 })}
              value={entry}
              onChange={(value) =>
                set(
                  'discipline',
                  work.discipline.map((existing, position) => (position === at ? value : existing)),
                )
              }
            />
          );
        }}
      />

      <Repeatable
        label={t('fields.credits')}
        count={work.credits.length}
        addLabel={t('works.addCredit')}
        onAdd={() => set('credits', [...work.credits, { role: emptyLocalised(), name: emptyLocalised() }])}
        onRemove={(at) =>
          set(
            'credits',
            work.credits.filter((_, position) => position !== at),
          )
        }
        onMove={(at, to) => set('credits', moved(work.credits, at, to))}
        renderItem={(at) => {
          const credit = work.credits[at];
          if (credit === undefined) return null;
          const write = (next: typeof credit) =>
            set(
              'credits',
              work.credits.map((existing, position) => (position === at ? next : existing)),
            );
          return (
            <>
              <LocalisedField
                label={t('fields.role')}
                value={credit.role}
                onChange={(role) => write({ ...credit, role })}
              />
              <LocalisedField
                label={t('fields.name')}
                value={credit.name}
                onChange={(name) => write({ ...credit, name })}
              />
            </>
          );
        }}
      />

      {namedYet ? (
        <>
          <ImageField
            label={t('fields.cover')}
            value={work.cover}
            onChange={(value) => set('cover', value)}
            folder={folder}
            name="cover"
            mediaUrl={editor.mediaUrl}
            onUpload={editor.putMedia}
          />

          <Repeatable
            label={t('fields.photographs')}
            count={work.media.length}
            addLabel={t('fields.addPhoto')}
            hint={t('works.photoHint')}
            onAdd={() => set('media', [...work.media, blankImage()])}
            onRemove={(at) =>
              set(
                'media',
                work.media.filter((_, position) => position !== at),
              )
            }
            onMove={(at, to) => set('media', moved(work.media, at, to))}
            renderItem={(at) => {
              const image = work.media[at];
              if (image === undefined) return null;
              return (
                <ImageField
                  label={t('works.photoNumber', { number: at + 1 })}
                  value={image}
                  onChange={(value) =>
                    set(
                      'media',
                      work.media.map((existing, position) => (position === at ? value : existing)),
                    )
                  }
                  folder={folder}
                  name={
                    image.src === ''
                      ? nextMediaName(
                          work.media.map((entry) => entry.src),
                          '',
                        )
                      : (image.src.split('/').pop() ?? '').replace(/\.[^.]+$/, '')
                  }
                  mediaUrl={editor.mediaUrl}
                  onUpload={editor.putMedia}
                />
              );
            }}
          />
        </>
      ) : (
        <Field label={t('fields.photographs')}>
          <p className="empty">{t('works.needsAddress')}</p>
        </Field>
      )}

      <footer className="form-footer">
        {confirmingDelete ? (
          <div className="confirm">
            <p>
              {t('works.removeQuestion', { title: work.title.zh || work.title.en || t('pages.newWork') })}
            </p>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                editor.update(
                  'works',
                  editor.content.works.filter((existing) => existing !== work),
                );
                onClose();
              }}
            >
              {t('works.removeIt')}
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
            {t('works.removeWork')}
          </button>
        )}
      </footer>
    </section>
  );
}
