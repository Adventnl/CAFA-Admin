/**
 * Mentors. A name, a discipline, one line, and a portrait.
 */
import { emptyLocalised, type Mentor } from '../content/types';
import { useTranslation } from 'react-i18next';
import type { Editor } from '../useEditor';
import { LocalisedField, moved, Repeatable, TextField } from '../ui/fields';
import { ImageField } from '../ui/ImageField';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function blankMentor(): Mentor {
  return {
    slug: '',
    name: emptyLocalised(),
    discipline: emptyLocalised(),
    note: emptyLocalised(),
    portrait: { src: '', alt: emptyLocalised() },
  };
}

interface MentorsPageProps {
  editor: Editor;
}

export function MentorsPage({ editor }: MentorsPageProps) {
  const { t } = useTranslation();
  const mentors = editor.content.mentors;

  const write = (at: number, mentor: Mentor) =>
    editor.update(
      'mentors',
      mentors.map((existing, position) => (position === at ? mentor : existing)),
    );

  return (
    <section>
      <header className="section-head">
        <h2>{t('pages.mentors')}</h2>
      </header>

      <Repeatable
        label={t('pages.mentor')}
        count={mentors.length}
        addLabel={t('pages.addMentor')}
        onAdd={() => editor.update('mentors', [...mentors, blankMentor()])}
        onRemove={(at) =>
          editor.update(
            'mentors',
            mentors.filter((_, position) => position !== at),
          )
        }
        onMove={(at, to) => editor.update('mentors', moved(mentors, at, to))}
        renderItem={(at) => {
          const mentor = mentors[at];
          if (mentor === undefined) return null;
          return (
            <>
              <TextField
                label={t('fields.key')}
                value={mentor.slug}
                onChange={(slug) => write(at, { ...mentor, slug })}
                placeholder="shen-zhibai"
                hint={t('mentorPage.keyHint')}
              />
              <LocalisedField
                label={t('fields.name')}
                value={mentor.name}
                onChange={(name) => write(at, { ...mentor, name })}
              />
              <LocalisedField
                label={t('fields.discipline')}
                value={mentor.discipline}
                onChange={(discipline) => write(at, { ...mentor, discipline })}
              />
              <LocalisedField
                label={t('fields.oneLine')}
                value={mentor.note}
                onChange={(note) => write(at, { ...mentor, note })}
                hint={t('mentorPage.oneLineHint')}
              />
              {SLUG.test(mentor.slug) ? (
                <ImageField
                  label={t('fields.portrait')}
                  value={mentor.portrait}
                  onChange={(portrait) => write(at, { ...mentor, portrait })}
                  folder="mentors"
                  name={mentor.slug}
                  mediaUrl={editor.mediaUrl}
                  onUpload={editor.putMedia}
                />
              ) : (
                <p className="empty">{t('mentorPage.needsKey')}</p>
              )}
            </>
          );
        }}
      />
    </section>
  );
}
