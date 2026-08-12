/**
 * Saving, previewing and publishing — the three states the studio cares about,
 * and the only place the difference between a draft and the live site is
 * explained.
 *
 * "Is it live yet?" is answered by asking the site itself: the template writes
 * build-info.json with the revision it was built from, and the Worker fetches
 * it. A published revision that matches what the origin is serving means the
 * deploy landed. Nothing here infers it from elapsed time.
 *
 * The preview answers the same question against the draft, which has no
 * revision number of its own — so it reports a fingerprint of the content
 * instead, and the comparison is otherwise identical.
 */
import { useCallback, useEffect, useState } from 'react';

import { publishService } from '../services/publish';
import type { SiteStatus } from '../services/types';
import type { Editor } from '../useEditor';

/** How often to re-ask while a build is in flight. */
const POLL_MS = 15_000;

type Deployment = 'current' | 'building' | 'unknown';

function deploymentOf(expected: number | null, actual: number | null): Deployment {
  if (actual === null || expected === null) return 'unknown';
  return actual === expected ? 'current' : 'building';
}

interface PublishBarProps {
  editor: Editor;
  login: string;
}

export function PublishBar({ editor, login }: PublishBarProps) {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await publishService.status());
    } catch {
      // A failed status poll is not worth interrupting an edit over; the next
      // one will either succeed or the save will surface the real problem.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview =
    status === null ? 'unknown' : deploymentOf(status.draftRevision, status.preview.revision);
  const production =
    status === null ? 'unknown' : deploymentOf(status.latestRevision, status.production.revision);
  const settling = preview === 'building' || production === 'building';

  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [settling, refresh]);

  const blocked = editor.problems.length > 0;
  const unpublished = status?.unpublished ?? false;

  async function onSave(): Promise<void> {
    setNotice(null);
    if (await editor.save()) {
      setNotice('Saved. The preview will catch up in a minute or two.');
      await refresh();
    }
  }

  async function onPublish(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const result = await publishService.publish();
      setNotice(
        result.published
          ? `Publishing revision ${result.revision}. The live site updates in a minute or two.`
          : (result.reason ?? 'Nothing to publish.'),
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publishing failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish-bar">
      <div className="publish-state">
        <span className="publish-who">{login}</span>

        {editor.dirty ? (
          <span className="pill pill-warn">Unsaved changes</span>
        ) : (
          <span className="pill">Everything saved</span>
        )}

        {unpublished && <span className="pill pill-warn">Not yet live</span>}

        {status?.latestRevision != null && (
          <span className="pill">Revision {status.latestRevision}</span>
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

        <button
          type="button"
          className="button button-primary"
          disabled={!editor.dirty || editor.saving || editor.uploading || blocked}
          onClick={() => void onSave()}
        >
          {editor.saving ? 'Saving…' : 'Save draft'}
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={busy || editor.dirty || !unpublished}
          onClick={() => void onPublish()}
        >
          {busy ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {editor.error !== null && <p className="problem publish-notice">{editor.error}</p>}
      {notice !== null && <p className="publish-notice">{notice}</p>}
      {editor.dirty && unpublished && (
        <p className="publish-notice">Save before publishing, or the newest edits stay behind.</p>
      )}
    </div>
  );
}
