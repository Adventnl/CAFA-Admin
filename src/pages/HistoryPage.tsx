/**
 * Every revision that has ever been live, and the way back to one.
 *
 * Restoring does not rewind anything. It publishes the chosen revision's
 * content as a *new* revision, so the history only ever grows and whatever is
 * live right now stays recoverable after you have rolled away from it. That is
 * why the confirmation below says "publish it again" rather than "roll back" —
 * the wording is the model.
 *
 * The one thing to be careful about is unsaved work: restoring re-publishes an
 * old snapshot, but the draft tables are untouched, so a dirty editor would
 * still be sitting on edits that are now behind the live site. The confirmation
 * says so when that is the case.
 */
import { useCallback, useEffect, useState } from 'react';

import { publishService } from '../services/publish';
import type { RevisionSummary } from '../services/types';
import type { Editor } from '../useEditor';

interface HistoryPageProps {
  editor: Editor;
}

export function HistoryPage({ editor }: HistoryPageProps) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRevisions(await publishService.revisions());
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'The history could not be read.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRestore(id: number): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const result = await publishService.restore(id);
      setConfirming(null);
      setNotice(
        `Revision ${result.restoredFrom ?? id} is being published again as revision ${
          result.revision ?? '?'
        }. The live site updates in a minute or two.`,
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The restore failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>History</h2>
      </div>
      <p className="section-note">
        Each publish appends a revision. Restoring one publishes its content again as a new
        revision, so nothing that was ever live is lost.
      </p>

      {failure !== null && <p className="problem">{failure}</p>}
      {notice !== null && <p className="publish-notice">{notice}</p>}

      {revisions === null && failure === null && <p className="empty">Reading the history…</p>}
      {revisions !== null && revisions.length === 0 && (
        <p className="empty">Nothing has been published yet.</p>
      )}

      {revisions !== null && revisions.length > 0 && (
        <ul className="repeatable-list">
          {revisions.map((revision, at) => (
            <li key={revision.id} className="repeatable-item">
              <div className="repeatable-head">
                <div className="repeatable-title">
                  <span className="works-index">{revision.id}</span> {revision.message}
                  {at === 0 && <span className="pill">Live</span>}
                </div>
                <div className="repeatable-controls">
                  {at !== 0 && (
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={busy}
                      onClick={() => setConfirming(revision.id)}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>

              <p className="works-meta">
                {revision.published_by} · {formatPublished(revision.published_at)}
              </p>

              {confirming === revision.id && (
                <div className="confirm">
                  <p>
                    Publish revision {revision.id} again? It becomes the newest revision and the
                    live site rebuilds.
                  </p>
                  {editor.dirty && (
                    <p className="problem">
                      You have unsaved edits. They stay in the draft and will be behind the live
                      site until you save and publish again.
                    </p>
                  )}
                  <div className="repeatable-controls">
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={busy}
                      onClick={() => void onRestore(revision.id)}
                    >
                      {busy ? 'Restoring…' : 'Restore it'}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * D1 stores `datetime('now')`, which is UTC without a zone marker. Saying so
 * explicitly stops the browser reading it as local time and showing a publish
 * that happened minutes ago as hours off.
 */
function formatPublished(value: string): string {
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
