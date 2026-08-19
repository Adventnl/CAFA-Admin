/**
 * The path a photograph takes, checked link by link.
 *
 * Neither repository serves an image. The site's HTML carries one URL per
 * photograph, of exactly this shape:
 *
 *   /cdn-cgi/image/<options>/https://media.cafa-studio.com/works/<slug>/01.jpg
 *
 * and that URL resolves only if four things are true in the Cloudflare account.
 * None of them is expressible in this repository, and the middle two fail
 * without saying anything:
 *
 *   1. the zone is active                       — nothing else exists without it
 *   2. the bucket exists                        — `wrangler r2 bucket create`
 *   3. MEDIA_BASE's hostname is an R2 custom domain on that bucket
 *   4. Image Transformations are enabled on the zone
 *
 * Miss 3 or 4 and every layer still reports success: the content publishes, the
 * build fetches it, `next build` writes correct HTML, the deploy goes green —
 * and every photograph on the live site is a broken image. docs/Frontend.md says
 * of the fourth "nothing in this repository can detect that". This is the file
 * that changes that sentence, and with --fix it repairs what it finds.
 *
 * The fourth is the one --fix cannot always reach. Image Transformations are a
 * paid-plan zone setting: on a Free zone the API returns the setting with
 * `editable: false`, and a PATCH is refused no matter what the token carries.
 * So the shape of that URL is not a constant here — MEDIA_TRANSFORM decides it,
 * the published bundle carries the decision as `mediaTransform`, and a site
 * whose zone cannot transform points at the originals instead:
 *
 *   https://media.cafa-studio.com/works/<slug>/01.jpg
 *
 * which is a working site paying in bytes rather than a broken one. What this
 * script checks, then, is not "are transformations on" but "does the zone agree
 * with what the deployed admin is publishing" — and it says so in whichever
 * direction they disagree.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run media
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run media -- --fix
 *
 * Token permissions: Zone:Read and Workers R2 Storage:Read to look; add Zone
 * Settings:Edit, Workers R2 Storage:Edit and DNS:Edit to --fix. The DNS one is
 * not incidental — attaching a custom domain to a bucket writes a record.
 *
 * Nothing is read from a flag that could instead be read from wrangler.jsonc.
 * That file is where the bucket, MEDIA_BASE and PRODUCTION_URL are already
 * decided, and a second copy of a hostname is how the two drift apart.
 *
 * The last two checks are the ones worth having. They take a real object key
 * from what the admin has actually published and fetch it twice — once from the
 * media origin, once through the transformation — which is what a browser does
 * on the live site, so passing them is the site working rather than a proxy for
 * it. They use the *deployed* Worker's `mediaBase` rather than the one in
 * wrangler.jsonc, so a var that was edited and never redeployed shows up as the
 * mismatch it is instead of hiding behind a check that agrees with itself.
 *
 * Exit code is 0 only when every link holds, so a deploy can gate on it.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = process.argv.includes('--fix');

/* ------------------------------------------------------------- wrangler --- */

/**
 * JSONC, minus the C. A string-aware pass rather than a regex, because the one
 * thing this file is full of is `https://…` inside quotes — and a regex that
 * strips `//` comments eats every one of those.
 */
function stripComments(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  let inLine = false;
  let inBlock = false;

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    const next = text[at + 1];

    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        at += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      at += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      at += 1;
      continue;
    }
    out += char;
  }
  return out;
}

/** The four values this script is about, read from where the Worker reads them. */
async function readWranglerConfig() {
  const file = path.join(ROOT, 'wrangler.jsonc');
  const source = stripComments(await readFile(file, 'utf8'));

  let config;
  try {
    config = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `wrangler.jsonc could not be parsed as JSON once its comments were removed` +
        ` — a trailing comma is the usual reason.\n  ${error.message}`,
    );
  }

  const bucket = config.r2_buckets?.[0]?.bucket_name;
  const mediaBase = config.vars?.MEDIA_BASE;
  const siteUrl = config.vars?.PRODUCTION_URL;
  const adminHost = config.routes?.[0]?.pattern;
  // The same reading worker/domain/bundle.ts gives it: only a word that plainly
  // says off turns it off, and absent means the documented setup.
  const said = String(config.vars?.MEDIA_TRANSFORM ?? '').trim().toLowerCase();
  const wantsTransform = said !== 'off' && said !== 'false' && said !== '0';

  for (const [name, value] of Object.entries({ bucket, mediaBase, siteUrl, adminHost })) {
    if (typeof value !== 'string' || value === '') {
      throw new Error(`wrangler.jsonc does not name ${name}.`);
    }
  }

  return {
    bucket,
    mediaBase: mediaBase.replace(/\/$/, ''),
    mediaHost: new URL(mediaBase).hostname,
    siteUrl: siteUrl.replace(/\/$/, ''),
    adminUrl: `https://${adminHost}`,
    wantsTransform,
  };
}

