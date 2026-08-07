# Sivuston yhtenäisyys, muokkaustila ja SEO - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yhtenäistää Marjo Seki -sivuston käyttöliittymä, korjata Tapahtumia-sivun media-linkit, lisätä kuvien asemointi muokkaustilaan, poistaa placeholder-välähdys ja varmistaa tekninen SEO.

**Architecture:** Nykyinen JSON-vetoinen renderöinti säilytetään. Kuvan esitysominaisuudet normalisoidaan pienillä apufunktioilla ja välitetään kaikille staattisille ja dynaamisille kuvakehyksille CSS-muuttujina; editorin nykyistä modaalia laajennetaan range-kentillä ja esikatselun live-päivityksellä. Sivujen staattinen HTML säilyttää layoutin, mutta lataustila piilottaa tekniset placeholderit ja paljastaa oikean kuvan latauksen jälkeen.

**Tech Stack:** Staattinen HTML, CSS, ES modules JavaScript, `content/site.json`, Node.js built-in test runner, selainpohjainen manuaalinen visual QA.

## Global Constraints

- Pidä sivusto kevyenä ja staattisena; uusia runtime-riippuvuuksia ei lisätä.
- Säilytä vanhan `content/site.json`-sisällön taaksepäin yhteensopivuus: puuttuvat kuva-asetukset käyttävät oletuksia.
- Kuvan oletusasetukset ovat `imageScale=100`, `imagePositionX=50`, `imagePositionY=50`; sallitut alueet ovat `imageScale=80-180` ja X/Y `0-100`.
- Hero-kuva on eager-loadattava ja sille annetaan `fetchpriority="high"`; muut kuvat ovat lazy-loadattavia.
- Sosiaalisen median linkit säilyvät footerissa; Tapahtumia-sivulle ei jää erillistä sosiaalisen median osiota.
- Älä muuta placeholder-tapahtumien tai muun sisällön tekstejä ilman käyttäjän erillistä päätöstä.
- Säilytä käyttäjän ennestään tekemä muutos `assets/styles.css`-tiedostossa.

---

## File Map

- Modify: `index.html`, `palvelut.html`, `tapahtumia.html`, `kirjat.html`, `yhteystiedot.html` — lataustilan luokka, eyebrow-rakenne, kuvakehysten markup ja sosiaalisen osion poisto.
- Modify: `assets/site.js` — kuvan latauksen tila, kuva-asetukset, editorin range-kentät, media-linkin tunnistus, footer/nav-linkkien luokat ja Tapahtumia-renderöinnin siivous.
- Modify: `assets/styles.css` — yhteinen painiketyyli, kuvakehysten layout, lataus/fade-in, lomakekuvien mitoitus ja editorin range-kenttien ulkoasu.
- Modify: `content/site.json` only when a migration/default fixture is required; existing content must remain valid without adding settings to every item.
- Create: `tests/site-static.test.mjs` — Node built-in test runnerilla ajettavat staattiset regressio- ja asset-tarkistukset.
- Modify: `docs/superpowers/specs/2026-08-07-site-consistency-edit-mode-seo-design.md` — vain jos toteutuksessa havaitaan hyväksyttyä suunnitelmaa täsmentävä toteutuspoikkeama.

## Task 1: Lisää testien perusrunko ja paljasta nykyinen regressiotila

**Files:**
- Create: `tests/site-static.test.mjs`

**Interfaces:**
- Produces: `node --test tests/site-static.test.mjs` -komento, joka tarkistaa viiden sivun rakenteen, JSON:n validiteetin ja paikallisten asset-polkujen olemassaolon.

- [ ] **Step 1: Kirjoita lähtötilan testit**

```js
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
```

- [ ] **Step 2: Aja testit ja tallenna lähtötilan tulos**

Run: `node --test tests/site-static.test.mjs`

Expected: testit ajavat nykyisellä rakenteella; jos jokin nykyinen ehto epäonnistuu, kirjaa täsmällinen havainto ennen seuraavaa tehtävää.

- [ ] **Step 3: Commitoi testirunko**

```bash
git add tests/site-static.test.mjs
git commit -m "test: add static site regression checks"
```

## Task 2: Korjaa ensimmäisen ruudun kuvalataus ja placeholder-välähdys

