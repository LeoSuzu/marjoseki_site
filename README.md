# Marjo Seki Website Demo

This is a lightweight 4-page personal website demo with:

- `Home`
- `Information`
- `Events`
- `Store`
- `/admin` scaffolding for owner editing with Decap CMS
- `.pages.yml` config for Pages CMS as a future-proof editing option

## Why this setup

The site itself is a static website, which keeps hosting simple and cheap. The content lives in JSON files:

- `content/site.json`
- `content/store.json`

That makes it easy to:

- host on Netlify or Cloudflare Pages
- avoid managing a database
- let the owner update text and images through a CMS after login

## Recommended direction

If the biggest priority is easy editing for a non-technical owner, keep the first version simple:

- 4 fixed pages
- editable text blocks
- image uploads
- events list
- books and courses catalogue

Do not force online payment on day one. The catalogue can work with:

- email order requests
- PayPal links
- a contact form

That keeps the site easy to manage and avoids unnecessary setup.

## Recommended auth and editor setup

As of May 8, 2026, the cleanest recommendation for a new project is:

1. Host the public site on Cloudflare Pages or Netlify as a normal static site.
2. Keep content in this repository.
3. Use Pages CMS as the editing interface.
4. Invite the owner as a collaborator by email.

Why:

- no custom auth code in the website
- no database required for the public site
- drag-and-drop media management
- easier long-term direction than starting a new project on deprecated Netlify Identity and Git Gateway features

Pages CMS config for this repo is already included in:

- `.pages.yml`

## About the current `/admin`

This repo also includes a Decap CMS `/admin` demo because it is quick to show locally.

Important:

- Netlify currently documents Identity and Git Gateway as deprecated for new configurations
- because of that, I recommend Pages CMS for production rather than building a new site around Netlify Identity

## Run locally

### Option 1: Docker

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8080
```

### Option 2: Any static server

Because the pages load JSON with `fetch`, do not open the HTML files directly from disk. Use a local web server instead.

For example:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Editing content without code

### Best long-term path: Pages CMS

1. Push this project to GitHub.
2. Open `https://app.pagescms.org`.
3. Sign in with the repository owner account.
4. Install the Pages CMS GitHub App for the repository.
5. Use the included `.pages.yml` config.
6. Invite the editor by email if they should edit without a GitHub account.

Pages CMS documentation says collaborators can be invited by email and can edit content and media without a GitHub account.

### Alternative path: Netlify + Decap CMS

For the real deployment, the easiest old no-database path is:

1. Push this project to GitHub.
2. Deploy it on Netlify.
3. In Netlify, enable:
   - Identity
   - Git Gateway
4. Invite the owner by email.
5. The owner logs in at:

```text
/admin
```

Then they can:

- edit text
- upload images
- update events
- change store items

## Store recommendation

For the first version, treat the store as a catalogue instead of a full ecommerce system:

- list books and courses
- add prices if wanted
- use email or PayPal links
- add full online checkout only later if it becomes necessary

This is a good fit when the main goal is easy updates.

## CMS editing experience

After deployment, the owner can use `/admin` to:

- change page text
- add or replace pictures
- update event cards
- add or remove store items

## Important note about local `/admin`

The CMS page is included in this demo, but real login and publishing work after deployment with Netlify Identity and Git Gateway connected to a Git repository.

## Files you will likely edit first

- `content/site.json`
- `content/store.json`
- `assets/styles.css`
- `admin/config.yml`
- `.pages.yml`
