/**
 * The shell: establish a session, load the content once, then route.
 *
 * Three states before any page renders — checking, signed out, loaded — and
 * they are separate on purpose. "Could not reach the site" and "you are not
 * signed in" are different problems with different fixes, and collapsing them
 * into one screen is how an expired cookie comes to look like an outage.
 *
 * The content is loaded once, here, and held for the session. Every page edits
 * the same in-memory `ContentSet` through the same `Editor`, which is what lets
 * a save be one transaction over the whole thing rather than six that could
 * half-succeed.
 */
import { useEffect, useState } from 'react';

import { CopyPage } from './pages/CopyPage';
import { HistoryPage } from './pages/HistoryPage';
import { MentorsPage } from './pages/MentorsPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { SignInPage } from './pages/SignInPage';
import { SitePage } from './pages/SitePage';
import { WorksPage } from './pages/WorksPage';
import { useRoute, type RoutePath } from './routes';
import { contentService } from './services/content';
import { sessionService } from './services/session';
import type { ContentResponse } from './services/types';
import { AdminLayout } from './ui/AdminLayout';
import { ProblemList } from './ui/ProblemList';
import { useEditor } from './useEditor';

export function App() {
  const [login, setLogin] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loaded, setLoaded] = useState<ContentResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLogin((await sessionService.whoami())?.login ?? null);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'Could not reach the site.');
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // Keyed on the login rather than folded into the check above, so the content
  // loads the same way whether the session came back from the cookie or from
  // the sign-in form a moment ago.
  useEffect(() => {
    if (login === null) return;
    void (async () => {
      try {
        setLoaded(await contentService.load());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'Could not reach the site.');
      }
    })();
  }, [login]);

  if (checking) return <p className="centred">Loading…</p>;
  if (login === null) return <SignInPage onSignedIn={(session) => setLogin(session.login)} />;
  if (failure !== null) return <p className="centred problem">{failure}</p>;
  if (loaded === null) return <p className="centred">Loading the site…</p>;

  return (
    <Editing
      login={login}
      content={loaded}
      onSignedOut={() => {
        // Back to the sign-in screen without a page load. `Editing` unmounts,
        // which is what actually discards the edited content — there is no
        // second copy of it anywhere, and nothing to clear by hand.
        setLogin(null);
        setLoaded(null);
      }}
    />
  );
}

interface EditingProps {
  login: string;
  content: ContentResponse;
  onSignedOut: () => void;
}

function Editing({ login, content, onSignedOut }: EditingProps) {
  const editor = useEditor(content.content, content.media);
  const route = useRoute();

  // The browser's own guard is the only one that catches a closed tab.
  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.dirty]);

  return (
    <AdminLayout editor={editor} login={login} route={route} onSignedOut={onSignedOut}>
      <ProblemList problems={editor.problems} />
      <Page route={route} editor={editor} />
    </AdminLayout>
  );
}

/**
 * The route table's one exhaustive switch. Adding a route to `ROUTES` without
 * adding it here is a TypeScript error rather than a blank page — the return
 * type has no `undefined` in it and the switch has no default.
 */
function Page({ route, editor }: { route: RoutePath; editor: ReturnType<typeof useEditor> }) {
  switch (route) {
    case 'works':
      return <WorksPage editor={editor} />;
    case 'programs':
      return <ProgramsPage editor={editor} />;
    case 'mentors':
      return <MentorsPage editor={editor} />;
    case 'site':
      return <SitePage editor={editor} />;
    case 'copy':
      return <CopyPage editor={editor} />;
    case 'history':
      return <HistoryPage editor={editor} />;
  }
}
