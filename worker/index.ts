/**
 * The server half of the admin.
 *
 * Its whole job is to hold one secret — the GitHub token — and to refuse to do
 * anything on behalf of anyone but the studio's own account. Everything else is
 * a thin, typed pass-through to the repository.
 */
import {
  branchHead,
  commitFiles,
  compare,
  ensureBranch,
  fastForward,
  GitHubError,
  mergeInto,
  readFile,
  readRaw,
  viewer,
  type FileEdit,
  type Repo,
} from './github';
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

interface Env {
  ASSETS: Fetcher;
  OWNER_LOGIN: string;
  REPO_OWNER: string;
  REPO_NAME: string;
  DRAFT_BRANCH: string;
  PRODUCTION_BRANCH: string;
  PRODUCTION_URL: string;
  PREVIEW_URL?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

/**
 * The files the admin owns. Anything outside this list is code, and the admin
 * has no business writing code — so a save that names another path is refused
 * rather than trusted.
 */
const CONTENT_FILES = [
  'src/content/site.json',
  'src/content/works.json',
  'src/content/programs.json',
  'src/content/mentors.json',
  'src/content/dictionaries/zh.json',
  'src/content/dictionaries/en.json',
] as const;

const MEDIA_PREFIX = 'media-source/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `Array.isArray` narrows `unknown` to `any[]`, which quietly un-types every
 * element downstream. This keeps the elements unknown until each is checked.
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function repoOf(env: Env): Repo {
  return { owner: env.REPO_OWNER, name: env.REPO_NAME };
}

/**
 * What the deployed site says it was built from. The template writes this at
 * build time; comparing it to a branch head is how the admin knows whether a
 * publish has actually landed, without needing Cloudflare API credentials.
 */
async function liveCommit(origin: string | undefined): Promise<string | null> {
  if (origin === undefined || origin === '') return null;
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/build-info.json`, {
      cf: { cacheTtl: 0 },
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return null;
    const info = await response.json<{ commit?: unknown }>();
    return typeof info.commit === 'string' ? info.commit : null;
  } catch {
    return null;
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const redirect = new URL('/auth/callback', new URL(request.url).origin);

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirect.toString());
  // `repo` rather than `public_repo` so this works whether or not the template
  // repository is public. It is the narrowest scope that can push to both.
  authorize.searchParams.set('scope', 'repo');
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
  if (typeof granted.access_token !== 'string') {
    return deny('GitHub refused the sign-in.');
  }

  const account = await viewer(granted.access_token);
  // The account check is the whole access-control model. It happens after the
  // OAuth round trip because that is the first moment we know who signed in.
  if (account.login.toLowerCase() !== env.OWNER_LOGIN.toLowerCase()) {
    return deny(`${account.login} is not the studio account.`);
  }

  const sealed = await sealSession(env.SESSION_SECRET, {
    login: account.login,
    token: granted.access_token,
  });

  return new Response(null, {
    status: 302,
    headers: [
      ['Location', '/'],
      ['Set-Cookie', sessionCookie(sealed)],
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
  const repo = repoOf(env);
  const { token } = session;

  if (path === '/api/session') {
    return json({ login: session.login });
  }

  if (path === '/api/content' && request.method === 'GET') {
    const head = await ensureBranch(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH);
    // Annotated as a tuple: without it `Object.fromEntries` widens to `any`,
    // and the client's parse of these files is the last check before a commit.
    const files: Record<string, string | null> = Object.fromEntries(
      await Promise.all(
        CONTENT_FILES.map(async (file): Promise<[string, string | null]> => [
          file,
          await readFile(token, repo, file, env.DRAFT_BRANCH),
        ]),
      ),
    );
    return json({ head, files });
  }

  if (path === '/api/media' && request.method === 'GET') {
    const wanted = new URL(request.url).searchParams.get('path');
    if (wanted === null || !wanted.startsWith(MEDIA_PREFIX) || wanted.includes('..')) {
      return json({ error: 'Not a media path.' }, 400);
    }

    const file = await readRaw(token, repo, wanted, env.DRAFT_BRANCH);
    if (!file.ok) return json({ error: 'No such image.' }, 404);

    return new Response(file.body, {
      headers: {
        'Content-Type': file.headers.get('Content-Type') ?? 'application/octet-stream',
        // Immutable within a session but not across saves; the client appends
        // the draft head to the URL when it wants a fresh copy.
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  if (path === '/api/save' && request.method === 'POST') {
    const body: unknown = await request.json();
    if (!isRecord(body)) return json({ error: 'Malformed save.' }, 400);

    const { head, message, edits: submitted } = body;
    if (typeof head !== 'string' || !isArray(submitted)) {
      return json({ error: 'Malformed save.' }, 400);
    }

    const edits: FileEdit[] = [];
    for (const raw of submitted) {
      if (!isRecord(raw)) return json({ error: 'Malformed edit.' }, 400);
      const { path: target, content, encoding } = raw;

      if (typeof target !== 'string') return json({ error: 'Malformed edit.' }, 400);
      if (content !== null && typeof content !== 'string') {
        return json({ error: 'Malformed edit.' }, 400);
      }

      // The one place that decides what this admin is allowed to touch. Content
      // JSON and media only — never a source file, never a workflow, and never
      // a path that climbs out of the repository with "..".
      const allowed =
        (CONTENT_FILES as readonly string[]).includes(target) ||
        (target.startsWith(MEDIA_PREFIX) && !target.includes('..'));
      if (!allowed) return json({ error: `The admin may not write ${target}.` }, 403);

      edits.push({
        path: target,
        content,
        encoding: encoding === 'base64' ? 'base64' : 'utf-8',
      });
    }

    const sha = await commitFiles(
      token,
      repo,
      env.DRAFT_BRANCH,
      typeof message === 'string' && message.trim() !== '' ? message : 'Edit content',
      edits,
      head,
    );
    return json({ head: sha });
  }

  if (path === '/api/status' && request.method === 'GET') {
    const draftHead = await ensureBranch(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH);
    const [productionHead, standing, live, preview] = await Promise.all([
      branchHead(token, repo, env.PRODUCTION_BRANCH),
      compare(token, repo, env.PRODUCTION_BRANCH, env.DRAFT_BRANCH),
      liveCommit(env.PRODUCTION_URL),
      liveCommit(env.PREVIEW_URL),
    ]);

    return json({
      draftHead,
      productionHead,
      standing,
      unpublished: standing.ahead,
      production: { url: env.PRODUCTION_URL, commit: live },
      preview: { url: env.PREVIEW_URL ?? null, commit: preview },
    });
  }

  if (path === '/api/publish' && request.method === 'POST') {
    const draftHead = await ensureBranch(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH);
    const standing = await compare(token, repo, env.PRODUCTION_BRANCH, env.DRAFT_BRANCH);

    if (standing.status === 'identical') {
      return json({ published: false, reason: 'Nothing to publish.' });
    }
    if (standing.status !== 'ahead') {
      return json(
        {
          error:
            'The site has code changes the draft has not taken in yet. Use "Catch up with the site" first.',
        },
        409,
      );
    }

    await fastForward(token, repo, env.PRODUCTION_BRANCH, draftHead);
    return json({ published: true, commit: draftHead });
  }

  if (path === '/api/catch-up' && request.method === 'POST') {
    await ensureBranch(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH);
    await mergeInto(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH);
    return json({ head: await ensureBranch(token, repo, env.DRAFT_BRANCH, env.PRODUCTION_BRANCH) });
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

    if (path.startsWith('/api/')) {
      const session = await readSession(request, env.SESSION_SECRET);
      if (session === null) return json({ error: 'Not signed in.' }, 401);

      try {
        return await handleApi(request, env, session, path);
      } catch (error) {
        if (error instanceof GitHubError) {
          // A 401 from GitHub means the stored token was revoked; clearing the
          // cookie turns that into a sign-in prompt rather than a dead session.
          if (error.status === 401) {
            return json({ error: 'GitHub signed you out.' }, 401, {
              'Set-Cookie': clearedSessionCookie(),
            });
          }
          return json({ error: error.message }, error.status === 409 ? 409 : 502);
        }
        return json({ error: error instanceof Error ? error.message : 'Something failed.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
