/**
 * Programmes. Four of them, no pages of their own — one list, edited in place.
 */
import { emptyLocalised, type Program } from '../content/types';
import type { Editor } from '../useEditor';
import { LocalisedField, moved, Repeatable, TextField } from '../ui/fields';

function blankProgram(): Program {
  return {
    slug: '',
    name: emptyLocalised(),
    audience: emptyLocalised(),
    duration: emptyLocalised(),
    summary: emptyLocalised(),
  };
}

interface ProgramsPageProps {
  editor: Editor;
}

export function ProgramsPage({ editor }: ProgramsPageProps) {
  const programs = editor.content.programs;

  const write = (at: number, program: Program) =>
    editor.update(
      'programs',
      programs.map((existing, position) => (position === at ? program : existing)),
    );

  return (
    <section>
      <header className="section-head">
        <h2>Programmes</h2>
      </header>

      <Repeatable
        label="Programme"
        count={programs.length}
        addLabel="Add a programme"
        onAdd={() => editor.update('programs', [...programs, blankProgram()])}
        onRemove={(at) =>
          editor.update(
            'programs',
            programs.filter((_, position) => position !== at),
          )
        }
        onMove={(at, to) => editor.update('programs', moved(programs, at, to))}
        renderItem={(at) => {
          const program = programs[at];
          if (program === undefined) return null;
          return (
            <>
              <TextField
                label="Key"
                value={program.slug}
                onChange={(slug) => write(at, { ...program, slug })}
                placeholder="summer-atelier"
                hint="Not shown to anyone. Lowercase letters, numbers and hyphens."
              />
              <LocalisedField
                label="Name"
                value={program.name}
                onChange={(name) => write(at, { ...program, name })}
              />
              <LocalisedField
                label="Who it is for"
                value={program.audience}
                onChange={(audience) => write(at, { ...program, audience })}
              />
              <LocalisedField
                label="How long"
                value={program.duration}
                onChange={(duration) => write(at, { ...program, duration })}
              />
              <LocalisedField
                label="Summary"
                value={program.summary}
                onChange={(summary) => write(at, { ...program, summary })}
                multiline
              />
            </>
          );
        }}
      />
    </section>
  );
}
