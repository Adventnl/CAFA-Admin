# Building a frontend against this admin

`api.json` describes the read API completely and is generated from the routes
themselves, so it cannot describe an endpoint that does not exist. What it does
**not** describe is everything that is not an HTTP request: how the site gets its
content at build time, how photographs are actually rendered, and what the site
has to publish back so the admin can tell whether a deploy has landed.

Those four things are this document. Hand it over alongside `api.json`.

## First: which contract are you on

There are two, and picking the wrong one is the mistake this document mostly
exists to prevent.

**A build reads `/api/content/published`.** One request, at build time, for the
whole revision. This is what CAFA-Template does, and what any statically
generated site should do. The endpoint is unauthenticated, uncached, and
answers **outside** the `{ revision, data }` envelope every other endpoint uses:

```json
{ "revision": 42, "bundle": { "site": …, "works": […], … } }
```

`bundle` is the `Bundle` schema in `api.json`. The envelope is different here on
purpose — see the comment at the top of
[`worker/controllers/public-content.controller.ts`](../worker/controllers/public-content.controller.ts).
It is passed as an environment variable to the build:

```
CONTENT_API=https://admin.cafa-studio.com/api/content/published
```

**A client reads `/api/v1/*`.** The connectors in `api.json`, at request time,
any origin, one minute of edge cache, wearing the `{ revision, data }` envelope.
Use these for anything fetched from a browser after the page has loaded.

Both read the same published revision. If the site is statically generated, the
`/api/v1/*` endpoints are not on its critical path at all — do not build pages
out of them because they are the ones that happen to be documented.

## Second: the bundle decides how a photograph is fetched

This is the one that fails silently, so it comes second only because the build
contract has to come first.

`Photograph.url`, and `mediaBase` on the bundle, resolve an object key against
`media.cafa-studio.com`, which serves R2 originals — full-size, straight off the
bucket. Whether an `<img src>` may point at one is not your decision and not a
constant. It is one boolean, published alongside the origin:

```json
{ "mediaBase": "https://media.cafa-studio.com", "mediaTransform": true }
```

**`mediaTransform: true`** — the arrangement this site is designed around. Every
photograph goes through Cloudflare's image transformations, and pointing an
`<img src>` straight at an original is a bug:

```
/cdn-cgi/image/<options>/<absolute source url>
```

**`mediaTransform: false`** — the zone cannot transform, so `/cdn-cgi/image/`
answers with something that is not an image. Render `<mediaBase>/<key>` as it
is. The photographs are the ≤2400px versions the editor downscales to on
upload, so this is a page that costs more bytes, not a page that is broken.

Read the field. Hard-coding either branch means the site breaks on the day the
zone's plan changes, in the direction that is hardest to notice.

Three things about this are load-bearing:

- **`/cdn-cgi/image/` runs on the zone serving the page**, not on the media
  origin. The path is relative to the site's own hostname; the source URL inside
  it is absolute. `media.cafa-studio.com` is a subdomain of the same zone
  specifically so this costs no second TLS handshake on the LCP path.
- **Image Transformations are a paid-plan zone setting** (Images →
  Transformations). That is why the flag exists: on a Free zone the setting
  reads back as not editable, and no token or API call turns it on. `MEDIA_TRANSFORM`
  in CAFA-Admin's `wrangler.jsonc` is where the answer is set, and it reaches
  the site only through a redeploy *and* a publish — the bundle is a snapshot,
  so a var changed after the last publish is not yet in the revision you read.
- **Nothing downstream notices a mismatch.** With the flag on and the zone off,
  the site builds, deploys and renders with every image broken, and no layer in
  between reports anything. `npm run media` in CAFA-Admin is what detects it: it
  fetches a real published photograph the way a browser would — through the
  transformation, or not, according to the flag the deployed admin publishes —
  and names whichever link is down.

Every photograph arrives with `width` and `height` measured from the file at
upload rather than taken from the client, so they can be trusted as an aspect
box — set them on the `<img>` and the layout does not shift.

