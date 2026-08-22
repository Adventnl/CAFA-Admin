/**
 * The reference for whoever is building the site that reads this content.
 *
 * It draws nothing of its own. Everything on the page — the endpoints, their
 * parameters, their shapes, the prose at the top — is read from /api.json,
 * which the Worker compiles from the connector registry on the way out. So this
 * panel cannot describe an endpoint that does not exist, and cannot miss one
 * that does; adding a connector in worker/connectors/registry.ts makes a card
 * appear here with no change to this file.
 *
 * Every connector is a GET over published content, so "try it" is a real
 * request to the real endpoint rather than a mock. There is nothing here that
 * can change anything: the writing half of the API is behind the session and is
 * not in the document at all.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  connectorService,
  DOCUMENT_PATH,
  groupsOf,
  resolvePath,
  type ApiDocument,
  type ConnectorView,
} from '../services/connectors';

/** A long answer is truncated on screen; the whole of it is one click away. */
const SHOWN = 12_000;

export function DevPanelPage() {
  const { t } = useTranslation();
  const [spec, setSpec] = useState<ApiDocument | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSpec(await connectorService.document());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : t('devPage.documentFailed'));
      }
    })();
  }, []);

  if (failure !== null) return <p className="problem">{failure}</p>;
  if (spec === null) return <p className="empty">{t('devPage.loading')}</p>;

  const groups = groupsOf(spec);
  const server = spec.servers[0]?.url ?? window.location.origin;
  const count = Object.keys(spec.paths).length;

  return (
    <section className="dev">
      <div className="section-head">
        <h2>{t('pages.developer')}</h2>
        <span className="pill">v{spec.info.version}</span>
        <span className="pill">OpenAPI {spec.openapi}</span>
        <span className="pill">
          {t('devPage.connectors', { count })}
        </span>
      </div>
      <p className="section-note">
        {t('devPage.intro')}
      </p>

      <div className="dev-server">
        <div>
          <span className="tile-label">{t('devPage.server')}</span>
          <code className="dev-origin">{server}</code>
        </div>
        <a className="button" href={DOCUMENT_PATH} download="api.json">
          {t('devPage.download')}
        </a>
      </div>

      <p className="dev-overview">{plain(spec.info.description)}</p>

      <div className="dev-layout">
        <nav className="dev-index" aria-label="Connectors">
          {groups.map((group) => (
            <div key={group.name} className="dev-index-group">
              <span className="dev-index-title">{group.name}</span>
              <ul>
                {group.connectors.map((connector) => (
                  <li key={connector.id}>
                    <a href={`#${connector.id}`}>
                      <code>{short(connector.path)}</code>
                      <span className="method">GET</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="dev-main">
          {groups.map((group) => (
            <div key={group.name} className="dev-group">
              <h3 className="panel-heading">{group.name}</h3>
              <p className="section-note">{plain(group.description)}</p>
              {group.connectors.map((connector) => (
                <ConnectorCard key={connector.id} connector={connector} server={server} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface ConnectorCardProps {
  connector: ConnectorView;
  server: string;
}

function ConnectorCard({ connector, server }: ConnectorCardProps) {
  const { t } = useTranslation();
  // Path parameters start at their example so the first request works; query
  // parameters start empty, because empty is what a client sends by default and
  // that is the answer worth seeing first.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      connector.params.map((param) => [param.name, param.in === 'path' ? (param.example ?? '') : '']),
    ),
  );
  const [result, setResult] = useState<{ status: number; ok: boolean; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const path = resolvePath(connector, values);

  async function send(): Promise<void> {
    setBusy(true);
    try {
      setResult(await connectorService.probe(path));
    } catch (error) {
      setResult({
        status: 0,
        ok: false,
        body: error instanceof Error ? error.message : t('devPage.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="connector" id={connector.id}>
      <div className="connector-head">
        <span className="method">GET</span>
        <code className="connector-path">{connector.path}</code>
      </div>

      <h4 className="connector-summary">{connector.summary}</h4>
      <p className="connector-note">{plain(connector.description)}</p>

      {connector.params.length > 0 && (
        <div className="connector-params">
          {connector.params.map((param) => (
            <label key={param.name} className="connector-param">
              <span className="field-label">
                {param.name}
                <span className="connector-param-kind">
                  {param.in}
                  {param.required ? ' · required' : ''}
                </span>
              </span>

              {param.schema?.enum === undefined ? (
                <input
                  className="input"
                  value={values[param.name] ?? ''}
                  placeholder={param.example ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [param.name]: event.target.value }))
                  }
                />
              ) : (
                <select
                  className="input"
                  value={values[param.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [param.name]: event.target.value }))
                  }
                >
                  {!param.required && <option value="">— any —</option>}
                  {param.schema.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              <span className="field-hint">{param.description}</span>
            </label>
          ))}
        </div>
      )}

      <div className="connector-run">
        <code className="connector-curl">
          curl {server}
          {path}
        </code>
        <button type="button" className="button" disabled={busy} onClick={() => void send()}>
          {busy ? t('devPage.sending') : t('devPage.send')}
        </button>
      </div>

      {result !== null && (
        <div className="connector-result">
          <span className={`pill${result.ok ? '' : ' pill-warn'}`}>
            {result.status === 0 ? 'No answer' : result.status}
          </span>
          <pre className="connector-body">
            {result.body.length > SHOWN
              ? `${result.body.slice(0, SHOWN)}\n\n… ${result.body.length - SHOWN} more characters. Open ${path} in a tab for the whole of it.`
              : result.body}
          </pre>
        </div>
      )}

      {connector.schema !== undefined && (
        <details className="connector-schema">
          <summary>{t('devPage.response')}</summary>
          <pre className="connector-body">{JSON.stringify(connector.schema, null, 2)}</pre>
        </details>
      )}
    </article>
  );
}

/**
 * The document's prose, with its markdown taken off.
 *
 * The descriptions are markdown because that is what an OpenAPI description is,
 * and every reader on the other end — Scalar, Swagger UI, a generated client's
 * doc comments — renders it. This panel is the one reader that does not, and a
 * dependency on a markdown renderer to show three asterisks correctly is a poor
 * trade. The emphasis marks come off; the words and the line breaks stay.
 */
function plain(markdown: string): string {
  return markdown.replaceAll('**', '').replaceAll('`', '');
}

/**
 * A path as the index shows it, without the prefix every path shares.
 *
 * The column is narrow and `/api/v1/` is eight characters of it that never
 * distinguish one entry from another; dropping them is what lets the rest fit
 * on one line instead of breaking a `{slug}` in half. The cards below, which
 * are what someone copies from, still show the whole path.
 */
function short(path: string): string {
  return path.replace(/^\/api\/v\d+/, '') || path;
}
