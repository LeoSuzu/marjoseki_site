# Marjo Seki — Website

Static site for Marjo Seki: a Japanese-inspired brand for Japanese cooking courses, books, and events. Built by **Leo Suzuki** (Oy Findaco Ltd) for the client, Marjo Seki.

## Product

Four pages (content in Finnish):

- `Home` — introduction and gallery
- `Palvelut` — cooking courses, with images and pricing
- `Kirjat` — books, with an order form
- `Tapahtumia` — upcoming/past events, Facebook/Instagram links
- `Yhteystiedot` — contact details and an inquiry form

All copy, images, and course/event data live in `content/site.json`. The site itself is static HTML/CSS/JS — no database.

A small pencil icon (✎) in the header opens a login for a lightweight in-browser edit mode (text/images editable inline). Login is verified server-side via a Vercel function (`api/login.js`), so credentials never reach the browser. Edits auto-save to the browser's `localStorage` as a draft; the "Julkaise sivulle" button then commits `content/site.json` straight to GitHub via `api/publish-content.js` (GitHub Contents API), which triggers a Vercel redeploy — live in about a minute, no GitHub or git knowledge required. "Lataa varmuuskopio" / "Tuo varmuuskopio" remain as a manual JSON export/import fallback. The repo also has a [Pages CMS](https://app.pagescms.org) config (`.pages.yml`) as an alternate editing path if ever needed, but it's not the primary flow.

The two order/inquiry forms (`Kirjat`, `Yhteystiedot`) submit through `api/submit-form.js`, which sends email via [Resend](https://resend.com).

## Stack

- Static HTML/CSS/JS, no build step, no framework
- Vercel serverless functions under `api/` for login/session and form submission
- Deployed on Vercel

## Environment variables

Set these in Vercel → Project Settings → Environment Variables (see `.env.example` for local `vercel dev` testing):

- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — edit-mode login
- `SESSION_SECRET` — long random string signing the session cookie
- `RESEND_API_KEY`, `CONTACT_EMAIL`, `FROM_EMAIL` — form email delivery
- `GITHUB_TOKEN` — fine-grained PAT, scoped only to this repo, "Contents: Read and write" — powers the "Julkaise sivulle" button
- `GITHUB_REPO`, `GITHUB_BRANCH` — optional, default to `LeoSuzu/marjoseki_site` / `main`

Never commit a real `.env` — it's gitignored.

## License

Proprietary — see `LICENSE`. All rights reserved by Oy Findaco Ltd. Not for reuse without permission.

**Leo Suzuki**
Oy Findaco Ltd
leona.suzuki@gmail.com
