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

import { sessionService } from '../services/session';
import type { SessionResponse } from '../services/types';

interface SignInPageProps {
  onSignedIn: (session: SessionResponse) => void;
}

export function SignInPage({ onSignedIn }: SignInPageProps) {
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
      setProblem(error instanceof Error ? error.message : 'The sign-in could not be completed.');
      setSigningIn(false);
    }
  }

  return (
    <main className="centred sign-in">
      <h1>c.a.f.a atelier — editor</h1>
      <p>Sign in to edit the site.</p>

      <form className="sign-in-form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label className="field-label" htmlFor={usernameId}>
            Username
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
            Password
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
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
