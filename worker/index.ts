/**
 * The server half of the admin.
 *
 * It holds two things the browser must not: the session, and the only writable
 * handle on the content. Everything else is a thin, typed pass-through to D1
 * and R2.
 *
 * The publishing model, in one paragraph. Saving writes the live tables — that
 * is the draft, and it is what the preview build reads. Publishing snapshots
 * those tables into an append-only `revision` row and pokes a Cloudflare deploy
 * hook, and the production build reads the newest revision. So the draft/main
 * branch pair became live-tables/newest-revision, "how far ahead is the draft"
 * became "does the draft differ from the newest revision", and the commit SHA
 * in build-info.json became a revision number. Nothing else about the studio's
 * day changed.
 */
import { buildBundle } from './bundle';
import { readContent, readMedia, recordMedia, writeContent } from './db';
import { contentTypeOf, getMedia, isMediaKey, measure, putMedia } from './media';
import {
  clearedSessionCookie,
  clearedStateCookie,
  readSession,
  readState,
  sealSession,
  sealState,
  sessionCookie,
  stateCookie,
  type Session,
} from './session';
import { checkContent } from '../src/content/validate';
import type { ContentSet } from '../src/content/types';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;

  OWNER_LOGIN: string;
  /** Where the originals are served from, so the template can transform them. */
  MEDIA_BASE: string;
  /**
   * The public site's origin. Polled for build-info.json, and stamped into the
   * published bundle as `site.url` — see worker/bundle.ts for why it lives here
   * rather than in the database.
   */
  PRODUCTION_URL: string;
  PREVIEW_URL?: string;

  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;

  /** Cloudflare deploy hooks. Absent means that half simply does not fire. */
  DEPLOY_HOOK_URL?: string;
  PREVIEW_DEPLOY_HOOK_URL?: string;
  /** Lets the preview build read the draft. Absent means no draft endpoint. */
  PREVIEW_TOKEN?: string;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What a deployed origin says it was built from. The template writes this at
 * build time; comparing it to the newest revision is how the admin answers "is
 * it live yet" without needing Cloudflare API credentials.
 */
async function liveRevision(origin: string | undefined): Promise<number | null> {
  if (origin === undefined || origin === '') return null;
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/build-info.json`, {
      cf: { cacheTtl: 0 },
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return null;
    const info = await response.json<{ revision?: unknown }>();
    return typeof info.revision === 'number' ? info.revision : null;
  } catch {
    return null;
  }
}

/**
 * Poking a deploy hook is fire-and-forget on purpose: the studio's save should
 * not fail because a build queue was briefly slow, and the status poll will
 * show whether the build landed anyway.
 */
async function poke(url: string | undefined): Promise<void> {
  if (url === undefined || url === '') return;
  try {
    await fetch(url, { method: 'POST' });
  } catch {
    // Reported by the status poll, not by the save.
  }
}

interface Revision {
  id: number;
  content: string;
  message: string;
  published_at: string;
  published_by: string;
}

async function newestRevision(env: Env): Promise<Revision | null> {
  return env.DB.prepare('SELECT * FROM revision ORDER BY id DESC LIMIT 1').first<Revision>();
}

/** The draft, in exactly the form a published revision takes, so the two compare. */
async function draftBundle(env: Env): Promise<string> {
  const [content, media] = await Promise.all([readContent(env.DB), readMedia(env.DB)]);
  return JSON.stringify(buildBundle(content, media, env.MEDIA_BASE, env.PRODUCTION_URL));
}

/**
 * A number that changes when the draft does.
 *
 * The preview is built from the draft, which has no revision id — so it needs
 * something else to write into build-info.json for "is the preview showing what
 * I last saved" to be answerable the same way the production question is.
 * FNV-1a over the bundle is enough: this compares two builds of the same
 * content, so a collision would have to be between two drafts one save apart.
 */
function fingerprint(text: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const redirect = new URL('/auth/callback', new URL(request.url).origin);

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirect.toString());
  // GitHub is the sign-in and nothing more now that the content lives in D1.
  // The token this returns cannot read or write a repository, which is one
  // fewer credential worth stealing from a session cookie.
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': stateCookie(await sealState(env.SESSION_SECRET, state)),
    },
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = await readState(request, env.SESSION_SECRET);

  const deny = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `/?error=${encodeURIComponent(reason)}`,
        'Set-Cookie': clearedStateCookie(),
      },
    });

  if (code === null || state === null || expected === null || state !== expected) {
    return deny('That sign-in link expired. Try again.');
  }

  const exchange = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL('/auth/callback', url.origin).toString(),
    }),
  });

  const granted = await exchange.json<{ access_token?: string }>();
  if (typeof granted.access_token !== 'string') return deny('GitHub refused the sign-in.');

  const account = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${granted.access_token}`,
      'User-Agent': 'cafa-admin',
    },
  });
  if (!account.ok) return deny('GitHub would not say who you are.');
  const { login } = await account.json<{ login: string }>();

  // The account check is the whole access-control model. It happens after the
  // OAuth round trip because that is the first moment we know who signed in.
  if (login.toLowerCase() !== env.OWNER_LOGIN.toLowerCase()) {
    return deny(`${login} is not the studio account.`);
  }

  // Only the login is kept. There is no longer a token worth storing.
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', '/'],
      ['Set-Cookie', sessionCookie(await sealSession(env.SESSION_SECRET, { login }))],
      ['Set-Cookie', clearedStateCookie()],
    ],
  });
}

