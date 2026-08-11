/**
 * Works — the index, and the form behind each row.
 *
 * The list's order is the site's order. That is an editorial decision rather
 * than anything derived from year or number, which is why it is moved by hand
 * here and stored as the `position` column on the works table.
 */
import { useState } from 'react';

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

const STATUS_LABELS: Record<WorkStatus, string> = {
  completed: 'Completed — has its own page',
  'in-progress': 'In progress — has its own page',
  private: 'Private — listed, but not clickable and publishes no images',
};

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
        <h2>Works</h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            editor.update('works', [...works, blankWork(works)]);
            setOpenAt(works.length);
          }}
        >
          Add a work
        </button>
      </header>

      <p className="section-note">
        The order here is the order on the site. It is not sorted by year — move rows to change
        what a visitor meets first.
      </p>

      <ol className="works-list">
        {works.map((work, at) => (
          <li key={work.slug === '' ? `new-${at}` : work.slug} className="works-row">
            <span className="works-index">{String(work.index).padStart(2, '0')}</span>

            <button type="button" className="works-open" onClick={() => setOpenAt(at)}>
              <span className="works-title">{work.title.zh || 'Untitled'}</span>
              <span className="works-title-en">{work.title.en || 'Untitled'}</span>
            </button>

            <span className="works-meta">{work.year}</span>
            <span className={`badge badge-${work.status}`}>{work.status}</span>

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const namedYet = SLUG.test(work.slug);
  const folder = `works/${work.slug}`;

  const set = <K extends keyof Work>(key: K, value: Work[K]) => onChange({ ...work, [key]: value });

  return (
    <section>
      <header className="section-head">
        <button type="button" className="button button-quiet" onClick={onClose}>
          ← All works
        </button>
        <h2>{work.title.zh || work.title.en || 'New work'}</h2>
      </header>

      <TextField
        label="Web address"
        value={work.slug}
        onChange={(value) => set('slug', value)}
        placeholder="salt-and-scaffold"
        hint={
          namedYet
            ? `The page will be at /zh/works/${work.slug}/. Changing this breaks any link anyone has already shared.`
            : 'Lowercase letters, numbers and hyphens. Set this before adding photographs — it decides where they are filed.'
        }
      />

      <div className="row">
        <NumberField
          label="Number"
          value={work.index}
          onChange={(value) => set('index', value)}
          hint="The running number shown in the index."
        />
        <NumberField label="Year" value={work.year} onChange={(value) => set('year', value)} />
      </div>

      <SelectField
        label="Status"
        value={work.status}
        options={WORK_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
        onChange={(value) => set('status', value)}
      />

      <LocalisedField label="Title" value={work.title} onChange={(value) => set('title', value)} />

      <LocalisedField
        label="Summary"
        value={work.summary}
        onChange={(value) => set('summary', value)}
        multiline
      />

      <Repeatable
        label="Discipline"
        count={work.discipline.length}
        addLabel="Add a discipline"
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
              label={`Discipline ${at + 1}`}
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
        label="Credits"
        count={work.credits.length}
        addLabel="Add a credit"
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
                label="Role"
                value={credit.role}
                onChange={(role) => write({ ...credit, role })}
              />
              <LocalisedField
                label="Name"
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
            label="Cover"
            value={work.cover}
            onChange={(value) => set('cover', value)}
            folder={folder}
            name="cover"
            mediaUrl={editor.mediaUrl}
            onUpload={editor.putMedia}
          />

          <Repeatable
            label="Photographs"
            count={work.media.length}
            addLabel="Add a photograph"
            hint="These are the images down the right of the work's page, in this order."
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
                  label={`Photograph ${at + 1}`}
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
        <Field label="Photographs">
          <p className="empty">Give this work a web address first — it decides where its photographs are filed.</p>
        </Field>
      )}

      <footer className="form-footer">
        {confirmingDelete ? (
          <div className="confirm">
            <p>
              Remove <strong>{work.title.zh || work.title.en || 'this work'}</strong> from the site?
              Its photographs stay in the repository, so this can be undone by a developer.
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
              Remove it
            </button>
            <button type="button" className="button" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Remove this work
          </button>
        )}
      </footer>
    </section>
  );
}
