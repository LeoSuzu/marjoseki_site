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
