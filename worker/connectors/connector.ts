/**
 * What a connector is.
 *
 * A connector is one public, read-only view of the published content: a path, a
 * description of what comes back, and a function that cuts that view out of the
 * newest revision. Nothing here writes, and there is no verb but GET — the
 * studio's own editing endpoints are the authenticated half of the API and they
 * are not in this list.
 *
 * The point of declaring all three together is that api.json is compiled from
 * exactly this list. Adding a connector to worker/connectors/registry.ts adds
 * the route, the entry in the document, and the card in the dev panel, in one
 * edit, with no file to remember to regenerate.
 */
import type { ImageRef, Mentor, Program, Work } from '../../src/content/types';
import type { JsonSchema } from './schema';

/** A path or query parameter, as both the docs and the dev panel read it. */
export interface ConnectorParam {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  /** Prefilled in the dev panel's try-it box, so a first request works. */
  example: string;
  /** The accepted values, when there is a fixed set of them. */
  values?: readonly string[];
}

export interface ConnectorRequest {
  /** Captured from the path — `:slug` and friends. */
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
}

/** The site's chrome and its studio, as a published revision carries it. */
export interface PublishedSite {
  name: { zh: string; en: string };
  url: string;
  locales: string[];
  localeNames: { zh: string; en: string };
  nav: unknown[];
  studio: ImageRef[];
  contact: unknown;
}

/**
 * The published bundle, typed for reading.
 *
 * worker/domain/bundle.ts declares most of these `unknown`, because building
 * one is a projection and nothing there needs to look inside the result. Here
 * we are the reader, so the same JSON is described in the terms the connectors
 * slice it in. A private work still fits `Work`: the projection keeps every
 * field and empties the two that name photographs.
 */
export interface ReadableBundle {
  site: PublishedSite;
  works: Work[];
  programs: Program[];
  mentors: Mentor[];
  dictionaries: Record<string, unknown>;
  media: Record<string, { width: number; height: number }>;
  mediaBase: string;
}

/** The newest revision, parsed once per request. */
export interface PublishedContent {
  revision: number;
  publishedAt: string;
  bundle: ReadableBundle;
}

export interface Connector {
  /** Stable id: the operationId in the document and the anchor in the dev panel. */
  id: string;
  /** The tag it is grouped under, which is also a heading in the dev panel. */
  group: string;
  /** The route template, in the router's own notation — `/api/v1/works/:slug`. */
  path: string;
  summary: string;
  description: string;
  params?: readonly ConnectorParam[];
  /** The shape of `data` in the answer. */
  returns: JsonSchema;
  /** The view itself. Throws ApiException when what was asked for is not there. */
  read: (published: PublishedContent, request: ConnectorRequest) => unknown;
}

export interface ConnectorGroup {
  name: string;
  description: string;
}

/**
 * What every connector answers with.
 *
 * The revision travels with the data on purpose. A client that caches anything
 * needs to know which snapshot it cached, and asking a second endpoint for that
 * is a race — the revision could change between the two calls.
 */
export interface ConnectorAnswer {
  revision: number;
  data: unknown;
}
