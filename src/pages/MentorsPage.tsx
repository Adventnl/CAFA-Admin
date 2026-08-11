/**
 * Mentors. A name, a discipline, one line, and a portrait.
 */
import { emptyLocalised, type Mentor } from '../content/types';
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
  const mentors = editor.content.mentors;

  const write = (at: number, mentor: Mentor) =>
    editor.update(
      'mentors',
      mentors.map((existing, position) => (position === at ? mentor : existing)),
    );

  return (
    <section>
      <header className="section-head">
        <h2>Mentors</h2>
      </header>

      <Repeatable
        label="Mentor"
        count={mentors.length}
        addLabel="Add a mentor"
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
                label="Key"
                value={mentor.slug}
                onChange={(slug) => write(at, { ...mentor, slug })}
                placeholder="shen-zhibai"
                hint="Not shown to anyone, but it names the portrait file."
              />
              <LocalisedField
                label="Name"
                value={mentor.name}
                onChange={(name) => write(at, { ...mentor, name })}
              />
              <LocalisedField
                label="Discipline"
                value={mentor.discipline}
                onChange={(discipline) => write(at, { ...mentor, discipline })}
              />
              <LocalisedField
                label="One line"
                value={mentor.note}
                onChange={(note) => write(at, { ...mentor, note })}
                hint="Exactly one sentence. The layout gives it one line."
              />
              {SLUG.test(mentor.slug) ? (
                <ImageField
                  label="Portrait"
                  value={mentor.portrait}
                  onChange={(portrait) => write(at, { ...mentor, portrait })}
                  folder="mentors"
                  name={mentor.slug}
                  mediaUrl={editor.mediaUrl}
                  onUpload={editor.putMedia}
                />
              ) : (
                <p className="empty">Give this mentor a key first — it names the portrait file.</p>
              )}
            </>
          );
        }}
      />
    </section>
  );
}