/* ----------------------------------------------------------- cloudflare --- */

class CloudflareError extends Error {
  constructor(message, status, codes) {
    super(message);
    this.name = 'CloudflareError';
    this.status = status;
    this.codes = codes;
  }
}

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

async function cf(endpoint, init = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  });

  const payload = await response.json().catch(() => null);
  if (payload === null) {
    throw new CloudflareError(`answered ${response.status} with no JSON`, response.status, []);
  }
  if (payload.success !== true) {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const said = errors.map((error) => error.message).filter(Boolean).join('; ');
    throw new CloudflareError(
      said === '' ? `${response.status} ${response.statusText}` : said,
      response.status,
      errors.map((error) => error.code),
    );
  }
  return payload.result;
}

/** Absent is an answer here, not a failure: it is what --fix acts on. */
async function cfOrNull(endpoint) {
  try {
    return await cf(endpoint);
  } catch (error) {
    if (error instanceof CloudflareError && error.status === 404) return null;
    throw error;
  }
}

/* -------------------------------------------------------------- reports --- */

const rows = [];
const problems = [];
const notes = [];
let allWell = true;

/**
 * One link in the chain. `state` is a short verdict; `fault` is the sentence
 * printed at the end, and passing one is what makes the exit code non-zero.
 */
function report(label, detail, state, fault) {
  rows.push({ label, detail, state, good: fault === undefined });
  if (fault !== undefined) {
    problems.push(fault);
    allWell = false;
  }
}

/**
 * Something true and worth saying that is not a failure — the site works, and
 * could work better. Kept apart from `problems` because the exit code is what a
 * deploy gates on, and a deploy should not be blocked by an opportunity.
 */
function advise(sentence) {
  notes.push(sentence);
}

/**
 * `offerFix` is false for the one failure --fix cannot repair: a domain that is
 * not a zone in this account. Offering a repair that cannot happen is worse
 * than offering none.
 */
function print(offerFix = true) {
  const width = Math.max(...rows.map((row) => row.label.length));
  const indent = ' '.repeat(width + 4);
  console.log('');
  for (const row of rows) {
    // Verdict first, evidence under it: the answer is what is being read, and
    // the URL that produced it is only wanted once the answer is bad.
    console.log(`  ${row.good ? '✓' : '✗'} ${row.label.padEnd(width)}  ${row.state}`);
    console.log(`  ${indent}${row.detail}`);
  }
  console.log('');

  if (problems.length === 0) {
    console.log('Every link holds. A photograph on the site loads.\n');
    for (const note of notes) console.log(`${note}\n`);
    return;
  }
  for (const problem of problems) console.log(`${problem}\n`);
  for (const note of notes) console.log(`${note}\n`);
  if (!FIX && offerFix) {
    console.log('Re-run with --fix to repair what can be repaired from the API.\n');
  }
}

/* --------------------------------------------------------------- checks --- */

/**
 * The zone the hostnames hang off, found by name rather than guessed from the
 * host: `media.cafa-studio.com` is three labels and the zone is two, and only
 * the account knows where the cut is.
 */
