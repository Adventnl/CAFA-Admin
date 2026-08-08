/**
 * The repository, as a database.
 *
 * Everything the admin saves goes through the Git Data API rather than the
 * simpler contents endpoint, because a save is usually several files — a work's
 * JSON and the images it references — and the contents endpoint would make one
 * commit per file. That is not just untidy: a half-applied save is a build with
 * a record pointing at an image that is not there yet. Blobs, one tree, one
 * commit, one ref update: the site either sees all of an edit or none of it.
 */

const API = 'https://api.github.com';

export interface Repo {
  owner: string;
  name: string;
}

export interface FileEdit {
  path: string;
  /** UTF-8 text, or base64 for binary. `null` deletes the path. */
  content: string | null;
  encoding: 'utf-8' | 'base64';
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cafa-admin',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new GitHubError(response.status, `${init.method ?? 'GET'} ${path}: ${detail}`);
  }
  return response.json<T>();
}

export async function viewer(token: string): Promise<{ login: string }> {
  return call<{ login: string }>(token, '/user');
}

export async function branchHead(token: string, repo: Repo, branch: string): Promise<string> {
  const ref = await call<{ object: { sha: string } }>(
    token,
    `/repos/${repo.owner}/${repo.name}/git/ref/heads/${branch}`,
  );
  return ref.object.sha;
}

/**
 * The draft branch is created on first use rather than by hand, so setting the
 * admin up is one less instruction that can be got wrong.
 */
export async function ensureBranch(
  token: string,
  repo: Repo,
  branch: string,
  fromBranch: string,
): Promise<string> {
  try {
    return await branchHead(token, repo, branch);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
  }

  const base = await branchHead(token, repo, fromBranch);
  await call(token, `/repos/${repo.owner}/${repo.name}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base }),
  });
  return base;
}

export async function readFile(
  token: string,
  repo: Repo,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const file = await call<{ content: string; encoding: string }>(
      token,
      `/repos/${repo.owner}/${repo.name}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );
    if (file.encoding !== 'base64') throw new Error(`${path}: unexpected encoding`);
    // atob gives one char per byte; the content is UTF-8, so decode it as such
    // rather than assuming Latin-1 — every Chinese string in this repo depends
    // on the difference.
    const binary = atob(file.content.replaceAll('\n', ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

/**
 * A binary file, streamed rather than decoded. The admin shows the studio the
 * photographs already in the repository, and a private repo will not serve them
 * to an <img> tag — so they come back through the Worker, which has the token.
 */
export async function readRaw(
  token: string,
  repo: Repo,
  path: string,
  ref: string,
): Promise<Response> {
  return fetch(
    `${API}/repos/${repo.owner}/${repo.name}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cafa-admin',
      },
    },
  );
}

/** Paths under a directory, one level deep. Used to list a work's media. */
export async function listDirectory(
  token: string,
  repo: Repo,
  path: string,
  ref: string,
): Promise<string[]> {
  try {
    const entries = await call<{ path: string; type: string }[]>(
      token,
      `/repos/${repo.owner}/${repo.name}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );
    return entries.filter((entry) => entry.type === 'file').map((entry) => entry.path);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return [];
    throw error;
  }
}

/**
 * One commit for the whole edit.
 *
 * `expectedHead` is the SHA the editor had when it started. If the branch has
 * moved since, the ref update is refused rather than forced — two tabs open on
 * the same site should not silently overwrite each other.
 */
export async function commitFiles(
  token: string,
  repo: Repo,
  branch: string,
  message: string,
  edits: FileEdit[],
  expectedHead: string,
): Promise<string> {
  const head = await branchHead(token, repo, branch);
  if (head !== expectedHead) {
    throw new GitHubError(
      409,
      'The site changed since this editor loaded it. Reload before saving again.',
    );
  }

  const commit = await call<{ tree: { sha: string } }>(
    token,
    `/repos/${repo.owner}/${repo.name}/git/commits/${head}`,
  );

  const entries = await Promise.all(
    edits.map(async (edit) => {
      if (edit.content === null) {
        return { path: edit.path, mode: '100644' as const, type: 'blob' as const, sha: null };
      }
      const blob = await call<{ sha: string }>(
        token,
        `/repos/${repo.owner}/${repo.name}/git/blobs`,
        {
          method: 'POST',
          body: JSON.stringify({ content: edit.content, encoding: edit.encoding }),
        },
      );
      return {
        path: edit.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      };
    }),
  );

  const tree = await call<{ sha: string }>(token, `/repos/${repo.owner}/${repo.name}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }),
  });

  const created = await call<{ sha: string }>(
    token,
    `/repos/${repo.owner}/${repo.name}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
    },
  );

  await call(token, `/repos/${repo.owner}/${repo.name}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: created.sha, force: false }),
  });

  return created.sha;
}

export interface Comparison {
  status: 'identical' | 'ahead' | 'behind' | 'diverged';
  ahead: number;
  behind: number;
}

/** How `head` stands relative to `base`. Drives both publish and catch-up. */
export async function compare(
  token: string,
  repo: Repo,
  base: string,
  head: string,
): Promise<Comparison> {
  const result = await call<{ status: string; ahead_by: number; behind_by: number }>(
    token,
    `/repos/${repo.owner}/${repo.name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  const status =
    result.status === 'identical' || result.status === 'ahead' || result.status === 'behind'
      ? result.status
      : 'diverged';
  return { status, ahead: result.ahead_by, behind: result.behind_by };
}

/**
 * Publishing is a fast-forward, not a merge: draft is only ever main plus
 * content commits, so main can simply be moved to it. Refused when draft is
 * behind — that means someone pushed code and the draft has not caught up, and
 * moving main backwards would delete their work.
 */
export async function fastForward(
  token: string,
  repo: Repo,
  branch: string,
  toSha: string,
): Promise<void> {
  await call(token, `/repos/${repo.owner}/${repo.name}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: toSha, force: false }),
  });
}

/** Bring code changes on `from` into the draft branch. */
export async function mergeInto(
  token: string,
  repo: Repo,
  branch: string,
  from: string,
): Promise<void> {
  const response = await fetch(`${API}/repos/${repo.owner}/${repo.name}/merges`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cafa-admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base: branch, head: from, commit_message: `Catch up with ${from}` }),
  });

  // 204 means there was nothing to merge, which is a success, not a no-op to
  // report. 409 is a real conflict and has to reach a human.
  if (response.status === 409) {
    throw new GitHubError(409, 'Draft and main have conflicting changes. A developer must fix it.');
  }
  if (!response.ok && response.status !== 204) {
    throw new GitHubError(response.status, await response.text());
  }
}