**Files:**
- Modify: `index.html`, `palvelut.html`, `tapahtumia.html`, `kirjat.html`, `yhteystiedot.html`
- Modify: `assets/site.js`
- Modify: `assets/styles.css`
- Test: `tests/site-static.test.mjs`

**Interfaces:**
- Consumes: existing `setImage`, `markLazyImage`, `markEagerImage`, `renderPage`, and static hero/form image elements.
- Produces: `setImage` attaches loading state and exposes the real image only after `load`/`decode`; `renderPage` marks exactly the page hero as eager and below-fold images lazy.

- [ ] **Step 1: Lisää regressiotestit latausstrategialle**

Lisää testit, jotka vaativat kaikilta sivuilta `body class`-lataustilan ja varmistavat, että `assets/site.js` sisältää sekä `fetchpriority`- että `loading="lazy"`-käsittelyn eikä Tapahtumia-sivun staattinen media-alue käytä placeholderia.

- [ ] **Step 2: Lisää HTML:ään lataustila ja kuvien tunnisteet**

Muuta jokaisen sivun body esimerkiksi muotoon:

```html
<body class="site-loading" data-page="home">
```

Lisää staattisille hero- ja lomakekuville luokka `site-image`. Älä poista layoutia säilyttäviä kehyksiä; tekninen placeholder saa jäädä fallbackiksi, mutta sitä ei näytetä ennen oikean sisällön renderöintiä.

- [ ] **Step 3: Toteuta JS-kuvan lataustila**

Lisää `assets/site.js`-tiedostoon apufunktiot:

```js
const revealImage = (image) => image.classList.remove("is-loading");

const prepareImage = (image, src) => {
  image.classList.add("site-image", "is-loading");
  image.addEventListener("load", () => revealImage(image), { once: true });
  image.addEventListener("error", () => revealImage(image), { once: true });
  image.src = src || "";
  if (image.complete && image.naturalWidth > 0) {
    revealImage(image);
  }
};
```

`setImage` käyttää `prepareImage`-funktiota. `renderPage` merkitsee hero-kuvan eager-loadattavaksi ja kaikki muut sivun kuvat lazy-loadattaviksi. Kun renderöinti on valmis, `site-loading` poistetaan bodyltä; 1500 ms:n varmistuspoisto estää sivua jäämästä näkymättömäksi poikkeustilanteessa.

- [ ] **Step 4: Lisää CSS:n neutraali lataus- ja fade-in-tila**

```css
.site-image {
  opacity: 1;
  transition: opacity 220ms ease;
}

.site-loading .site-image,
.site-image.is-loading {
  opacity: 0;
}

.image-frame,
.hero__visual,
.page-hero__image,
.photo-frame {
  background: linear-gradient(160deg, rgba(var(--pink-rgb), 0.16), rgba(var(--accent-rgb), 0.12));
}
```

Kehyksen mitat säilyvät, mutta tekninen placeholder ei näy. Lisää reduced-motion-tilassa siirtymän poisto.

- [ ] **Step 5: Aja testit ja syntaksitarkistus**

Run: `node --test tests/site-static.test.mjs && node --check assets/site.js`

Expected: PASS ja JavaScript-syntaksivirheitä ei löydy.

- [ ] **Step 6: Commitoi latausstrategia**

```bash
git add index.html palvelut.html tapahtumia.html kirjat.html yhteystiedot.html assets/site.js assets/styles.css tests/site-static.test.mjs
git commit -m "fix: prevent placeholder image flash"
```

## Task 3: Yhtenäistä eyebrow-otsikot ja painikelinkit, poista sosiaalinen osio

**Files:**
- Modify: `index.html`, `palvelut.html`, `tapahtumia.html`, `kirjat.html`, `yhteystiedot.html`
- Modify: `assets/site.js`
- Modify: `assets/styles.css`
- Test: `tests/site-static.test.mjs`

**Interfaces:**
- Consumes: existing `.button`, `markActiveNav`, `createFooterLinks`, `renderTapahtumia`.
- Produces: all actual eyebrow headings have unique IDs and `data-edit-label`; footer and nav anchors use shared button classes; Tapahtumia contains no social wall or embed render path.

