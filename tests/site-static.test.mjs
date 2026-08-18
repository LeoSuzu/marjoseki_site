import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const pages = ["index.html", "palvelut.html", "tapahtumia.html", "kirjat.html", "yhteystiedot.html"];
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("content/site.json is valid JSON", () => {
  assert.doesNotThrow(() => JSON.parse(read("content/site.json")));
});

for (const page of pages) {
  test(`${page} has one H1 and Finnish language`, () => {
    const html = read(page);
    assert.match(html, /<html lang="fi">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
  });
}

test("all referenced local HTML image assets exist", () => {
  for (const page of pages) {
    const html = read(page);
    for (const src of html.matchAll(/(?:src|href)="(assets\/(?!https?:)[^"]+)"/g)) {
      assert.equal(existsSync(new URL(src[1], root)), true, `${page}: ${src[1]}`);
    }
  }
});

test("pages opt into the site image loading state", () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<body class="site-loading"/);
    assert.match(html, /class="site-image"/);
  }
});

test("site script prioritizes the hero and defers other images", () => {
  const script = read("assets/site.js");
  assert.match(script, /fetchpriority/);
  assert.match(script, /image\.loading = "lazy"/);
  assert.match(script, /clearSiteLoadingState/);
});

test("all page eyebrow headings have editable metadata", () => {
  for (const page of pages) {
    const html = read(page);
    for (const match of html.matchAll(/<p class="eyebrow(?: [^"]*)?"[^>]*>/g)) {
      assert.match(match[0], /editable-target/);
      assert.match(match[0], /\bid="[^"]+"/);
      assert.match(match[0], /data-edit-label="[^"]+"/);
    }
  }
});

test("all pages include Vercel Web Analytics before the head closes", () => {
  for (const page of pages) {
    const html = read(page);
    const analyticsInitializer = "window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };";
    const analyticsScript = '<script defer src="/_vercel/insights/script.js"></script>';
    const headCloseIndex = html.indexOf("</head>");

    assert.notEqual(headCloseIndex, -1, `${page}: missing </head>`);
    assert.ok(html.includes(analyticsInitializer), `${page}: missing Vercel Analytics initializer`);
    assert.ok(html.includes(analyticsScript), `${page}: missing Vercel Analytics script`);
    assert.ok(
      html.indexOf(analyticsInitializer) < headCloseIndex && html.indexOf(analyticsScript) < headCloseIndex,
      `${page}: analytics must load from the document head`,
    );
  }
});

test("Tapahtumia has no duplicate social wall", () => {
  const html = read("tapahtumia.html");
  assert.doesNotMatch(html, /social-wall|social-embeds/);
});

test("navigation links opt into the shared button style", () => {
  for (const page of pages) {
    const html = read(page);
    assert.equal((html.match(/class="button button--nav"/g) || []).length, 5);
  }
  assert.match(read("assets/site.js"), /className = "button button--nav button--footer"/);
});

test("header uses the approved brand line and three-row desktop structure", () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /Marjo Seki<\/span>/);
    assert.match(html, /Kirjailija, japanilaisen ruoan asiantuntija ja opettaja<\/span>/);
  }
  const styles = read("assets/styles.css");
  assert.match(styles, /flex-direction: column/);
  assert.match(styles, /flex-wrap: nowrap/);
  assert.match(styles, /\.site-nav\.is-open/);
});

test("footer buttons share a fixed width and portrait form photos use 4:5 framing", () => {
  const styles = read("assets/styles.css");
  assert.match(styles, /\.button--footer[\s\S]*?width: 10rem/);
  assert.match(styles, /\.photo-frame > \.image-frame[\s\S]*?aspect-ratio: 4 \/ 5/);
  assert.match(styles, /\.hero__visual,[\s\S]*?background: linear-gradient\(160deg, rgba\(var\(--peach-rgb\)/);
});

test("home eyebrow labels remain separately editable", () => {
  const html = read("index.html");
  for (const id of ["home-hero-kicker", "home-intro-kicker", "home-gallery-kicker"]) {
    assert.match(html, new RegExp(`<p class="eyebrow editable-target"[^>]*id="${id}"`));
  }
});

test("Facebook media is represented as a publication link", () => {
  const site = JSON.parse(read("content/site.json"));
  const facebookMedia = site.tapahtumia.media.items.find((item) => item.link.includes("facebook.com"));
  assert.ok(facebookMedia);
  assert.equal(facebookMedia.videoUrl, "");
  assert.match(facebookMedia.link, /^https:\/\/www\.facebook\.com\//);
});

test("media renderer separates direct video files from social links", () => {
  const script = read("assets/site.js");
  assert.match(script, /isDirectVideoSource/);
  assert.match(script, /\.mp4/);
  assert.match(script, /media-item__fallback/);
  assert.match(script, /noopener noreferrer/);
});

test("image editors expose shared scale and position settings", () => {
  const script = read("assets/site.js");
  assert.match(script, /IMAGE_DEFAULTS/);
  assert.match(script, /normalizeImageSettings/);
  assert.match(script, /applyImageSettings/);
  assert.match(script, /type: "range"/);
  assert.match(script, /imagePositionX/);
  assert.match(script, /imagePositionY/);
  assert.match(script, /min: 80/);
  assert.match(script, /max: 180/);
});

test("recent events use a 60-day retention rule", () => {
  const script = read("assets/site.js");
  assert.match(script, /const RECENT_EVENT_DAYS = 60/);
  assert.match(script, /recentCutoff/);
  assert.match(script, /isWithinRecentEventWindow/);
});

test("event dates accept whitespace after Finnish date separators", () => {
  const script = read("assets/site.js");
  assert.equal(script.includes("(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{4})"), true);
});

test("header keeps the brand line above the name and right-aligned navigation row", () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<span class="brand__eyebrow" id="brand-eyebrow"/);
    assert.match(html, /<div class="site-header__row">/);
  }
  const styles = read("assets/styles.css");
  assert.match(styles, /\.site-header__row/);
  assert.match(styles, /\.site-nav[\s\S]*?margin-left: auto/);
});

test("navigation hover uses the exact primary button hover token", () => {
  const styles = read("assets/styles.css");
  assert.match(styles, /--button-hover-background/);
  assert.match(styles, /\.button:hover[\s\S]*?background: var\(--button-hover-background\)/);
  assert.match(styles, /\.button--nav:hover[\s\S]*?background: var\(--button-hover-background\)/);
});

test("all eyebrow headings use the Tervetuloa typography", () => {
  const styles = read("assets/styles.css");
  assert.match(styles, /\.eyebrow[\s\S]*?font-size: 1\.5rem/);
  assert.match(styles, /\.page-hero \.eyebrow[\s\S]*?font-size: 1\.5rem/);
  assert.match(styles, /\.section-heading \.eyebrow[\s\S]*?font-size: 1\.5rem/);
  assert.match(styles, /text-transform: uppercase/);
});

test("form-side photos are half-width and hero frame has an even max width", () => {
  const styles = read("assets/styles.css");
  assert.match(styles, /\.photo-frame[\s\S]*?width: 50%/);
  assert.match(styles, /\.hero__visual[\s\S]*?width: min\(100%, 340px\)/);
  assert.match(styles, /\.hero__visual[\s\S]*?margin-inline: auto/);
});
