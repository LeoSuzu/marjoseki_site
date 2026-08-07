# Marjo Seki -sivuston projektimuisti

Päivitetty 7.8.2026. Tämä tiedosto on nopea jatkomuisti seuraavaa työskentelykertaa varten.

## Nykytila

- Sivusto on staattinen HTML/CSS/JavaScript-sivusto, jonka sisältö tulee tiedostosta `content/site.json`.
- Vercel-projekti on linkitetty tähän repositorioon ja `main`-haaraan.
- Viimeisin julkaistu commit on `f445635 feat: add editable image framing controls`.
- Commit on pushattu GitHubin `origin/main`-haaraan. Vercelin pitäisi rakentaa siitä automaattinen deploy.
- Työpuu oli tämän muistion alussa puhdas.

## Toteutetut muutokset

- Poistettu Tapahtumia-sivun erillinen sosiaalisen median osuus ja sen linkki-ikkunat.
- Yhtenäistetty navbarin ja footerin linkit etusivun painiketyylin kanssa.
- Korjattu Facebook- ja muiden sosiaalisen median julkaisulinkkien käsittely: niitä ei enää yritetä ladata HTML5-videoina.
- Lisätty kaikille kuvaeditoreille kuvan koon sekä X- ja Y-sijainnin säätimet.
- Yhtenäistetty eyebrow-otsikot muokattaviksi `editable-target`-rakenteella.
- Pienennetty ja pyöristetty Kirjat- ja Yhteystiedot-sivujen lomakekuvien kehykset.
- Estetty teknisen placeholder-kuvan välähtäminen latauksen alussa: hero-kuva priorisoidaan ja muut kuvat lazy-loadataan.
- Säilytetty käyttäjän fonttikokomuutos commitissa `71adaf4`.
- Lisätty staattiset regressiotestit tiedostoon `tests/site-static.test.mjs`.
- SEO:n tekniset perusasiat on tarkistettu: kielimääritys, yksilölliset title- ja description-metat, canonicalit, Open Graph -metat, sitemap/robots sekä JSON-LD-rakenteet.

## Varmistetut tarkistukset

Seuraavat komennot menivät viimeksi läpi:

```bash
node --test tests/site-static.test.mjs
node --check assets/site.js
git diff --check
```

Testejä on 15 ja kaikki läpäisivät.

## Vercel ja ympäristömuuttujat

Vercel tarvitsee tuotantoon `.env.example`-tiedostossa nimetyt muuttujat. Arvoja ei saa commitoida:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `RESEND_API_KEY`
- `CONTACT_EMAIL`
- `FROM_EMAIL`
- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `GITHUB_BRANCH`

Jos sivusto ei deployn jälkeen toimi, tarkista ensin Vercelin deployment-lokit ja näiden muuttujien tuotantoympäristö.

## Kun projektiin palataan

1. Aja `git pull --ff-only` ennen muokkauksia.
2. Tarkista nykytila komennolla `git status -sb`.
3. Aja testit ennen ja jälkeen muutosten.
4. Sisältömuutokset tehdään ensisijaisesti muokkaustilan kautta tai `content/site.json`-tiedostossa.
5. Älä poista vanhoja sosiaalikenttiä tai placeholder-sisältöjä ilman omistajan erillistä päätöstä.

## Odottavat päätökset

Seuraavat asiat jätettiin tarkoituksella tekemättä:

- Placeholder-tapahtumien ja vanhojen käyttämättömien sosiaalikenttien sisällöllinen siivous.
- Mahdolliset uudet teksti-, kuva- tai brändisisällöt.
- Sivuston lopullinen visuaalinen tarkistus eri selaimilla ja mobiililaitteilla.

Näistä päätetään vasta, kun sivusto on tarkistettu käytännössä.

