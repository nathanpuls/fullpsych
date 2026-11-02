# FullPsych.com

Public patient-information website for Nathan Puls, PMHNP-BC. The editable source of truth is the Google Doc **Puls Patient Info - Lifestance** (`1NA7cSprKUmmTDUERJcAbye3LJ5qal98SfzzZI8JEJM0`).

> Public professional information only. Never add patient names, appointment details, messages, diagnoses, medications, recordings, or other protected health information to the source document or published content.

## Architecture

```text
Google Doc tabs
    │  Publish website menu (Apps Script)
    │  HMAC-signed HTTPS request
    ▼
Publish-only Cloudflare Worker ──► R2: immutable versioned JSON
    │                              R2: content/current.json
    └── purge current.json URL

Visitor ──► Cloudflare Pages (static HTML/CSS/JS)
        └─► R2 custom domain (cached JSON; no Worker on page views)
```

- **Google Docs is the editor.** Six document tabs map to five public pages: Home, About, Approach, First Visit, and Resources (Medication Guide + FAQs).
- **Cloudflare Pages serves the site.** There are no Pages Functions and no server-side request path. Layout assets are static and globally cached.
- **R2 stores published content.** Each publish writes an immutable `content/versions/<id>.json` plus `content/current.json`.
- **A Worker runs only when publishing.** It validates an HMAC signature, rejects oversized or malformed payloads, writes R2, and purges the single mutable URL. Visitors never invoke it.
- **No D1.** The site has no database, accounts, forms, analytics, or patient-data collection.

### Why this avoids stale content and per-visitor Worker cost

The browser requests `content/current.json` with revalidation. Cloudflare can satisfy normal requests from its edge cache. On publish, the publisher replaces that object and explicitly purges its URL, so a refresh receives the new version within seconds instead of waiting for a 30-second TTL. The immutable version object can be cached for a year. There is no Worker request on a page view; R2 is reached only on a cache miss after a publish or in a new edge location.

An R2-only design without purge would either be stale for its TTL or send every refresh to R2. A Worker-backed read path would be fresh but create an unnecessary Worker request per visit. The publish-only Worker is the small, reliable middle ground.

## Publishing workflow

1. Edit the six tabs in the source Google Doc. Use headings, paragraphs, bullet lists, bold/italic text, and links.
2. In the Doc, choose **FullPsych → Preview publish** to review the public payload and run the PHI reminder.
3. Choose **FullPsych → Publish website** and confirm that the document contains only public professional information.
4. Apps Script serializes supported rich text, signs the request, and sends it to the publish-only Worker.
5. The Worker writes a versioned snapshot, updates `current.json`, and purges the current-content URL.
6. Refresh FullPsych.com. The new content should appear within seconds.

Publishing does not depend on ChatGPT. ChatGPT can safely edit the Google Doc through the connected Google Drive tools; the document owner can then publish from the Doc menu. A future trusted integration may call the same signed publisher endpoint, but the shared secret must never be exposed to the browser or committed to Git.

## Security

- The publishing endpoint accepts only `POST`, requires a recent timestamp and HMAC-SHA-256 signature, enforces an allowlist of document/tab IDs, validates URLs, and limits payload size.
- Secrets are stored only in Apps Script Script Properties and Cloudflare Worker secrets. They are not stored in the document, repository, or front-end bundle.
- The renderer builds DOM nodes and sanitizes links; it does not inject document HTML.
- External links use `rel="noopener noreferrer"`.
- The site has a restrictive Content Security Policy and does not collect visitor data.
- Keep editing access to the source Doc limited. Anyone able to edit the bound Apps Script project may be able to publish public content.

## Repository map

- `site/` — static five-page website
- `publisher/` — publish-only Cloudflare Worker
- `apps-script/` — bound Google Docs script and manifest
- `content/seed.json` — initial snapshot derived from the source Doc
- `scripts/` — local validation and smoke tests

## Setup and deployment

Detailed, copy-pasteable instructions are in [`DEPLOYMENT.md`](DEPLOYMENT.md). The initial deployment requires a Cloudflare account with access to the `fullpsych.com` zone and one manual Apps Script installation in the source document.

## Local checks

```sh
npm test
```

The test suite validates the content schema, builds the static output, checks all five routes, and exercises the publisher's signature and validation logic locally.
