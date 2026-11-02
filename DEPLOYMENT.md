# Deployment and publisher setup

The repository contains everything needed to operate FullPsych without AI. The Cloudflare resources are isolated to the `fullpsych.com` zone and the names below.

## Current status

- The static five-page site is deployed at `https://fullpsych.com` and both apex and `www` are attached to the isolated `fullpsych` Static Assets project.
- The prior placeholder DNS records and obsolete `fullpsych.com/*` route to `simple-editor` were removed. FullPsych email-routing MX/TXT records were preserved.
- R2 and the publish-only Worker are prepared in this repository but are not deployed yet because the currently connected Cloudflare token does not grant R2 write or zone cache-purge access.
- Install the bound Apps Script only after the publisher Worker is deployed and a matching `PUBLISH_SECRET` exists.

## Cloudflare resources

- Static Assets project (Cloudflare's current Pages deployment path): `fullpsych`
- R2 bucket: `fullpsych-content`
- Worker: `fullpsych-publisher`
- Public site: `https://fullpsych.com`
- Public content: `https://content.fullpsych.com/content/current.json`
- Publish-only endpoint: `https://publish.fullpsych.com`

The Worker handles publishing only. It is not part of the visitor request path.

## One-time Google Docs installation

Google does not allow a repository to silently attach a bound script to a personal document. The document owner must complete this one-time installation:

1. Open the source Google Doc.
2. Choose **Extensions → Apps Script**.
3. Replace `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
4. In **Project Settings**, enable the manifest file and replace it with [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. In **Project Settings → Script Properties**, add:
   - `PUBLISH_URL` = `https://publish.fullpsych.com`
   - `PUBLISH_SECRET` = the same high-entropy secret configured on the Worker.
6. Save, run `onOpen` once, and approve only the requested current-document and external-request permissions.
7. Reload the Doc. The **FullPsych** menu appears.
8. Run **Preview publish**, then **Publish website**.

The publish secret is intentionally absent from Git and the document body. Limit edit access to the bound script project because a script editor could retrieve Script Properties.

## Cloudflare deployment

From the repository root, using a Cloudflare token scoped to the `fullpsych.com` account/zone:

```sh
npm install
npm test
npx wrangler r2 bucket create fullpsych-content
npx wrangler deploy --config publisher/wrangler.toml
npm run deploy
```

Required token permissions are **Workers Scripts: Edit**, **Workers R2 Storage: Edit**, **Workers Routes: Edit**, **Zone: Read**, **DNS: Edit** (only for first-time domain attachment), and **Cache Purge: Purge** on the `fullpsych.com` zone. A narrower second token with only Cache Purge permission should be stored as the publisher Worker's `CF_API_TOKEN` secret.

Add `content.fullpsych.com` as the custom domain for `fullpsych-content`. Add `fullpsych.com` and `www.fullpsych.com` to the Pages project. Keep the domain's MX and email-routing records unchanged.

Configure Worker secrets without writing them to files:

```sh
npx wrangler secret put PUBLISH_SECRET --config publisher/wrangler.toml
npx wrangler secret put CF_API_TOKEN --config publisher/wrangler.toml
```

`CF_API_TOKEN` needs only cache-purge permission for the `fullpsych.com` zone. The R2 binding itself requires no R2 credential in Apps Script.

## Initial content

Before the Docs menu is installed, upload `content/seed.json` to both:

- `content/current.json` with `Cache-Control: public, max-age=0, must-revalidate, s-maxage=31536000`
- `content/versions/seed-2026-10-29.json` with `Cache-Control: public, max-age=31536000, immutable`

After that, every menu publish creates a new immutable version and atomically updates the current pointer.

## Routine operation

- **Text change:** edit the Google Doc and use **FullPsych → Publish website**.
- **Layout/code change:** update this repository, run `npm test`, and deploy `dist` to the existing Pages project.
- **Rollback content:** copy a chosen version object over `content/current.json`, then purge that URL.
- **Rotate publishing access:** replace the Worker `PUBLISH_SECRET` and update the Doc's Script Property.

ChatGPT can edit the source document through the connected Google Drive tools. Publishing remains a deliberate owner action in Docs. A future trusted connector can invoke the same endpoint by generating the same timestamped HMAC headers.

## Verification checklist

1. `npm test` passes.
2. All five routes return HTTP 200.
3. `current.json` returns JSON, CORS allows `https://fullpsych.com`, and the cache header requires browser revalidation.
4. A harmless wording change made in a source tab appears after a menu publish and refresh.
5. The versioned object exists in R2.
6. Worker analytics show publish requests only; ordinary navigation produces no Worker invocation.
7. Existing non-FullPsych Cloudflare resources and NathanPuls.com remain unchanged.