`alt` is `{ zh, en }` or the empty string. The empty string is not a missing
translation: it means the photograph carries no information and should be marked
decorative (`alt=""`, and out of the accessibility tree). `Photograph.decorative`
says the same thing as a boolean.

## Third: the site must publish `build-info.json`

The admin's control panel answers "is it live yet" by fetching
`<origin>/build-info.json` from each deployed origin and comparing what it finds
to the newest revision. The whole contract is one field:

```json
{ "revision": 42 }
```

Write it at build time, from the `revision` that came back with the content, to
the site's public root. It must be a number.

If the site does not serve this file the admin does not break — it reports the
live revision as unknown, permanently, and the studio loses the one signal that
tells them a publish has actually reached the public site. See
[`worker/services/deploy.service.ts`](../worker/services/deploy.service.ts).

## Fourth: the two deploy hooks

Publishing writes a revision. It does not, by itself, put anything on the air —
a rebuild does. The admin pokes a deploy hook to start one, fire-and-forget, and
the site's project has to provide the hook.

| Fired on | Secret on this side | Reads |
|---|---|---|
| Publish | `DEPLOY_HOOK_URL` | `/api/content/published` |
| Every save | `PREVIEW_DEPLOY_HOOK_URL` | `/api/content/draft` |

The preview is optional and worth deferring. When it exists it is a second
Workers Builds environment on the same repository, pointed at
`/api/content/draft` with a `PREVIEW_TOKEN` matching the secret here, sent as:

```
X-Preview-Token: <token>
```

`/api/content/draft` answers the same `{ revision, bundle }` shape as
`published`, but reads unpublished work — which is exactly what must not leak,
hence the token. Everything else in the API refuses it.

The ordering is circular if you fight it: the hook cannot exist before the
project does, and the project cannot build before something has been published.
Publish first, wire the hook second. The full sequence is in the README.

## Details worth knowing before you start

**Nothing is optional.** Every property in every schema is in `required` except
the fields a `PageSection` only has for some kinds. That is not laziness — the
editor refuses a save with a blank in it, both columns of every localised field
are `NOT NULL`, and the bundle is built by projection rather than by merge. You
do not need defensive defaults.

**A private work is listed but has no page.** It appears in `/api/v1/works` with
`cover.src` as the empty string and `media` empty. Those photographs are dropped
before a revision is written, so no URL for them ever leaves the database. Render
the listing; do not generate a route for it.

**The pages are the site's structure, and they are content.** `/api/v1/pages`
answers with every page in order: a `slug`, the words that name it, and an
ordered list of `sections`. Generate one route per entry — the empty slug is the
front page, served at the locale's own address — and render each section by its
`kind`. The studio adds, removes and reorders both pages and sections, so treat
the list as data, not as a fixture.

**A section kind is a component you write.** There are eight; three take no
fields at all and simply mean "the works", "the programmes", "the mentors". The
enum is in `api.json`, so a generated client fails to compile when a kind is
added rather than rendering a hole.

**The nav is the pages.** There is no `site.nav`: the bar is the pages whose
`navLabel` is not null, in `pages` order. The one item that is not a page is
Contact, which opens a panel over the current page rather than leading anywhere —
its label is `contact.nav` in the dictionary.

**A page's own words are on the page, not in the dictionary.** Its title, its
prose and the headings over its sections belong to a page that can be deleted.
`/api/v1/copy/{locale}` is the chrome that outlives every page — the labels on a
work, the accessibility strings, the contact card, the footer, the 404.

**`site.url` is the site's own origin**, without a trailing slash, and every
canonical, hreflang, `og:url` and sitemap entry should resolve against it. It
comes from the admin's `PRODUCTION_URL`, so moving domains is one edit here
rather than an edit plus a hand-written `UPDATE` against D1.

**Fetch `api.json` over HTTPS.** The `servers` entry is derived from the origin
the document was fetched from. The scheme is forced to `https` for anything that
is not loopback, but the hostname is not — download it from the deployed admin,
not from a local `wrangler dev`, or the generated client points at localhost.

**Before the first publish, everything answers 404.** A revision is a snapshot;
until one exists there is nothing to read. That is a real state to handle in a
build script, not a misconfiguration.
