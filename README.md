# Marjo Seki -kotisivu

Japanilais-henkinen (sakura, mänty/pine, momiji) 4-sivuinen kotisivu:

- `Home` — esittely + kuvia
- `Palvelut` — japanilaisen ruoan kurssit, kuvien kanssa
- `Tapahtumia` — tulevat/menneet tapahtumat + Facebook/Instagram-linkit
- `Yhteystiedot` — yhteystiedot

Sisältö on tiedostossa `content/site.json`. Sivu on staattinen (HTML/CSS/JS), eikä tarvitse tietokantaa.

## Muokkaustila ("Edit")

Etusivun ja muiden sivujen ylätunnisteessa on pieni huomaamaton kynä-painike (✎), ei
näkyvä "Edit Site" -linkki navigaatiossa — niin sivu ei näytä vierailijoille rekisteröitymislomakkeelta.

Painike avaa käyttäjänimi/salasana-kirjautumisen. Kirjautuminen tarkistetaan
palvelimella (Vercel-funktio `api/login.js`), ei selaimen JavaScriptissä, jotta
tunnukset eivät näy sivun lähdekoodissa.

Kun kirjautuminen onnistuu, sivu siirtyy muokkaustilaan: tekstejä ja kuvia voi
klikata suoraan sivulla. **Tärkeä rajoitus:** muutokset tallentuvat vain selaimen
omaan `localStorage`-muistiin (samalla koneella/selaimella). Pysyvää muutosta varten:

1. Tee muutokset, paina "Lataa varmuuskopio" (lataa `marjo-site-backup.json`).
2. Korvaa tiedoston sisällöllä `content/site.json` ja committaa/pushaa muutos GitHubiin.

Pysyvämpi, useammalla laitteella toimiva editointi: käytä Pages CMS -palvelua (ks. alla),
jolloin muutokset tallentuvat suoraan GitHub-repoon ilman tätä vaihetta.

## Ympäristömuuttujat (kirjautumisen salasana)

Kirjautumisen tunnukset eivät ole koodissa — ne luetaan ympäristömuuttujista, joita
selain ei koskaan näe:

- `ADMIN_USERNAME` — käyttäjänimi
- `ADMIN_PASSWORD` — salasana
- `SESSION_SECRET` — pitkä satunnainen merkkijono istunnon allekirjoitukseen (esim. `openssl rand -hex 32`)

Paikallista testausta varten: kopioi `.env.example` nimelle `.env` ja täytä arvot.
**`.env`-tiedostoa ei koskaan committata** (se on `.gitignore`-listalla).

Vercelissä: Project Settings → Environment Variables → lisää samat kolme muuttujaa.

## Testaaminen paikallisesti

### Vaihtoehto 1: Vercel CLI (suositus — kirjautuminen toimii)

```bash
npm install -g vercel
cp .env.example .env   # täytä oikeat arvot tiedostoon
vercel dev
```

Avaa selaimessa osoite, jonka `vercel dev` tulostaa (oletuksena `http://localhost:3000`).
Tämä ajaa myös `/api`-kansion funktiot, joten kynä-painikkeella kirjautuminen toimii.

### Vaihtoehto 2: tavallinen staattinen palvelin (vain ulkoasun katselu)

```bash
python3 -m http.server 8080
```

Avaa `http://localhost:8080`. Sivu latautuu ja näyttää oikein, mutta kirjautuminen
epäonnistuu hallitusti ("kirjautumispalvelu ei käytössä"), koska `/api`-funktiot
tarvitsevat Vercelin (tai `vercel dev`).

### Vaihtoehto 3: Docker (vain ulkoasun katselu, ei kirjautumista)

```bash
docker compose up --build
```

Avaa `http://localhost:8080`.

## Mitä testata ennen julkaisua

1. Kaikki 4 sivua avautuvat ja navigaatio toimii (Home, Palvelut, Tapahtumia, Yhteystiedot).
2. `vercel dev` käynnissä: kynäpainike avaa kirjautumisen, oikeilla tunnuksilla kirjautuminen
   onnistuu ja muokkaustila tulee näkyviin; väärällä salasanalla näkyy virheilmoitus.
3. Muokkaustilassa: tekstin/kuvan klikkaus avaa muokkausikkunan, tallennus näkyy sivulla.
4. "Lataa varmuuskopio" lataa toimivan JSON-tiedoston.
5. "Kirjaudu ulos" poistaa muokkaustilan ja uudelleenlataus pysyy uloskirjautuneena.
6. Facebook/Instagram-painikkeet Tapahtumia-sivulla avautuvat oikeisiin osoitteisiin.
7. Mobiililaajuudessa (selaimen kaventaminen) valikko muuttuu pudotusvalikoksi.

## Julkaisu Verceliin

1. Pushaa repo GitHubiin (`git push`).
2. Vercel.com → New Project → tuo GitHub-repo `marjoseki_site`.
3. Framework Preset: "Other" (staattinen sivusto + `/api`-funktiot, Vercel tunnistaa automaattisesti).
4. Lisää ympäristömuuttujat (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`) Project Settings → Environment Variables.
5. Deploy. Vercel antaa osoitteen `https://<projekti>.vercel.app` — voit liittää oman domainin myöhemmin.
6. Testaa tuotannossa: avaa sivu, kokeile kynäpainikkeen kirjautumista oikeilla tunnuksilla.

## Vaihtoehto: Pages CMS pysyvään, moninlaitteiseen editointiin

Jos haluat, että Marjo voi muokata sisältöä eri laitteilla niin, että muutokset
tallentuvat suoraan repoon (ei vain yhteen selaimeen):

1. Avaa `https://app.pagescms.org`.
2. Kirjaudu repon omistajan GitHub-tunnuksella.
3. Asenna Pages CMS GitHub App repolle.
4. Konfiguraatio on jo valmiina tiedostossa `.pages.yml`.
5. Kutsu Marjo mukaan sähköpostilla — hän voi editoida ilman omaa GitHub-tunnusta.

Tämä on erillinen, vaihtoehtoinen reitti — se ei liity kynäpainikkeen kirjautumiseen.

## Tiedostot, joita muokkaat useimmin

- `content/site.json` — kaikki tekstit, kuvat, kurssit, tapahtumat
- `assets/uploads/` — kuvat (korvaa placeholder-tiedostot oikeilla kuvilla)
- `assets/styles.css` — ulkoasu
- `.env` (paikallisesti) / Vercelin Environment Variables (tuotannossa) — kirjautumistunnukset
