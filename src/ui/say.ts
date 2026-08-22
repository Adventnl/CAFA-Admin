/**
 * A phrase from the validator, said in whichever language the studio is reading.
 *
 * `content/validate` runs in the Worker as well as in the browser, so it can
 * only ever produce a key and the numbers to fill it with — see the `Phrase`
 * type there. This is the other half: the hook that turns one into words.
 *
 * It resolves depth-first, because a phrase's values may be phrases. "Cover
 * (Chinese)" is `problems.label.inLocale` filled with `fields.cover` and
 * `problems.locale.zh`, and each of those has to be said before the sentence
 * around it can be — which is also why they nest rather than concatenate: the
 * pieces do not join in the same order in both languages.
 */
import { useTranslation } from 'react-i18next';

import type { Phrase } from '../content/validate';

export function useSay(): (phrase: Phrase) => string {
  const { t } = useTranslation();

  const say = (phrase: Phrase): string =>
    t(
      phrase.key,
      Object.fromEntries(
        Object.entries(phrase.values ?? {}).map(([name, value]) => [
          name,
          typeof value === 'object' ? say(value) : value,
        ]),
      ),
    );

  return say;
}