async function findZone(host) {
  const zones = await cf(`/zones?account.id=${ACCOUNT}&per_page=50`);
  const matches = zones.filter((zone) => host === zone.name || host.endsWith(`.${zone.name}`));
  // Longest wins, so a zone and a subzone of it cannot be confused.
  return matches.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

async function checkBucket(name) {
  const bucket = await cfOrNull(`/accounts/${ACCOUNT}/r2/buckets/${name}`);
  if (bucket !== null) {
    report('bucket', name, `in ${bucket.location ?? 'the default location'}`);
    return true;
  }

  if (!FIX) {
    report('bucket', name, 'does not exist', `The bucket ${name} does not exist.`);
    return false;
  }

  await cf(`/accounts/${ACCOUNT}/r2/buckets`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  report('bucket', name, 'created');
  return true;
}

/**
 * The link that is almost always the missing one. A bucket is private until a
 * hostname is attached to it, and attaching one is a dashboard click nobody
 * remembers making — so `MEDIA_BASE` names an origin that answers nothing.
 */
async function checkCustomDomain({ bucket, mediaHost }, zone) {
  const listed = await cf(`/accounts/${ACCOUNT}/r2/buckets/${bucket}/domains/custom`);
  const found = (listed.domains ?? []).find((entry) => entry.domain === mediaHost);

  if (found === undefined) {
    if (!FIX) {
      report(
        'custom domain',
        `${mediaHost} → ${bucket}`,
        'not attached',
        `${mediaHost} is not attached to the bucket, so it resolves to nothing and every\n` +
          `photograph on the site is a broken image. This is the usual cause.`,
      );
      return false;
    }
    await cf(`/accounts/${ACCOUNT}/r2/buckets/${bucket}/domains/custom`, {
      method: 'POST',
      body: JSON.stringify({ domain: mediaHost, zoneId: zone.id, enabled: true }),
    });
    report('custom domain', `${mediaHost} → ${bucket}`, 'attached — certificate takes a minute');
    return true;
  }

  const ownership = found.status?.ownership ?? 'unknown';
  const ssl = found.status?.ssl ?? 'unknown';
  const settled = ownership === 'active' && ssl === 'active';

  if (found.enabled === false) {
    if (!FIX) {
      report(
        'custom domain',
        `${mediaHost} → ${bucket}`,
        'attached but disabled',
        `${mediaHost} is attached to the bucket but switched off, so it answers nothing.`,
      );
      return false;
    }
    await cf(`/accounts/${ACCOUNT}/r2/buckets/${bucket}/domains/custom/${mediaHost}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
    report('custom domain', `${mediaHost} → ${bucket}`, 'enabled');
    return true;
  }

  report(
    'custom domain',
    `${mediaHost} → ${bucket}`,
    settled ? 'attached and live' : `attached — ownership ${ownership}, ssl ${ssl}`,
  );
  return true;
}

/**
 * `image_resizing` is the zone setting behind Images → Transformations, and the
 * one link in this chain that money rather than configuration can block.
 *
 * The API answers with `editable`, and on a Free zone it is `false` with
 * `value: "off"`. That is not a permissions problem and no token fixes it, so
 * --fix does not try: it would fail, and a failed repair reads like a bug in
 * this script rather than the plan gate it is.
 *
 * `wants` is what the deployed admin is publishing — `mediaTransform` in the
 * bundle — because the setting is only wrong relative to what the site asks
 * for. Off is a fault when the site builds /cdn-cgi/image/ URLs, and simply the
 * arrangement when it does not.
 */
async function checkTransformations(zone, wants) {
  let setting;
  try {
    setting = await cf(`/zones/${zone.id}/settings/image_resizing`);
  } catch (error) {
    report(
      'transformations',
      zone.name,
      `could not be read — ${error.message}`,
      `Could not read the zone's Image Transformations setting. Check it by hand at\n` +
        `  Cloudflare → ${zone.name} → Images → Transformations.`,
    );
    return;
  }

  // "open" is on, and additionally allows sources outside the zone. Both serve
  // this site, whose source is a subdomain of the zone itself.
  const on = setting.value === 'on' || setting.value === 'open';
  const gated = setting.editable === false;

  if (on) {
    const state = `on${setting.value === 'open' ? ' (any origin)' : ''}`;
    if (wants) {
      report('transformations', zone.name, state);
      return;
    }
    report('transformations', zone.name, `${state}, and unused`);
    advise(
      `${zone.name} can transform images, but MEDIA_TRANSFORM says off, so the site is\n` +
        `serving full-size originals it does not have to. Remove that var from\n` +
        `wrangler.jsonc — or set it to "on" — then redeploy and publish once.`,
    );
    return;
  }

  if (!wants) {
    report('transformations', zone.name, gated ? 'off — not available on this plan' : 'off, as configured');
    advise(
      gated
        ? `Image Transformations are a paid-plan setting and ${zone.name} is on a plan without\n` +
          `them, so the site points <img> at the originals instead. That works — it costs\n` +
          `bytes on the LCP path, not correctness. Upgrading the zone to Pro and enabling\n` +
          `Images → Transformations is what unlocks the fast path; drop MEDIA_TRANSFORM\n` +
          `from wrangler.jsonc afterwards, redeploy, and publish once.`
        : `Transformations are off for ${zone.name} and the site is not asking for them, so\n` +
          `photographs are served full size. Turn them on at Cloudflare → ${zone.name} →\n` +
          `Images → Transformations and drop MEDIA_TRANSFORM to use them.`,
    );
    return;
  }

  // Wanted, and off. From here it is a fault; the only question is whether the
  // repair is a PATCH or a plan.
  if (gated) {
    report(
      'transformations',
      zone.name,
      'off, and not editable on this plan',
      `Image Transformations are off for ${zone.name} and cannot be turned on from the API:\n` +
        `the setting reports itself as not editable, which is what a plan without them looks\n` +
        `like. Meanwhile the site requests every photograph through /cdn-cgi/image/, so it\n` +
        `renders with all of them broken. Two ways out, and both are one line:\n` +
        `  • upgrade ${zone.name} to Pro, enable Images → Transformations, publish once; or\n` +
        `  • set "MEDIA_TRANSFORM": "off" in wrangler.jsonc, redeploy the admin and publish\n` +
        `    once — the site then renders the originals, which load.`,
    );
    return;
  }

  if (!FIX) {
    report(
      'transformations',
      zone.name,
      'off',
      `Image Transformations are off for ${zone.name}. Every photograph is requested\n` +
        `through /cdn-cgi/image/, so with this off the site renders with all of them broken.`,
    );
    return;
  }

  try {
    await cf(`/zones/${zone.id}/settings/image_resizing`, {
      method: 'PATCH',
      body: JSON.stringify({ value: 'on' }),
    });
    report('transformations', zone.name, 'turned on');
  } catch (error) {
    report(
      'transformations',
      zone.name,
      `off, and could not be turned on — ${error.message}`,
      `Image Transformations could not be enabled over the API. Turn them on at\n` +
        `  Cloudflare → ${zone.name} → Images → Transformations → Enable for this zone.\n` +
        `If that page offers an upgrade rather than a switch, the plan is the reason —\n` +
        `set "MEDIA_TRANSFORM": "off" in wrangler.jsonc instead and the site will render\n` +
        `the originals until the zone can transform them.`,
    );
  }
}

/* ----------------------------------------------------------------- live --- */

/**
 * A real key, from what the admin has actually published — so the fetches below
 * test the site's own photographs rather than a URL this script invented.
 *
 * `mediaTransform` is read from here rather than from wrangler.jsonc for the
 * same reason `mediaBase` is: the site is built from the deployed answer, and a
 * var edited in this checkout and never deployed is invisible from every other
 * angle. Absent means an admin deployed before the field existed, which is
 * itself worth saying.
 */
async function readPublished(adminUrl) {
  const response = await fetch(`${adminUrl}/api/content/published`);
  if (!response.ok) {
    throw new Error(`${adminUrl}/api/content/published answered ${response.status}`);
  }
  const payload = await response.json();
  const bundle = payload?.bundle ?? {};
  return {
    mediaBase: bundle.mediaBase,
    transform: bundle.mediaTransform,
    key: Object.keys(bundle.media ?? {})[0] ?? null,
  };
}

/** wrangler.jsonc against the deployed answer, in both directions. */
function checkTransformFlag(config, published) {
  if (typeof published.transform !== 'boolean') {
    report(
      'transform flag',
      config.adminUrl,
      'not published',
      `The deployed admin publishes no \`mediaTransform\` field, so it is running a build\n` +
        `from before that field existed and the site is guessing at the URL shape. Deploy\n` +
        `this checkout and publish once.`,
    );
    return;
  }

  const deployed = published.transform ? 'on' : 'off';
  if (published.transform === config.wantsTransform) {
    report('transform flag', config.adminUrl, `${deployed} — same as wrangler.jsonc`);
    return;
  }

  report(
    'transform flag',
    config.adminUrl,
    `${deployed}, wrangler.jsonc says ${config.wantsTransform ? 'on' : 'off'}`,
    `The deployed admin publishes mediaTransform ${deployed}, but MEDIA_TRANSFORM in\n` +
      `wrangler.jsonc reads ${config.wantsTransform ? 'on' : 'off'}. The site is built from the deployed value —\n` +
      `redeploy the admin and publish once, so the revision the site reads carries it.`,
  );
}

/** Both live fetches, in the order the browser makes them. */
async function checkLive(config, published) {
  if (!published.ok) {
    report(
      'published bundle',
      config.adminUrl,
      published.error.message,
      `Could not read the published content: ${published.error.message}`,
    );
    return;
  }

  if (published.key === null) {
    report(
      'published bundle',
      config.adminUrl,
      'no photographs published yet',
      `Nothing has been published that cites a photograph, so there is no real URL to test.`,
    );
    return;
  }

  // The deployed Worker's answer, not this checkout's. A MEDIA_BASE edited here
  // and never deployed is invisible from any other angle.
  const base = (published.mediaBase ?? '').replace(/\/$/, '');
  if (base !== config.mediaBase) {
    report(
      'published bundle',
      config.adminUrl,
      `serves mediaBase ${base || '(missing)'}`,
      `The deployed admin publishes mediaBase "${base}", but wrangler.jsonc says\n` +
        `"${config.mediaBase}". The site is built from the deployed value — redeploy the\n` +
        `admin, or change wrangler.jsonc to agree.`,
    );
  } else {
    report('published bundle', config.adminUrl, `mediaBase ${base}`);
  }

  checkTransformFlag(config, published);

  const origin = `${base}/${published.key}`;
  let originOk = false;
  try {
    const response = await fetch(origin, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    originOk = response.ok;
    report(
      'media origin',
      origin,
      response.ok ? `${response.status}, ${response.headers.get('content-type')}` : `${response.status}`,
      response.ok
        ? undefined
        : response.status === 404
          ? `The media origin answers, but ${published.key} is not in the bucket. The content\n` +
            `references a photograph that was never uploaded, or was uploaded to another bucket.`
          : `${origin} answered ${response.status}. The hostname is not serving the bucket.`,
    );
  } catch (error) {
    report('media origin', origin, error.message, `${origin} could not be reached: ${error.message}`);
  }

  // With the flag off the URL above *is* the one in the site's HTML, and it has
  // just been fetched. Fetching it again through a transform the site does not
  // ask for would report a failure nobody has.
  if (published.transform === false) {
    report('browser fetch', origin, 'the original, untransformed');
    return;
  }

  // The URL the site's HTML actually carries, options and all.
  const transformed = `${config.siteUrl}/cdn-cgi/image/width=64,quality=78,format=auto,fit=scale-down/${origin}`;
  try {
    const response = await fetch(transformed);
    const type = response.headers.get('content-type') ?? '';
    const served = response.ok && type.startsWith('image/');
    report(
      'transformed',
      `${config.siteUrl}/cdn-cgi/image/…`,
      served ? `${response.status}, ${type}` : `${response.status}, ${type || 'no content type'}`,
      served
        ? undefined
        : originOk
          ? `The origin serves the photograph but the transformation does not. That is the\n` +
            `zone's Image Transformations setting, above — and if that setting is not editable,\n` +
            `"MEDIA_TRANSFORM": "off" in wrangler.jsonc is how the site stops asking for it.`
          : `The transformation cannot succeed while the origin above does not.`,
    );
  } catch (error) {
    report('transformed', transformed, error.message, `The transformed URL could not be reached: ${error.message}`);
  }
}

/* ----------------------------------------------------------------- main --- */

async function main() {
  if (!TOKEN || !ACCOUNT) {
    console.error(
      [
        'Set both, from an API token with Zone:Read and Workers R2 Storage:Read',
        '(plus Zone Settings:Edit, Workers R2 Storage:Edit and DNS:Edit for --fix):',
        '',
        '  export CLOUDFLARE_API_TOKEN=…',
        '  export CLOUDFLARE_ACCOUNT_ID=…',
      ].join('\n'),
    );
    process.exit(1);
  }

  const config = await readWranglerConfig();
  console.log(`\nThe path a photograph takes${FIX ? ', repairing what is broken' : ''}:`);

  const zone = await findZone(config.mediaHost);
  if (zone === null) {
    report(
      'zone',
      config.mediaHost,
      'no zone in this account covers it',
      `No zone in account ${ACCOUNT} covers ${config.mediaHost}. Nothing else can work\n` +
        `until the domain is a zone here and its nameservers point at Cloudflare.`,
    );
    print(false);
    process.exit(1);
  }

  report(
    'zone',
    zone.name,
    zone.status === 'active' ? 'active' : `status ${zone.status}`,
    zone.status === 'active' ? undefined : `The zone ${zone.name} is ${zone.status}, not active.`,
  );

  if (await checkBucket(config.bucket)) {
    await checkCustomDomain(config, zone);
  }

  // Read before the zone setting is judged, because whether that setting is
  // wrong depends on what the deployed admin is publishing. Reported later, so
  // the rows still come out in the order a photograph travels them.
  const published = await readPublished(config.adminUrl).then(
    (result) => ({ ok: true, ...result }),
    (error) => ({ ok: false, error }),
  );
  const wants =
    published.ok && typeof published.transform === 'boolean'
      ? published.transform
      : config.wantsTransform;

  await checkTransformations(zone, wants);
  await checkLive(config, published);

  print();
  process.exit(allWell ? 0 : 1);
}

try {
  await main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
