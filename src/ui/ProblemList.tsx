/**
 * What has to be fixed before this can be saved.
 *
 * Capped at a dozen with a count for the rest: a fresh import with every alt
 * text missing produces hundreds, and a list that long stops being a list of
 * things to do and becomes a wall to scroll past.
 */
import type { Problem } from '../content/validate';

const SHOWN = 12;

export function ProblemList({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;

  return (
    <section className="problems" aria-live="polite">
      <h2>
        {problems.length} {problems.length === 1 ? 'thing' : 'things'} to fix before this can be
        saved
      </h2>
      <ul>
        {problems.slice(0, SHOWN).map((problem) => (
          <li key={`${problem.section}/${problem.record}/${problem.label}`}>
            <strong>{problem.record}</strong> — {problem.label} {problem.message}
          </li>
        ))}
      </ul>
      {problems.length > SHOWN && <p>…and {problems.length - SHOWN} more.</p>}
    </section>
  );
}