/** Every /api route below this point has a session; the router enforces it. */
async function handleApi(
  request: Request,
  env: Env,
  session: Session,
  path: string,
): Promise<Response> {
  if (path === '/api/session') {
    return json({ login: session.login });
  }

  if (path === '/api/content' && request.method === 'GET') {
    const [content, media] = await Promise.all([readContent(env.DB), readMedia(env.DB)]);
    return json({ content, media });
  }

  if (path === '/api/save' && request.method === 'POST') {
    const body: unknown = await request.json();
    if (!isRecord(body) || !isRecord(body.content)) {
      return json({ error: 'Malformed save.' }, 400);
    }

    const content = body.content as unknown as ContentSet;

    // The same rules the form applies, applied again where they cannot be
    // skipped by a client that has been edited or replaced.
    const problems = checkContent(content);
    if (problems.length > 0) {
      return json(
        {
          error: `${problems.length} ${problems.length === 1 ? 'field needs' : 'fields need'} fixing before this can be saved.`,
          problems,
        },
        422,
      );
    }

    try {
      await writeContent(env.DB, content);
    } catch (error) {
      // A shape the validator accepts but the schema refuses — a missing
      // media row behind an image, most likely. Worth the real message.
      return json(
        { error: error instanceof Error ? error.message : 'The save was refused.' },
        400,
      );
    }

    await poke(env.PREVIEW_DEPLOY_HOOK_URL);
    return json({ saved: true });
  }

  if (path === '/api/media' && request.method === 'GET') {
    const key = new URL(request.url).searchParams.get('key');
    if (key === null || !isMediaKey(key)) return json({ error: 'Not a media key.' }, 400);

    const object = await getMedia(env.MEDIA, key);
    if (object === null) return json({ error: 'No such image.' }, 404);

    return new Response(object.body, {
      headers: {
        'Content-Type': contentTypeOf(key),
        // Keyed by nothing but the path, so a replaced photograph needs a
        // cache-buster from the client. It appends one on save.
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  if (path === '/api/media' && request.method === 'POST') {
    const key = new URL(request.url).searchParams.get('key');
    if (key === null || !isMediaKey(key)) {
      return json({ error: 'Not a media key the admin may write.' }, 400);
    }

    const body = await request.arrayBuffer();
    let measured;
    try {
      measured = measure(body);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unreadable image.' }, 400);
    }

    // The object first, then the row: a row pointing at an object that is not
    // there yet is the only ordering that can break a build.
    await putMedia(env.MEDIA, key, body);
    await recordMedia(env.DB, { key, ...measured });

    return json({ key, ...measured });
  }

  if (path === '/api/status' && request.method === 'GET') {
    const [newest, draft] = await Promise.all([newestRevision(env), draftBundle(env)]);
    const [live, preview] = await Promise.all([
      liveRevision(env.PRODUCTION_URL),
      liveRevision(env.PREVIEW_URL),
    ]);

    return json({
      latestRevision: newest?.id ?? null,
      publishedAt: newest?.published_at ?? null,
      // No revision yet means everything is unpublished, including nothing.
      unpublished: newest === null ? true : newest.content !== draft,
      draftRevision: fingerprint(draft),
      production: { url: env.PRODUCTION_URL, revision: live },
      preview: { url: env.PREVIEW_URL ?? null, revision: preview },
    });
  }

  if (path === '/api/publish' && request.method === 'POST') {
    const body: unknown = await request.json().catch(() => ({}));
    const message =
      isRecord(body) && typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'Publish';

    const [newest, draft] = await Promise.all([newestRevision(env), draftBundle(env)]);
    if (newest !== null && newest.content === draft) {
      return json({ published: false, reason: 'Nothing to publish.' });
    }

    const created = await env.DB.prepare(
      'INSERT INTO revision (content, message, published_by) VALUES (?, ?, ?) RETURNING id',
    )
      .bind(draft, message, session.login)
      .first<{ id: number }>();

    if (created === null) return json({ error: 'The revision could not be written.' }, 500);

    await poke(env.DEPLOY_HOOK_URL);
    return json({ published: true, revision: created.id });
  }

  if (path === '/api/revisions' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id, message, published_at, published_by FROM revision ORDER BY id DESC LIMIT 50',
    ).all<Omit<Revision, 'content'>>();
    return json({ revisions: rows.results });
  }

  const restore = /^\/api\/revisions\/(\d+)\/restore$/.exec(path);
  if (restore !== null && request.method === 'POST') {
    const id = Number(restore[1]);
    const wanted = await env.DB.prepare('SELECT * FROM revision WHERE id = ?')
      .bind(id)
      .first<Revision>();
    if (wanted === null) return json({ error: 'No such revision.' }, 404);

    // Rolling back is publishing an old snapshot as a new one. History is
    // append-only, so what was live at any point stays recoverable.
    const created = await env.DB.prepare(
      'INSERT INTO revision (content, message, published_by) VALUES (?, ?, ?) RETURNING id',
    )
      .bind(wanted.content, `Restore revision ${id}`, session.login)
      .first<{ id: number }>();

    if (created === null) return json({ error: 'The revision could not be written.' }, 500);

    await poke(env.DEPLOY_HOOK_URL);
    return json({ published: true, revision: created.id, restoredFrom: id });
  }

  return json({ error: 'No such endpoint.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/auth/login') return handleLogin(request, env);
    if (path === '/auth/callback') return handleCallback(request, env);
    if (path === '/auth/logout') {
      return new Response(null, {
        status: 302,
        headers: { Location: '/', 'Set-Cookie': clearedSessionCookie() },
      });
    }

    /*
     * The one unauthenticated route.
     *
     * Workers Builds has no session cookie, and a published revision is by
     * definition already on the public website — the row exists because someone
     * pressed Publish, and worker/bundle.ts has already dropped everything a
     * private work would have leaked. There is nothing here to protect, and a
     * shared secret would be ceremony rather than security.
     *
     * Deliberately uncached: this is read a handful of times a month, always by
     * a build that has just been told there is something new to read. A stale
     * hit would publish the previous revision and look like a lost save.
     */
    if (path === '/api/content/published' && request.method === 'GET') {
      const newest = await newestRevision(env);
      if (newest === null) return json({ error: 'Nothing has been published yet.' }, 404);
      return new Response(`{"revision":${newest.id},"bundle":${newest.content}}`, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    /*
     * The draft, for the preview build only. The preview Worker holds the same
     * token as an environment variable; nothing else can read unpublished work.
     */
    if (path === '/api/content/draft' && request.method === 'GET') {
      const offered = request.headers.get('X-Preview-Token');
      const expected = env.PREVIEW_TOKEN;
      if (expected === undefined || expected === '' || offered !== expected) {
        return json({ error: 'Not the preview build.' }, 401);
      }
      const draft = await draftBundle(env);
      return new Response(`{"revision":${fingerprint(draft)},"bundle":${draft}}`, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (path.startsWith('/api/')) {
      const session = await readSession(request, env.SESSION_SECRET);
      if (session === null) return json({ error: 'Not signed in.' }, 401);

      try {
        return await handleApi(request, env, session, path);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Something failed.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
