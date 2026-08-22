/**
 * What has to be fixed before this can be saved.
 *
 * Capped at a dozen with a count for the rest: a fresh import with every alt
 * text missing produces hundreds, and a list that long stops being a list of
 * things to do and becomes a wall to scroll past.
 *
 * The validator hands over phrases rather than sentences — a key and the
 * numbers to fill it with — because it also runs in the Worker, which has no
 * translator and no idea what language anyone is reading. This is where they
 * become words, which is why this is the only file that knows the banner is
 * bilingual at all.
 */
import { useTranslation } from 'react-i18next';

import { HOME_SLUG } from '../content/types';
import type { Problem } from '../content/validate';
import { useSay } from './say';

const SHOWN = 12;

export function ProblemList({ problems }: { problems: Problem[] }) {
  const { t } = useTranslation();
  const say = useSay();
  if (problems.length === 0) return null;

  return (
    <section className="problems" aria-live="polite">
      <h2>{t('problems.title', { count: problems.length })}</h2>
      <ul>
        {problems.slice(0, SHOWN).map((problem) => (
          // Two problems can share a record and a key — a title blank in both
          // languages is one phrase filled twice — so the whole label is the
          // identity, not just its key.
          <li key={`${problem.section}/${problem.record}/${JSON.stringify(problem.label)}`}>
            {/* A record is a slug — the studio's own word for the thing, so it
                is not translated. The front page has no slug to show, which is
                exactly what makes it the front page; a *programme* with no key
                yet is a blank field rather than the front page, so the section
                has to agree before the empty string means anything. */}
            <strong>
              {problem.section === 'pages' && problem.record === HOME_SLUG
                ? t('problems.record.frontPage')
                : problem.record}
            </strong>{' '}
            — {say(problem.label)} {say(problem.message)}
          </li>
        ))}
      </ul>
      {problems.length > SHOWN && <p>{t('problems.more', { count: problems.length - SHOWN })}</p>}
    </section>
  );
}
