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
