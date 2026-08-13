/**
 * api.json, compiled.
 *
 * There is no OpenAPI file in this repository, and that is the design. A
 * checked-in document is a copy of the route table that nobody updates in the
 * same commit as the route; this one is built from worker/connectors/registry.ts
 * on the way out, so it is never more or less than what the Worker will
 * actually answer. Adding a connector publishes its documentation.
 *
 * 3.1 rather than 3.0 because 3.1 *is* JSON Schema — the shapes in schema.ts go
 * in as they are, and a generator on the other end produces types that match
 * what arrives rather than a dialect approximation of it.
 *
 * The server is the origin the document was fetched from. That means the copy a
 * developer downloads from the dev panel on localhost points at localhost, and
 * the one downloaded from the deployed admin points at the deployed admin —
 * which is almost always what was meant, and never a hostname pasted in by hand.
 * The scheme is the one exception, and `servedOver` says why.
 */
import { API_VERSION, CONNECTORS, documentedPath, GROUPS } from './registry';
import { COMPONENTS, type JsonSchema } from './schema';
import type { Connector } from './connector';

interface DocumentedParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  schema: JsonSchema;
  example: string;
}

interface DocumentedResponse {
  description: string;
  content: { 'application/json': { schema: JsonSchema } };
}

interface DocumentedOperation {
  operationId: string;
  tags: string[];
  summary: string;
  description: string;
  parameters?: DocumentedParameter[];
  responses: Record<string, DocumentedResponse>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  /**
   * Empty, and said out loud. An absent `security` means "unspecified", which a
   * generator is free to read as "figure it out"; an empty array means these
   * endpoints take no credentials, which is the fact.
   */
  security: never[];
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, { get: DocumentedOperation }>;
  components: { schemas: Record<string, JsonSchema> };
}

const OVERVIEW = `The c.a.f.a atelier's content, read-only.

Everything here answers the newest **published** revision — what is on the public
site right now. There is no way to write through this API and no way to read an
unpublished edit: the studio's own editing endpoints sit behind a session cookie
and are not described here.

Every successful answer has the same two fields:

    { "revision": 42, "data": … }

\`revision\` is the snapshot the data was cut from, so anything you cache can be
checked against \`/api/v1/revision\` with one small request rather than a refetch.

Photographs are not served through this API. Content refers to a photograph by
its object key, and \`site.mediaBase\` — or the \`url\` on each entry of
\`/api/v1/photographs\` — resolves that key against the media origin, so an
\`<img src>\` reaches the CDN directly.

Any origin may read these endpoints. They carry only what is already public.`;

/** A successful answer: the envelope, with this connector's shape inside it. */
function answerSchema(connector: Connector): JsonSchema {
  return {
    type: 'object',
    properties: {
      revision: {
        type: 'integer',
        description: 'The published revision this data was cut from.',
      },
      data: connector.returns,
    },
    required: ['revision', 'data'],
  };
}

function parameterSchema(values: readonly string[] | undefined): JsonSchema {
  return values === undefined ? { type: 'string' } : { type: 'string', enum: values };
}

function operationOf(connector: Connector): DocumentedOperation {
  const parameters = (connector.params ?? []).map<DocumentedParameter>((param) => ({
    name: param.name,
    in: param.in,
    required: param.required,
    description: param.description,
    schema: parameterSchema(param.values),
    example: param.example,
  }));

  const responses: Record<string, DocumentedResponse> = {
    '200': {
      description: connector.summary,
      content: { 'application/json': { schema: answerSchema(connector) } },
    },
    '404': {
      description:
        'Either nothing has been published yet, or what was asked for is not in the published revision.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  };

  return {
    operationId: connector.id,
    tags: [connector.group],
    summary: connector.summary,
    description: connector.description,
    ...(parameters.length === 0 ? {} : { parameters }),
    responses,
  };
}

/**
 * The origin, over the scheme it is actually reachable on.
 *
 * `url.origin` reports the scheme the *caller* used, so fetching this document
 * over plain HTTP bakes `http://` into `servers` — and a generator turns that
 * into a client whose base URL costs a redirect on every request, or is refused
 * outright as mixed content on an HTTPS page. The deployed admin is reachable
 * over HTTPS whatever scheme was asked for, so the document says so.
 *
 * Loopback is left alone: `wrangler dev` genuinely serves HTTP, and a forced
 * `https://localhost` would be the same bug pointing the other way.
 */
function servedOver(origin: string): string {
  const url = new URL(origin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return origin;

  url.protocol = 'https:';
  return url.origin;
}

export function buildDocument(origin: string): OpenApiDocument {
  const paths: Record<string, { get: DocumentedOperation }> = {};
  for (const connector of CONNECTORS) {
    paths[documentedPath(connector.path)] = { get: operationOf(connector) };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'c.a.f.a atelier — content API',
      version: API_VERSION,
      description: OVERVIEW,
    },
    security: [],
    servers: [{ url: servedOver(origin), description: 'The admin, which is also the API.' }],
    tags: GROUPS.map((group) => ({ name: group.name, description: group.description })),
    paths,
    components: { schemas: COMPONENTS },
  };
}
