/**
 * Saving, previewing and publishing — the three states the studio cares about,
 * and the only place the difference between a draft and the live site is
 * explained.
 *
 * "Is it live yet?" is answered by asking the site itself: the template writes
 * build-info.json with the commit it was built from, and the Worker fetches it.
 * A branch head that matches what the origin is serving means the deploy landed.
 * Nothing here infers it from elapsed time.
 */
import { useCallback, useEffect, useState } from 'react';

import { catchUp, getStatus, publish, type SiteStatus } from '../api';
import type { Editor } from '../useEditor';

/** How often to re-ask while a build is in flight. */
const POLL_MS = 15_000;

type Deployment = 'current' | 'building' | 'unknown';

function deploymentOf(expected: string, actual: string | null): Deployment {
  if (actual === null) return 'unknown';
  return actual === expected ? 'current' : 'building';
}

interface PublishBarProps {
  editor: Editor;
  login: string;
}

export function PublishBar({ editor, login }: PublishBarProps) {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState<null | 'publishing' | 'catching-up'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getStatus());
    } catch {
      // A failed status poll is not worth interrupting an edit over; the next
      // one will either succeed or the save will surface the real problem.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview = status === null ? 'unknown' : deploymentOf(status.draftHead, status.preview.commit);
  const production =
    status === null ? 'unknown' : deploymentOf(status.productionHead, status.production.commit);
  const settling = preview === 'building' || production === 'building';

  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [settling, refresh]);

  const blocked = editor.problems.length > 0;

  async function onSave(): Promise<void> {
    setNotice(null);
    const saved = await editor.save('Edit content from the studio admin');
    if (saved) {
      setNotice('Saved to the draft. The preview will catch up in a minute or two.');
      await refresh();
    }
  }

  async function onPublish(): Promise<void> {
    setBusy('publishing');
    setNotice(null);
    try {
      const result = await publish();
      setNotice(
        result.published
          ? 'Publishing. The live site updates in a minute or two.'
          : (result.reason ?? 'Nothing to publish.'),
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publishing failed.');
    } finally {
      setBusy(null);
    }
  }

  async function onCatchUp(): Promise<void> {
    setBusy('catching-up');
    setNotice(null);
    try {
      await catchUp();
      setNotice('The draft now includes the latest site changes. Reload to edit the newest copy.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not catch up.');
    } finally {
      setBusy(null);
    }
  }

  const unpublished = status?.unpublished ?? 0;
  const behind = status !== null && (status.standing.status === 'behind' || status.standing.status === 'diverged');

  return (
    <div className="publish-bar">
      <div className="publish-state">
        <span className="publish-who">{login}</span>

        {editor.dirty ? (
          <span className="pill pill-warn">Unsaved changes</span>
        ) : (
          <span className="pill">Everything saved</span>
        )}

        {unpublished > 0 && (
          <span className="pill pill-warn">
            {unpublished} {unpublished === 1 ? 'change' : 'changes'} not yet live
          </span>
        )}

        {preview === 'building' && <span className="pill">Preview building…</span>}
        {production === 'building' && <span className="pill">Publishing…</span>}
      </div>

      <div className="publish-actions">
        {status?.preview.url != null && (
          <a className="button" href={status.preview.url} target="_blank" rel="noreferrer">
            View draft
          </a>
        )}
        <a
          className="button"
          href={status?.production.url ?? '#'}
          target="_blank"
          rel="noreferrer"
        >
          View live site
        </a>

        {behind && (
          <button
            type="button"
            className="button"
            disabled={busy !== null}
            onClick={() => void onCatchUp()}
          >
            {busy === 'catching-up' ? 'Catching up…' : 'Catch up with the site'}
          </button>
        )}

        <button
          type="button"
          className="button button-primary"
          disabled={!editor.dirty || editor.saving || blocked}
          onClick={() => void onSave()}
        >
          {editor.saving ? 'Saving…' : 'Save draft'}
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={busy !== null || editor.dirty || unpublished === 0}
          onClick={() => void onPublish()}
        >
          {busy === 'publishing' ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {editor.error !== null && <p className="problem publish-notice">{editor.error}</p>}
      {notice !== null && <p className="publish-notice">{notice}</p>}
      {editor.dirty && unpublished > 0 && (
        <p className="publish-notice">Save before publishing, or the newest edits stay behind.</p>
      )}
    </div>
  );
}