- [ ] **Step 1: Kirjoita epäonnistuvat rakennetestit**

Lisää testit, jotka tarkistavat jokaisen HTML-sivun `.eyebrow`-elementtien ID:t ja `data-edit-label`-attribuutit, Tapahtumia-sivun sosiaali-section puuttumisen sekä `site.js`-tiedoston footer-linkin `button`-luokan.

- [ ] **Step 2: Muuta eyebrow-markup**

Anna esimerkiksi seuraaville yksilöivät ID:t: `home-intro-kicker`, `home-gallery-kicker`, `palvelut-hero-kicker`, `tapahtumia-upcoming-kicker`, `tapahtumia-past-kicker`, `kirjat-order-kicker`, `yhteystiedot-contact-kicker`, `yhteystiedot-inquiry-kicker`. Lisää jokaiselle `editable-target` ja suomenkielinen `data-edit-label`; pidä `text()`-rekisteröinti JavaScriptissä dynaamisten arvojen varmistamiseksi.

- [ ] **Step 3: Poista Tapahtumia-sivun social wall**

Poista `tapahtumia.html`-tiedostosta social-wall-section. Poista `renderTapahtumia`-funktion social-title/social-note/social-embeds-käsittely sekä käyttämättömät social embed -renderöintikutsut. Älä poista `content/site.json`-tiedoston sosiaalilinkkejä tässä tehtävässä.

- [ ] **Step 4: Yhtenäistä linkkien luokat**

Anna staattisille navbar-linkeille `button button--nav`, aktiiviselle linkille `aria-current="page"`. Anna `createFooterLinks`-funktiossa luoduille linkeille `button button--nav button--footer`. Säädä CSS niin, että molemmat käyttävät `.button`-gradienttia, pyöristystä, hoveria ja fokusta, mutta navigointiin sopivaa pienempää paddingia.

- [ ] **Step 5: Aja rakennetestit**

Run: `node --test tests/site-static.test.mjs`

Expected: PASS; Tapahtumia-sivun social wall -testi ei löydä poistettua osiota ja kaikilla eyebrow-otsikoilla on muokkausmetadata.

- [ ] **Step 6: Commitoi yhteiset käyttöliittymäkorjaukset**

```bash
git add index.html palvelut.html tapahtumia.html kirjat.html yhteystiedot.html assets/site.js assets/styles.css tests/site-static.test.mjs
git commit -m "feat: unify navigation and editable eyebrow headings"
```

## Task 4: Korjaa Facebook-media ja tee media-itemin fallback turvalliseksi

**Files:**
- Modify: `assets/site.js`
- Modify: `assets/styles.css`
- Modify: `tests/site-static.test.mjs`

**Interfaces:**
- Consumes: `createMediaItem(item, meta)` and existing media fields `type`, `videoUrl`, `image`, `link`.
- Produces: direct video URLs render as `<video>`; social URLs render as a poster/link card; no social URL is assigned to a video `src`.

- [ ] **Step 1: Lisää media-regressiotestit**

Testaa source-tasolla, että `site.js` sisältää erillisen suoran videolähteen tunnistuksen, sosiaalisen linkin fallbackin ja `noopener`-suhteen. Lisää JSON-fixturesta tarkistus, että nykyinen Facebook Reel säilyy linkkinä eikä `videoUrl`-kenttänä.

- [ ] **Step 2: Lisää URL-tunnistus ja media-linkkikortti**

Toteuta yksi apufunktio, joka hyväksyy suoraksi videolähteeksi vain HTTP(S)-osoitteet, joiden polku päättyy tuettuun videotiedostopäätteeseen kuten `.mp4`, `.webm` tai `.mov`. Facebook-, Instagram- ja muut ei-tiedostolinkit eivät saa päätyä `<video src>`-elementtiin.

Kun `item.type === "video"` ja `videoUrl` ei ole suora videotiedosto, renderöi kuvan tai gradienttifallbackin päälle linkki `Avaa video Facebookissa`/`Avaa julkaisu`, joka avautuu uudessa välilehdessä `target="_blank"` ja `rel="noopener noreferrer"`.

- [ ] **Step 3: Päivitä editorin ohjeet**

