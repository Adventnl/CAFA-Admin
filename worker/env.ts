/**
 * Everything the Worker is handed by the platform.
 *
 * The bindings come from wrangler.jsonc; the secrets come from
 * `wrangler secret put`. Nothing here is read anywhere but the composition root
 * in worker/index.ts, which builds the repositories and services that close over
 * it — so a service never reaches for an environment variable, it is given the
 * one thing it needs.
 */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;

  /** Where the originals are served from, so the template can transform them. */
  MEDIA_BASE: string;
  /**
   * The public site's origin. Polled for build-info.json, and stamped into the
   * published bundle as `site.url` — see worker/domain/bundle.ts for why it
   * lives here rather than in the database.
   */
  PRODUCTION_URL: string;
  PREVIEW_URL?: string;

  /** The one account that may sign in. */
  ADMIN_USERNAME: string;
  /** Its password, as `pbkdf2$sha256$…` — see worker/domain/password.ts. */
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;

  /** Cloudflare deploy hooks. Absent means that half simply does not fire. */
  DEPLOY_HOOK_URL?: string;
  PREVIEW_DEPLOY_HOOK_URL?: string;
  /** Lets the preview build read the draft. Absent means no draft endpoint. */
  PREVIEW_TOKEN?: string;
}
