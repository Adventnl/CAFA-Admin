/**
 * GET /api.json, and GET on every connector in the registry.
 *
 * One action serves all of them, bound to a different connector at
 * registration — the alternative being a controller method per view, each of
 * which would be the same four lines with a different noun in the middle.
 *
 * Like the two build endpoints, these answer outside the `ApiResponse`
 * envelope, and for a related reason: this is a contract with a *different*
 * codebase. A frontend fetching `/api/v1/works` wants the works, and the
 * revision it should attribute them to. It does not want `success: true` — the
 * HTTP status already said that, and a generated client would have to unwrap
 * two layers to reach an array. Failures do wear the admin's envelope, because
 * a failure has a message in it that is worth showing to someone.
 *
 * A minute of caching. These are read by a frontend rather than by a build, so
 * a burst of requests for one page should not be a burst of D1 reads; and a
 * publish that lands mid-minute is a photograph appearing sixty seconds late,
 * which is not the same class of problem as a build shipping the previous
 * revision — which is why the build endpoints stay `no-store`.
 */
import type { Connector } from '../connectors/connector';
import { buildDocument } from '../connectors/openapi';
import type { ConnectorService } from '../services/connector.service';
import type { Handler, RequestContext } from '../shared/router';

const CACHE = 'public, max-age=60';

export class ConnectorsController {
  constructor(private readonly connectors: ConnectorService) {}

  /** The action for one connector. Registered once per entry in the registry. */
  action = (connector: Connector): Handler<RequestContext> => {
    return async ({ url, params }: RequestContext): Promise<Response> => {
      const answer = await this.connectors.read(connector, { params, query: url.searchParams });
      return json(JSON.stringify(answer));
    };
  };

  /**
   * The document itself, compiled on the way out — so it describes the routes
   * this Worker is running, not the routes it was running when someone last
   * remembered to regenerate a file.
   */
  document = ({ url }: RequestContext): Response => {
    // Indented: it is read by people at least as often as by generators.
    return json(JSON.stringify(buildDocument(url.origin), null, 2));
  };
}

function json(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': CACHE },
  });
}
