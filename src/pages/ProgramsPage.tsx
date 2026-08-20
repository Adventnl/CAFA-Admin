/**
 * Programmes. Four of them, no pages of their own — one list, edited in place.
 */
import { emptyLocalised, type Program } from '../content/types';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const programs = editor.content.programs;

  const write = (at: number, program: Program) =>
    editor.update(
      'programs',
      programs.map((existing, position) => (position === at ? program : existing)),
    );

  return (
    <section>
      <header className="section-head">
        <h2>{t('pages.programs')}</h2>
      </header>

      <Repeatable
        label={t('pages.program')}
        count={programs.length}
        addLabel={t('pages.addProgram')}
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
                label={t('fields.key')}
                value={program.slug}
                onChange={(slug) => write(at, { ...program, slug })}
                placeholder="summer-atelier"
                hint={t('programPage.keyHint')}
              />
              <LocalisedField
                label={t('fields.name')}
                value={program.name}
                onChange={(name) => write(at, { ...program, name })}
              />
              <LocalisedField
                label={t('fields.audience')}
                value={program.audience}
                onChange={(audience) => write(at, { ...program, audience })}
              />
              <LocalisedField
                label={t('fields.duration')}
                value={program.duration}
                onChange={(duration) => write(at, { ...program, duration })}
              />
              <LocalisedField
                label={t('fields.summary')}
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
