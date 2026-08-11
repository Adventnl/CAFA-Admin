# CAFA-Admin

The editor and the backend for [CAFA-Template](https://github.com/Adventnl/CAFA-Template) —
the c.a.f.a atelier site. It lets the studio add works, change text and replace
photographs without touching code, then preview the result and publish it.

## How it works

One Cloudflare Worker serves both halves: the React editor as static assets, and
the API that owns the content. The content is in D1 and the photographs are in
R2. The site itself is a static export with no server runtime, so nothing is
read at request time — the content is fetched once, by the site's build.

```
studio edits  →  saved to the live tables  →  preview build reads the draft
                              ↓
                        studio publishes
                              ↓
        snapshot into a revision  →  deploy hook  →  production build
```

Saving writes the tables. Publishing copies them into an append-only `revision`
row and pokes a Cloudflare deploy hook; the production build reads the newest
revision. So there are two states, as there always were, and they are no longer
branches:

| | What it is | Where it shows up |
|---|---|---|
| The live tables | Where every save goes, immediately | The preview URL |
| The newest revision | What the public sees | cafa-studio.com |

Rolling back inserts a new revision holding an old one's content, so history is
append-only and anything that was ever live stays recoverable.

## What it will not let you do

The admin is deliberately narrower than a general CMS. Most of the constraints
the site's constitution sets are enforced in the form, and now also in the
schema, rather than discovered at build time:

- **Both languages, always.** Every piece of copy has a Chinese and an English
  column side by side, both `NOT NULL`. A blank in either blocks the save.
- **Alt text is required.** A `CHECK` constraint refuses an image whose
  description is half-filled. A photograph that genuinely carries no information
  is marked *decorative*, which is a deliberate choice rather than an omission.
- **Photographs are resized before upload.** The site never asks for anything
  above 2400px, so originals are scaled to fit that in the browser and
  re-encoded — which also drops the EXIF block and the GPS coordinates in it.
  Their dimensions are then measured again in the Worker, from the bytes,
  because they become the aspect box the site's CLS budget rests on.
- **A private work publishes nothing.** It is listed in the index and has no
  page; its cover and photographs are dropped when a revision is built, so no
  URL for them ever reaches a browser.
- **The nav's shape, the locales and the site URL are not editable.** They are
  wired to the template's `lib/routes.ts` and to the deployment — the site URL
  literally so: it is the `PRODUCTION_URL` var, stamped into each published
  revision by `worker/domain/bundle.ts`. The nav's *labels* are editable, because they
  are words on a screen.

If a save would still produce content the site cannot build, the build fails and
the previous deploy keeps serving. The live site cannot be broken from here.

## Setting it up

From nothing: a registered domain and these two repositories. The order below is
load-bearing in three places, each flagged where it matters.

Hostnames, decided once and wired everywhere:

| | |
|---|---|
| `cafa-studio.com` | the site — CAFA-Template's Worker, apex only |
| `admin.cafa-studio.com` | this editor |
| `media.cafa-studio.com` | the R2 bucket, so transformations have an origin |

### 1. The zone

Add `cafa-studio.com` to Cloudflare as a zone and move its nameservers at the
registrar. **Nothing else in this list works until the zone is active** — custom
domains, the R2 domain and image transformations all hang off it.

Then, on the zone: turn on **Image Transformations** (Images → Transformations),
and add a **redirect rule** sending `www.cafa-studio.com` to the apex, 301.

Transformations are the one that fails invisibly. Every photograph on the site
is served through `/cdn-cgi/image/…`, so with it off the site builds, deploys
and renders with every image broken.

### 2. The database and the bucket

```sh
npx wrangler d1 create cafa-content     # paste the id into wrangler.jsonc
npx wrangler r2 bucket create cafa-media
npx wrangler d1 migrations apply cafa-content --remote
```

`database_id` in `wrangler.jsonc` ships as a placeholder, because it is specific
to your account. The first command prints the real one; nothing works until it
is pasted in.

Then connect **`media.cafa-studio.com`** to the bucket in its R2 settings, so it
matches `MEDIA_BASE` in `wrangler.jsonc`. A subdomain of the site's own zone on
purpose: `/cdn-cgi/image/` runs on the zone serving the page, so an origin
inside that same zone costs no second TLS handshake on the LCP path.

### 3. The content

The content is a one-shot import from the JSON the template used to carry and
the photographs it still does. **The JSON is in the template's git history
rather than its working tree** — it was deleted when this database became the
source of truth, and a checked-in copy would be a second one, quietly going
stale. So restore it, import, and throw it away again:

```sh
cd ../CAFA-Template
git checkout 19dadde -- src/content/    # the last commit that had them
cd ../CAFA-Admin

node scripts/import.mjs ../CAFA-Template
npx wrangler d1 execute cafa-content --remote --file import/seed.sql
sh import/upload.sh

cd ../CAFA-Template && git reset -q -- src/content && rm -rf src/content
```

(`git checkout <commit> -- <path>` stages what it restores, so the last line has
to unstage before deleting, or the next commit resurrects the files.)

That should report *10 works, 4 programmes, 6 mentors, 49 copy keys, 71 images*.

The importer emits rather than executes, so both artefacts can be read before
they are run. Both are re-runnable: the seed clears the tables it fills, and an
object put over an existing key replaces it.

**Only after `upload.sh` has succeeded** is it safe to delete `media-source/`
from the template repository — until then it is the only copy of the
photographs outside git history, and the importer reads from it.

### 4. A GitHub OAuth app

Create one at **Settings → Developer settings → OAuth Apps**:

- **Homepage URL** — `https://admin.cafa-studio.com`
- **Authorization callback URL** — `https://admin.cafa-studio.com/auth/callback`

The callback is the one that has to be exact. `handleLogin` builds the redirect
from the request's own origin, so the Worker always sends whatever host you
reached it on — but GitHub checks that against what is registered here and
refuses anything else. **Moving the admin to a different hostname means editing
this app**, or sign-in fails at the callback with a mismatch error rather than
anywhere useful.

Only the account named in `OWNER_LOGIN` (currently `adventnl`) can sign in.
Anyone else is refused after the OAuth round trip, before a session exists.
GitHub is only the sign-in now, so the scope is `read:user` — the token it
returns cannot read or write a repository.

### 5. Secrets

Only the first three are needed to get the admin working. The deploy hooks come
later, in step 7, because the thing they point at does not exist yet.

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET            # 32+ random bytes
```

`SESSION_SECRET` both signs and encrypts the session cookie. Rotating it signs
everyone out, which is the intended way to revoke access in a hurry.

### 6. Deploy the admin, and publish once

```sh
npm install
npm run deploy
```

`wrangler deploy` creates `admin.cafa-studio.com` from the `routes` entry in
`wrangler.jsonc`. Sign in, confirm the content is there, and **press Publish**.

That first publish matters more than it looks. A revision is a *snapshot* of the
bundle, so until one exists `/api/content/published` answers 404 and the
template has nothing to build from. Publishing before the site exists is the
right way round.

### 7. The site

A Workers Builds project on **CAFA-Template**, building the default branch, with
one environment variable:

```
CONTENT_API=https://admin.cafa-studio.com/api/content/published
```

Its `wrangler.jsonc` binds the apex, so the first successful build is also what
puts `cafa-studio.com` on the air.

Then close the loop: create a **deploy hook** for that project and store it back
here, so publishing rebuilds the site instead of only writing a revision.

```sh
npx wrangler secret put DEPLOY_HOOK_URL
```

This is the third ordering that matters, and it is circular if you fight it: the
hook cannot exist before the project does, and the project cannot build before
something has been published. Publish first, wire the hook second.

### 8. The preview — optional, and worth deferring

A second Workers Builds environment on the same repository, env
`CONTENT_API=https://admin.cafa-studio.com/api/content/draft` plus a
`PREVIEW_TOKEN` matching the secret below. Its deploy hook becomes
`PREVIEW_DEPLOY_HOOK_URL`, and its alias becomes `PREVIEW_URL` in
`wrangler.jsonc`; until that is set the admin simply shows no preview link.

```sh
npx wrangler secret put PREVIEW_TOKEN             # lets the preview read the draft
npx wrangler secret put PREVIEW_DEPLOY_HOOK_URL   # rebuilds the preview on save
```

The preview never answers on the custom domain — only the production deployment
does — so it keeps its own alias URL and the apex keeps serving whatever was
last published.

Both are optional. Without them there is no preview, and everything else works.

## Developing

```sh
npm install
npm run dev        # wrangler dev, Worker + SPA together on :8787
npm run build      # typecheck, then build the SPA into dist/
npm run lint
```

Local development needs a `.dev.vars` file with the secrets above. It is
gitignored; do not commit it.

## Layout

The Worker is layered the way `veyra_api` is, because the same shape solves the
same problem: **dependencies point down only, and each layer is allowed to know
exactly one thing.** A controller knows HTTP and no SQL. A service knows the
rules and never builds a `Response`. A repository knows rows and has never heard
of a `Request`.

```
migrations/
  0001_initial.sql          the schema, and the constraints that are really rules
scripts/
  import.mjs                the one-shot move from files to database

worker/
  index.ts                  the composition root: build, declare routes, dispatch
  env.ts                    every binding and secret, in one interface

  shared/                   what veyra_api keeps in its Shared project
    api-response.ts         the { success, data, code, msg } envelope
    api-exception.ts        the one exception a service throws on purpose
    exception-filter.ts     where every throw becomes a response
    router.ts               the route table; [Authorize] and [AllowAnonymous]
    current-user.ts         who is asking

  controllers/              HTTP in, HTTP out — one per resource
    auth · session · content · media · publish · revisions · public-content

  services/                 the rules
    auth · content · media · publish · deploy

  repositories/             D1: rows in, domain objects out
    content.repository.ts   the unit of work — one batch, one transaction
    site · works · programs · mentors · copy    one aggregate each
    media · revision
    mapping.ts              paired columns ⇄ LocalisedText, four columns ⇄ ImageRef

  storage/media-storage.ts  R2
  models/rows.ts            the tables, as TypeScript sees them
  models/dtos/              request and response contracts
  domain/
    bundle.ts               what a published revision contains, and what it withholds
    image.ts                dimensions read from the file rather than trusted
    session.ts              AES-GCM sealed cookie — no session storage anywhere

src/
  content/                  the shape of the content, and the rules a save must satisfy
  services/                 the only place the browser talks to the Worker
    http.ts                 unwraps the envelope; nothing else knows about fetch
    session · content · media · publish
  pages/                    one per route, plus sign-in and history
  ui/                       the layout, the form vocabulary, the publish bar
  routes.ts                 the route table, and the whole of the client router
  useEditor.ts              what has changed, and how it gets sent
```

### Why the envelope stops at the build endpoints

Every authenticated route answers in `ApiResponse<T>`. The two that a *build*
reads — `/api/content/published` and `/api/content/draft` — deliberately do not:
they answer a bare `{ revision, bundle }`, because that is a contract with a
different repository. CAFA-Template's `scripts/fetch-content.mjs` checks for
exactly that shape before `next build` starts. The envelope exists for a client
that branches on `success` and shows `msg` to a person; a build script that
exits non-zero is not that client, and wrapping those two would buy consistency
nobody reads at the cost of a lockstep deploy across two repositories.

Their *failures* still come back enveloped, because those go through the same
exception filter as everything else — and the build script exits on the status
code before it ever looks at the body.

### Why the whole content set goes over at once

It is 39 KB. Sending all of it is simpler than describing which parts moved and
cheaper than getting that description wrong. The write is a single `db.batch()`,
which D1 runs as one transaction — deletes ordered children-first and inserts
parents-first, so no statement in the batch leaves a dangling reference and no
build can catch a half-applied save.

### Why photographs upload before the save, not with it

They used to arrive in the same git commit as the record referencing them, which
is what made an edit atomic. A database gets that guarantee from a foreign key
instead, and a foreign key needs its target to exist — so the object goes to R2
and the row goes to `media` the moment a photograph is chosen, and the save that
names it comes after. A photograph uploaded and then abandoned is an orphan in
the bucket, which costs nothing at this volume and is the deliberate trade.

### The copy of the content types

`src/content/types.ts` mirrors the template's `src/lib/types.ts` rather than
importing it, because the two repositories deploy separately and a shared
package for six interfaces would cost more than it saves. It diverges in two
places on purpose — `SiteContent` has no `nav`, `locales` or `localeNames`, and
`Dictionary` has `nav` and `localeName` — both because the admin's types should
describe what the admin can actually change. `worker/domain/bundle.ts` reconciles the
two when it builds a revision. The copy cannot drift dangerously: the template
re-parses every field at build time, so a mismatch fails the build and never
reaches the live site.
