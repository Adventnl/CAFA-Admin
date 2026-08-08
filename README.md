# CAFA-Admin

The editor for [CAFA-Template](https://github.com/Adventnl/CAFA-Template) — the
c.a.f.a atelier site. It lets the studio add works, change text and replace
photographs without touching code, then preview the result and publish it.

## How it works

The site is a static export with no backend, so there is nothing for an editor
to write to at runtime. Instead **the repository is the database**:

```
studio edits  →  commit to `draft`  →  Cloudflare builds the preview
                                              ↓
                                       studio approves
                                              ↓
                      `main` fast-forwards  →  Cloudflare builds production
```

Everything the studio changes lands in `src/content/*.json` and
`media-source/**` in the template repository. Git supplies version history and
rollback for free, and there is no database to back up, pay for or lose.

Two branches carry the whole model:

| Branch | What it is | Where it shows up |
|---|---|---|
| `draft` | Where every save goes, immediately | The preview URL |
| `main` | What the public sees | cafa.hanoryx.com |

Publishing is a fast-forward of `main` to `draft`, never a merge — `draft` is
only ever `main` plus content commits. If a developer pushes code to `main`,
the admin notices that `draft` is behind and offers **Catch up with the site**,
which merges `main` into `draft` before anything else happens.

## What it will not let you do

The admin is deliberately narrower than a general CMS. It refuses to write
anything but `src/content/*.json` and `media-source/**`, and the constraints
the site's own constitution sets are enforced in the form rather than
discovered at build time:

- **Both languages, always.** Every piece of copy has a Chinese and an English
  field side by side. A blank in either blocks the save.
- **Alt text is required.** An image with no description cannot be saved. A
  photograph that genuinely carries no information is marked *decorative*,
  which is a deliberate choice rather than an omission.
- **Photographs are resized before upload.** The site's pipeline never emits
  anything above 2400px, so originals are scaled to fit that in the browser and
  re-encoded — which also drops the EXIF block and the GPS coordinates in it.
- **Nav, locales and the site URL are not editable.** They are wired to
  `lib/routes.ts` and to the deployment; changing one is a code change.

If a save would still produce content the site cannot build, the draft build
fails and `main` is untouched. The live site cannot be broken from here.

## Setting it up

### 1. A GitHub OAuth app

Create one at **Settings → Developer settings → OAuth Apps**:

- **Homepage URL** — the deployed admin's URL
- **Authorization callback URL** — that URL plus `/auth/callback`

Only the account named in `OWNER_LOGIN` (currently `adventnl`) can sign in.
Anyone else is refused after the OAuth round trip, before a session exists.

### 2. Secrets

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET     # 32+ random bytes
```

`SESSION_SECRET` both signs and encrypts the session cookie, which is where the
GitHub token lives. Rotating it signs everyone out, which is the intended way
to revoke access in a hurry.

### 3. Cloudflare, on the template repository

Two things need to be true in the template's Workers Builds settings:

1. **The `draft` branch is built**, as a non-production build, and **preview
   URLs are enabled**. That preview alias is what "View draft" opens.
2. Once that alias exists, add it to `wrangler.jsonc` here as `PREVIEW_URL`.
   Until it is set, the admin simply shows no preview link — everything else
   works.

The `draft` branch itself is created automatically the first time the admin
loads.

### 4. Deploy

```sh
npm install
npm run deploy
```

## Developing

```sh
npm install
npm run dev        # wrangler dev, Worker + SPA together on :8787
npm run build      # typecheck, then build the SPA into dist/
npm run lint
```

Local development needs a `.dev.vars` file with the three secrets above. It is
gitignored; do not commit it.

## Layout

```
worker/
  index.ts     routes, and the allowlist of paths the admin may write
  session.ts   AES-GCM sealed cookie — no session storage anywhere
  github.ts    the Git Data API: blobs → tree → commit → ref, atomically
src/
  content/     the shape of the site's JSON, and the rules a save must satisfy
  editors/     one per content type
  ui/          the form vocabulary, and the publish bar
  useEditor.ts what has changed, and how it gets sent
```

### Why one commit per save

Saves go through the Git Data API rather than the simpler contents endpoint,
which would make one commit per file. That is not just untidy: a work's JSON
and the photographs it references arriving in separate commits means a build in
between that points at an image which is not there yet. Blobs, one tree, one
commit, one ref update — the site sees all of an edit or none of it.

### The copy of the content types

`src/content/types.ts` mirrors the template's `src/lib/types.ts` rather than
importing it, because the two repositories deploy separately and a shared
package for six interfaces would cost more than it saves. The copy cannot drift
dangerously: the template re-parses every field at build time, so a mismatch
fails the draft build and never reaches the live site.