Muuta media-editorin kenttäohjeet erottamaan suora videotiedosto ja julkaisuosoite. Säilytä nykyinen `link`-kenttä julkaisulinkille, jotta nykyinen sisältö toimii ilman migraatiota.

- [ ] **Step 4: Aja media- ja syntaksitestit**

Run: `node --test tests/site-static.test.mjs && node --check assets/site.js`

Expected: PASS; Facebook Reel ei muodosta video-src-polkuun päätyvää toteutusta.

- [ ] **Step 5: Commitoi media-korjaus**

```bash
git add assets/site.js assets/styles.css tests/site-static.test.mjs
git commit -m "fix: handle social media video links safely"
```

## Task 5: Lisää kuvakehysten asemointi ja muokkaustilan liukusäätimet

**Files:**
- Modify: `assets/site.js`
- Modify: `assets/styles.css`
- Modify: `index.html`, `palvelut.html`, `tapahtumia.html`, `kirjat.html`, `yhteystiedot.html`
- Modify: `tests/site-static.test.mjs`

**Interfaces:**
- Consumes: image values and metadata from all current renderers plus the editor’s `showModal`/`openObjectEditor` flow.
- Produces: `getImageSettings(value)`, `normalizeImageSettings(value)`, `applyImageSettings(image, value)`, and range fields `imageScale`, `imagePositionX`, `imagePositionY` used consistently by all image editors.

- [ ] **Step 1: Lisää kuvasäätöjen testit**

Lisää Node-testeihin staattiset tarkistukset, että JS sisältää oletusarvot ja rajat, kaikki kuvarenderöijät kutsuvat yhteistä kuvasäätöjen apua, ja range-kentät käyttävät alueita `80..180` sekä `0..100`.

- [ ] **Step 2: Toteuta normalisointi ja CSS-muuttujat**

Lisää seuraavan rajapinnan mukaiset funktiot:

```js
const IMAGE_DEFAULTS = { imageScale: 100, imagePositionX: 50, imagePositionY: 50 };

const normalizeImageSettings = (value = {}) => ({
  imageScale: clamp(Number(value.imageScale) || IMAGE_DEFAULTS.imageScale, 80, 180),
  imagePositionX: clamp(Number(value.imagePositionX) || IMAGE_DEFAULTS.imagePositionX, 0, 100),
  imagePositionY: clamp(Number(value.imagePositionY) || IMAGE_DEFAULTS.imagePositionY, 0, 100),
});

const applyImageSettings = (image, value) => {
  const settings = normalizeImageSettings(value);
  image.style.setProperty("--image-scale", String(settings.imageScale / 100));
  image.style.setProperty("--image-position-x", `${settings.imagePositionX}%`);
  image.style.setProperty("--image-position-y", `${settings.imagePositionY}%`);
};
```

Käytä asetuksia hero-, page-hero-, gallery-, course-, book-, media- ja form-kuvissa. Kuvakehys on `overflow: hidden`; kuva käyttää `object-position`-arvoa ja transform-originia niin, ettei skaalattu sisältö vuoda ulos.

- [ ] **Step 3: Laajenna editori range-kentillä**

Laajenna `showModal` käsittelemään `field.type === "range"` luomalla `input[type=range]` ja sen vieressä arvoelementti. Muunna range-arvot numeroiksi submit-vaiheessa. Palauta `showModal`-funktiosta `{ overlay, refs }`, jotta kuvaeditori voi sitoa input-tapahtumat esikatseluun.

Kuvaeditorin kentät ovat:

```js
{ name: "imageScale", label: "Kuvan koko", type: "range", min: 80, max: 180, step: 1, value: 100 },
{ name: "imagePositionX", label: "Kuvan sijainti vaakasuunnassa", type: "range", min: 0, max: 100, step: 1, value: 50 },
{ name: "imagePositionY", label: "Kuvan sijainti pystysuunnassa", type: "range", min: 0, max: 100, step: 1, value: 50 },
```

Kytke kaikkiin kuvaeditorin tyyppeihin sama esikatselun synkronointi, jotta muutokset näkyvät heti ennen tallennusta. Tallenna arvot kuvan sisältöobjektiin vasta submitissä.

- [ ] **Step 4: Yhtenäistä kuvan kehysmarkup ja CSS**

