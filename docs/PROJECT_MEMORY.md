# Marjo Seki -sivuston projektimuisti

Päivitetty 18.8.2026. Tämä tiedosto on nopea jatkomuisti seuraavaa työskentelykertaa varten.

## Nykytila

- Sivusto on staattinen HTML/CSS/JavaScript-sivusto, jonka sisältö tulee tiedostosta `content/site.json`.
- Vercel-projekti on linkitetty tähän repositorioon ja `main`-haaraan.
- Viimeisin paikallinen työ tehtiin haarassa `vercel/install-and-configure-vercel-w-fm5ate`, joka seuraa etähaaraa `origin/codex/install-vercel-analytics`.
- Vercel Analytics -muutos on PR:ssä https://github.com/LeoSuzu/marjoseki_site/pull/6.
- Etähaara `vercel/install-and-configure-vercel-w-fm5ate` oli olemassa ja osoitti vanhaan/draft-historiaan, joten sitä ei ylikirjoitettu.

## Agenttien toimintatapa

- Normaali projektikäytäntö: käytä paikallista Ollama-fleettiä mahdollisimman paljon, kun tehtävässä on rinnakkaisia tutkimus-, toteutus-, debuggaus-, review- tai varmennuspolkuja.
- Pääassistentti toimii tarkastajana ja valvojana: koordinoi agentteja, vertailee havaintoja, tarkistaa diffit ja varmistaa testit/komennot itse ennen valmiiksi ilmoittamista.
- Suora yksin tehtävä työ on ok vain pienissä yhden komennon tehtävissä, kiireellisissä yksinkertaisissa muutoksissa tai kun Leo tekee erikseen poikkeuksen.
- Tämä koskee sekä Codex- että Claude-tiimin agentteja.

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
- Lisätty `CLAUDE.md`- ja `AGENTS.md`-ohjeisiin Ollama-fleetin käyttö normaaliksi toimintatavaksi.
- Lisätty Vercel Web Analytics staattisiin HTML-sivuihin ja asennettu `@vercel/analytics`; muutos on erillisessä PR:ssä #6.

## Varmistetut tarkistukset

Seuraavat komennot menivät viimeksi läpi:

```bash
node --test tests/site-static.test.mjs
node --check assets/site.js
git diff --check
```

Testejä on 15 ja kaikki läpäisivät.

Vercel Analytics -muutoksen yhteydessä 18.8.2026 läpi meni:

```bash
node --test tests/site-static.test.mjs
git diff --cached --check
```

Testejä on nyt 25 ja kaikki läpäisivät.

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
