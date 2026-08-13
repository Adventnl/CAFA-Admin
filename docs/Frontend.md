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

## Second: photographs go through a transform

This is the one that fails silently, so it comes second only because the build
contract has to come first.

`Photograph.url` and `site.mediaBase` resolve an object key against
`media.cafa-studio.com`, which serves R2 originals — full-size, straight off the
bucket. **Do not point an `<img src>` at one.** Every photograph on the site is
served through Cloudflare's image transformations:

```
/cdn-cgi/image/<options>/<absolute source url>
```

Two things about this are load-bearing:

- **`/cdn-cgi/image/` runs on the zone serving the page**, not on the media
  origin. The path is relative to the site's own hostname; the source URL inside
  it is absolute. `media.cafa-studio.com` is a subdomain of the same zone
  specifically so this costs no second TLS handshake on the LCP path.
- **Image Transformations must be enabled on the zone** (Images →
  Transformations). With it off, the site builds, deploys, and renders with
  every image broken. Nothing in this repository can detect that.

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
`NavItem.route`/`NavItem.opens`. That is not laziness — the editor refuses a save
with a blank in it, both columns of every localised field are `NOT NULL`, and the
bundle is built by projection rather than by merge. You do not need defensive
defaults.

**A private work is listed but has no page.** It appears in `/api/v1/works` with
`cover.src` as the empty string and `media` empty. Those photographs are dropped
before a revision is written, so no URL for them ever leaves the database. Render
the listing; do not generate a route for it.

**The nav is code, its labels are content.** `site.nav` arrives in order, each
item naming either a `route` or a panel it `opens`, with a label in both
languages. The destinations are fixed and enumerated in `api.json`; the studio
can rename an item without a deploy, but cannot add or move one.

**Nav labels are not in the dictionary.** They are in `site.nav`. Everything else
— headings, labels, accessibility strings, the 404 page — is in
`/api/v1/copy/{locale}`, one dictionary per language.

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