Lisää staattisten kuvien ympärille `.image-frame`-wrapperit tarvittaessa ja käytä samaa wrapperia dynaamisissa kuvakorteissa. Pienennä `.photo-frame`-kehyksen max-leveys lomakepalstan sisällä, säilytä pyöristetyt reunat ja käytä `object-fit: cover` vain kehyksissä, joiden tarkoitus on rajata kuvaa; kirjankansissa pidä `contain`.

- [ ] **Step 5: Aja editori- ja kuvarakennetestit**

Run: `node --test tests/site-static.test.mjs && node --check assets/site.js`

Expected: PASS; kaikki kuvarenderöijät käyttävät yhteisiä asetuksia ja editorin range-rajat ovat speksin mukaiset.

- [ ] **Step 6: Commitoi kuvaeditori**

```bash
git add index.html palvelut.html tapahtumia.html kirjat.html yhteystiedot.html assets/site.js assets/styles.css tests/site-static.test.mjs
git commit -m "feat: add image positioning controls to edit mode"
```

## Task 6: SEO- ja saavutettavuustarkistukset sekä visuaalinen QA

**Files:**
- Modify: `tests/site-static.test.mjs`
- Modify: `assets/site.js` or HTML metadata only if a verified defect is found.

**Interfaces:**
- Consumes: all completed page and renderer changes.
- Produces: fresh evidence that the requested behavior works and a short report of remaining content decisions.

- [ ] **Step 1: Lisää SEO-regressiotestit**

Tarkista jokaiselta sivulta yksilöllinen `title`, `description`, canonical, `og:title`, `og:description`, yksi H1, `lang="fi"`, sekä robots/sitemap-tiedostojen olemassaolo. Tarkista myös, että `tapahtumia.html` ei sisällä poistettua social wallia.

- [ ] **Step 2: Aja koko automaattinen tarkistus**

Run: `node --test tests/site-static.test.mjs && node --check assets/site.js && git diff --check`

Expected: kaikki testit PASS, JavaScript syntaktisesti validia, eikä whitespace-virheitä.

- [ ] **Step 3: Käynnistä paikallinen HTTP-palvelin visual QA:ta varten**

Run: `python3 -m http.server 4173`

Tarkista selaimessa jokainen sivu desktop- ja mobiilileveydellä: ensiruutu ilman placeholder-välähdystä, hero-kuvan lataus, footer/nav-painikkeet, Tapahtumia-media ja Kirjat/Yhteystiedot-kehykset.

- [ ] **Step 4: Tarkista muokkaustila käsin**

Kirjaudu muokkaustilaan ja avaa vähintään yksi editori kustakin kuvaryhmästä. Liikuta kokoa sekä X/Y-sijaintia, varmista esikatselun live-päivitys, tallenna, renderöi sivu uudelleen ja varmista arvon säilyminen. Tarkista myös näppäimistöllä tab/focus-polku.

- [ ] **Step 5: Raportoi päätöstä vaativat lisäasiat**

Raportoi muuttamatta: nykyiset placeholder-tapahtumat, raakatekstinä näkyvät URL-osoitteet tapahtumakorteissa, mahdollinen content.json:n käyttämätön `tapahtumia.social`-objekti sekä käyttäjän ennestään tekemä fonttikokomuutos `assets/styles.css`-tiedostossa.

- [ ] **Step 6: Commitoi testit ja mahdolliset vain varmennetut SEO-korjaukset**

```bash
git add tests/site-static.test.mjs assets/site.js index.html palvelut.html tapahtumia.html kirjat.html yhteystiedot.html assets/styles.css
git commit -m "test: verify site SEO and visual regressions"
```

## Plan Self-Review

- Spec coverage: Tasks 2-6 cover image loading, buttons/footer, social removal, Facebook media, image editor settings, eyebrow metadata, form-image styling, SEO and reporting.
- Placeholder scan: no open implementation placeholders are used; all deferred content items are explicitly reported as user decisions.
- Interface consistency: `normalizeImageSettings` and `applyImageSettings` are the shared image APIs; range field names and bounds are identical across editors.
- User-owned changes: no task restores or overwrites the pre-existing `assets/styles.css` edits.
