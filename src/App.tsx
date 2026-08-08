/**
 * The shell: sign in, load, and put one editor on screen at a time.
 */
import { useEffect, useState } from 'react';

import { loadContent, whoami } from './api';
import type { ContentSet } from './content/types';
import { CopyEditor } from './editors/CopyEditor';
import { MentorsEditor } from './editors/MentorsEditor';
import { ProgramsEditor } from './editors/ProgramsEditor';
import { SiteEditor } from './editors/SiteEditor';
import { WorksEditor } from './editors/WorksEditor';
import { useEditor } from './useEditor';
import { PublishBar } from './ui/PublishBar';

const SECTIONS = [
  { id: 'works', label: 'Works' },
  { id: 'programs', label: 'Programmes' },
  { id: 'mentors', label: 'Mentors' },
  { id: 'site', label: 'Studio & contact' },
  { id: 'copy', label: 'Site text' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function App() {
  const [login, setLogin] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loaded, setLoaded] = useState<{ head: string; content: ContentSet } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const signInError = new URLSearchParams(window.location.search).get('error');

  useEffect(() => {
    void (async () => {
      try {
        const session = await whoami();
        setLogin(session?.login ?? null);
        if (session !== null) setLoaded(await loadContent());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'Could not reach the site.');
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) return <p className="centred">Loading…</p>;

  if (login === null) {
    return (
      <main className="centred sign-in">
        <h1>c.a.f.a atelier — editor</h1>
        <p>Sign in with the studio’s GitHub account to edit the site.</p>
        {signInError !== null && <p className="problem">{signInError}</p>}
        <a className="button button-primary" href="/auth/login">
          Sign in with GitHub
        </a>
      </main>
    );
  }

  if (failure !== null) return <p className="centred problem">{failure}</p>;
  if (loaded === null) return <p className="centred">Loading the site…</p>;

  return <Editing login={login} head={loaded.head} content={loaded.content} />;
}

interface EditingProps {
  login: string;
  head: string;
  content: ContentSet;
}

function Editing({ login, head, content }: EditingProps) {
  const editor = useEditor(content, head);
  const [section, setSection] = useState<SectionId>('works');

  // The browser's own guard is the only one that catches a closed tab.
  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.dirty]);

  return (
    <div className="shell">
      <header className="top">
        <h1 className="wordmark">c.a.f.a atelier — editor</h1>
        <PublishBar editor={editor} login={login} />
      </header>

      <div className="body">
        <nav className="sidebar" aria-label="Sections">
          <ul>
            {SECTIONS.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`sidebar-link${section === entry.id ? ' is-current' : ''}`}
                  aria-current={section === entry.id ? 'page' : undefined}
                  onClick={() => setSection(entry.id)}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
          <a className="sidebar-link sidebar-out" href="/auth/logout">
            Sign out
          </a>
        </nav>

        <main className="main">
          {editor.problems.length > 0 && (
            <section className="problems" aria-live="polite">
              <h2>
                {editor.problems.length} {editor.problems.length === 1 ? 'thing' : 'things'} to fix
                before this can be saved
              </h2>
              <ul>
                {editor.problems.slice(0, 12).map((problem) => (
                  <li key={`${problem.section}/${problem.record}/${problem.label}`}>
                    <strong>{problem.record}</strong> — {problem.label} {problem.message}
                  </li>
                ))}
              </ul>
              {editor.problems.length > 12 && (
                <p>…and {editor.problems.length - 12} more.</p>
              )}
            </section>
          )}

          {section === 'works' && <WorksEditor editor={editor} />}
          {section === 'programs' && <ProgramsEditor editor={editor} />}
          {section === 'mentors' && <MentorsEditor editor={editor} />}
          {section === 'site' && <SiteEditor editor={editor} />}
          {section === 'copy' && <CopyEditor editor={editor} />}
        </main>
      </div>
    </div>
  );
}
