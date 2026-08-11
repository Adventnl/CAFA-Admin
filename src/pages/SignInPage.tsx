/**
 * The signed-out screen.
 *
 * `?error=` is set by the OAuth callback when it refuses a sign-in — an expired
 * link, or an account that is not the studio's. It arrives on the URL because
 * that arm of the flow is a browser redirect rather than a fetch, and there is
 * nowhere else for a message to travel.
 */
import { sessionService } from '../services/session';

export function SignInPage({ error }: { error: string | null }) {
  return (
    <main className="centred sign-in">
      <h1>c.a.f.a atelier — editor</h1>
      <p>Sign in with the studio’s GitHub account to edit the site.</p>
      {error !== null && <p className="problem">{error}</p>}
      <a className="button button-primary" href={sessionService.loginUrl}>
        Sign in with GitHub
      </a>
    </main>
  );
}
