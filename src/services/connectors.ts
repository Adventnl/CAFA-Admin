/**
 * The compiled document, as the dev panel reads it.
 *
 * The panel does not keep its own list of endpoints. It fetches /api.json —
 * the same file a frontend developer downloads — and draws whatever is in it,
 * which is the only way the two can be guaranteed to agree. A connector added
 * in worker/connectors/registry.ts appears here without this file changing.
 *
 * `request()` is not used: the read API deliberately answers outside the
 * `{ success, data, code, msg }` envelope, so there is nothing to unwrap and
 * the helper that unwraps it would reject every response.
 */

/** Where the Worker compiles the document. */
export const DOCUMENT_PATH = '/api.json';

export interface DocumentedParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  /** What the dev panel prefills its box with. */
  example?: string;
  schema?: { type?: string; enum?: string[] };
}

export interface DocumentedOperation {
  operationId: string;
  tags: string[];
  summary: string;
  description: string;
  parameters?: DocumentedParameter[];
  responses: Record<string, { description: string; content?: Record<string, { schema: unknown }> }>;
}

export interface ApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, { get: DocumentedOperation }>;
  components: { schemas: Record<string, unknown> };
}

/** One endpoint, flattened out of `paths` into something a card can render. */
export interface ConnectorView {
  id: string;
  group: string;
  path: string;
  summary: string;
  description: string;
  params: DocumentedParameter[];
  /** The 200 body's schema, shown on demand rather than by default. */
  schema: unknown;
}

export interface ConnectorGroupView {
  name: string;
  description: string;
  connectors: ConnectorView[];
}

export const connectorService = {
  document: async (): Promise<ApiDocument> => {
    const response = await fetch(DOCUMENT_PATH, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The API document could not be read (${response.status}).`);
    return response.json<ApiDocument>();
  },

  /**
   * A real request to a real connector, answered as text.
   *
   * Deliberately unparsed: what the panel is showing is what came back, and a
   * 404's envelope is as interesting as a 200's data — more so, usually, since
   * it is the one that says nothing has been published yet.
   */
  probe: async (path: string): Promise<{ status: number; ok: boolean; body: string }> => {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    const body = await response.text();
    return { status: response.status, ok: response.ok, body: pretty(body) };
  },
};

/** JSON if it is JSON, and whatever arrived if it is not. */
function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body) as unknown, null, 2);
  } catch {
    return body;
  }
}

/**
 * The document's endpoints, grouped by tag and in the order the document
 * declares its tags — which is the order the registry declares its groups, so
 * the panel reads the way the API was meant to be read rather than
 * alphabetically.
 */
export function groupsOf(document: ApiDocument): ConnectorGroupView[] {
  const connectors: ConnectorView[] = Object.entries(document.paths).map(([path, item]) => ({
    id: item.get.operationId,
    group: item.get.tags[0] ?? 'Other',
    path,
    summary: item.get.summary,
    description: item.get.description,
    params: item.get.parameters ?? [],
    schema: item.get.responses['200']?.content?.['application/json']?.schema,
  }));

  return document.tags
    .map((tag) => ({
      name: tag.name,
      description: tag.description,
      connectors: connectors.filter((connector) => connector.group === tag.name),
    }))
    .filter((group) => group.connectors.length > 0);
}

/** How many endpoints the document describes. The control panel shows it. */
export function connectorCount(document: ApiDocument): number {
  return Object.keys(document.paths).length;
}

/**
 * A connector's path with its parameters filled in.
 *
 * Path parameters are substituted and encoded; query parameters are appended
 * when they have been given a value, and left out when they have not — which
 * is what makes the try-it box's empty state the same request a client would
 * make with no options at all.
 */
export function resolvePath(connector: ConnectorView, values: Record<string, string>): string {
  let path = connector.path;
  const query = new URLSearchParams();

  for (const param of connector.params) {
    const value = values[param.name]?.trim() ?? '';
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, encodeURIComponent(value));
      continue;
    }
    if (value !== '') query.set(param.name, value);
  }

  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
}
