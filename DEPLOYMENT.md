# Deployment and publisher setup

The repository contains everything needed to operate FullPsych without AI. The Cloudflare resources are isolated to the `fullpsych.com` zone and the names below.

## Cloudflare resources

- Pages project: `fullpsych`
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
npx wrangler pages project create fullpsych --production-branch main
npx wrangler pages deploy dist --project-name fullpsych --branch main
```

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
