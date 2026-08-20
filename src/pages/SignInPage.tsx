/**
 * The signed-out screen.
 *
 * A real form, posted to the Worker, which answers with the session or with the
 * reason it refused. Nothing is remembered between attempts and nothing is
 * stored: the cookie the response sets is HttpOnly, so this component never
 * holds a credential after the request that carried it.
 *
 * The refusal is the same sentence for a wrong name as for a wrong password —
 * the server decides that, and this only prints it.
 */
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { sessionService } from '../services/session';
import type { SessionResponse } from '../services/types';

interface SignInPageProps {
  onSignedIn: (session: SessionResponse) => void;
}

export function SignInPage({ onSignedIn }: SignInPageProps) {
  const { t, i18n } = useTranslation();
  const usernameId = useId();
  const passwordId = useId();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (signingIn) return;

    setSigningIn(true);
    setProblem(null);
    try {
      // No `setSigningIn(false)` on this path: the session replaces this screen.
      onSignedIn(await sessionService.signIn(username, password));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t('signin.failed'));
      setSigningIn(false);
    }
  }

  return (
    <main className="centred sign-in">
      <div className="signin-language segmented" role="group" aria-label={t('account.language')}>
        <button type="button" className={i18n.resolvedLanguage === 'en' ? 'is-selected' : ''} onClick={() => void i18n.changeLanguage('en')}>EN</button>
        <button type="button" className={i18n.resolvedLanguage === 'zh' ? 'is-selected' : ''} onClick={() => void i18n.changeLanguage('zh')}>中文</button>
      </div>
      <span className="signin-mark">c.a.f.a</span>
      <h1>{t('app.editor')}</h1>
      <p>{t('signin.intro')}</p>

      <form className="sign-in-form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label className="field-label" htmlFor={usernameId}>
            {t('signin.username')}
          </label>
          <input
            id={usernameId}
            className="input"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // The first thing to do on this screen is type in it.
            autoFocus
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={passwordId}>
            {t('signin.password')}
          </label>
          <input
            id={passwordId}
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {/* Announced, because a refusal arrives without the page moving. */}
        <p className="problem" role="alert">
          {problem}
        </p>

        <button className="button button-primary" type="submit" disabled={signingIn}>
          {signingIn ? t('signin.working') : t('signin.action')}
        </button>
      </form>
    </main>
  );
}
