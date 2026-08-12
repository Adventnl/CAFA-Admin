/**
 * Talking to the two deployed origins, and to the hooks that rebuild them.
 *
 * Both halves are deliberately failure-tolerant, for the same reason: neither
 * is on the path of anything the studio would call broken.
 *
 * Poking a hook is fire-and-forget — a save should not fail because a build
 * queue was briefly slow, and the status poll shows whether the build landed
 * anyway. Reading an origin's build-info.json is best-effort — a site that is
 * mid-deploy, or has never deployed, simply has no revision to report, and
 * "unknown" is the honest answer rather than an error.
 */
import type { Env } from '../env';

export class DeployService {
  constructor(private readonly env: Env) {}

  /** Rebuilds the public site. Fired on publish. */
  async pokeProduction(): Promise<void> {
    await poke(this.env.DEPLOY_HOOK_URL);
  }

  /** Rebuilds the preview, which reads the draft. Fired on every save. */
  async pokePreview(): Promise<void> {
    await poke(this.env.PREVIEW_DEPLOY_HOOK_URL);
  }

  /**
   * What a deployed origin says it was built from.
   *
   * The template writes this at build time; comparing it to the newest revision
   * is how the admin answers "is it live yet" without needing Cloudflare API
   * credentials.
   */
  async liveRevision(origin: string | undefined): Promise<number | null> {
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
}

async function poke(url: string | undefined): Promise<void> {
  if (url === undefined || url === '') return;
  try {
    await fetch(url, { method: 'POST' });
  } catch {
    // Reported by the status poll, not by the save.
  }
}
