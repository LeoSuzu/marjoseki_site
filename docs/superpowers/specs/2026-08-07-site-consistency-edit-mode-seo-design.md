# Marjo Seki -sivuston yhtenäisyys, muokkaustila ja SEO

## Tavoite

Yhtenäistää sivuston painikkeet, eyebrow-otsikot ja kuvatyylit, poistaa Tapahtumia-sivulta päällekkäinen sosiaalisen median osio, korjata Facebook-videolinkkien käsittely sekä tehdä kaikkien kuvakehysten kuvien koon ja sijainnin säätäminen mahdolliseksi muokkaustilassa. Samalla tehdään turvallinen SEO-tarkastus ja korjataan selkeät tekniset puutteet.

## Nykytila ja juurisyy

- Tapahtumia-sivulla on erillinen sosiaalisen median osio, vaikka samat Facebook- ja Instagram-linkit renderöidään footerissa.
- Navbarin ja footerin linkit käyttävät omia CSS-tyylejään, kun etusivun pääpainike käyttää `.button`-komponenttia.
- Media-renderöinti yrittää käyttää `videoUrl`-arvoa aina HTML5-videon lähteenä. Facebook Reel -osoite ei ole videotiedosto, joten se ei voi toimia `<video src>` -lähteenä.
- Kuvien muokkaus tallentaa nykyisin vain kuvatiedoston ja alt-tekstin. Kuvan asemointi ja mittakaava puuttuvat datamallista ja käyttöliittymästä.
- Osa eyebrow-otsikoista on staattisia `<p class="eyebrow">`-elementtejä ilman yksilöivää ID:tä ja muokkausmetaa.
- Kirjat- ja Yhteystiedot-sivujen lomakekuvien `.photo-frame` poikkeaa muiden kuvakehysten mittasuhteista.

## Suunniteltu ratkaisu

### 1. Tapahtumia ja sosiaaliset linkit

Poistetaan `tapahtumia.html`-sivulta sosiaalisen median accent-osio sekä sen dynaaminen renderöinti ja muokkauskäsittely. Footerin sisältö säilyy `content/site.json`-tiedostossa ja toimii ainoana sivuston yhteisenä sosiaalisten linkkien paikkana. Sosiaalista dataa ei poisteta heti JSON:sta, jotta olemassa olevat luonnokset ja julkaisut eivät rikkoudu; käyttämätön osio voidaan siivota myöhemmin erillisellä päätöksellä.

### 2. Yhteinen painiketyyli

Navbarin ja footerin linkit saavat saman visuaalisen perustyylin kuin etusivun `.button`-painike. Linkeille tehdään pieni, navigointiin sopiva kokovariaatio, mutta sama gradientti, pyöristys, hover-tila, fokuskorostus ja värijärjestelmä säilyvät. Aktiivinen navigointilinkki erotetaan edelleen saavutettavasti `aria-current="page"`-attribuutilla tai vastaavalla aktiivisella tilalla.

### 3. Media-linkit

Media-item tunnistaa suoran videotiedoston erillään sosiaalisen median julkaisulinkistä:

- suora `http(s)`-videotiedosto renderöidään nykyiseen äänettömään `<video>`-soittimeen;
- Facebook-, Instagram- ja muut sosiaalisen median julkaisulinkit renderöidään esikatselukuvan kanssa ulkoiseksi avauslinkiksi;
- rikkinäistä Facebook-osoitetta ei aseteta `<video src>`-attribuutiksi;
- editorin ohjeteksti kertoo selvästi, kumpaan kenttään suora videotiedosto ja kumpaan sosiaalisen median julkaisuosoite kuuluu.

Jos media-itemillä ei ole kuvaa mutta sillä on julkaisuosoite, käyttöliittymä näyttää vähintään selkeän linkkikortin eikä tyhjää kehystä.

### 4. Kuvan mittakaava ja sijainti

Kaikille kuvalähteille otetaan käyttöön yhtenäinen esitysmuoto:

- `imageScale`: prosentti, oletus `100`, sallittu alue `80-180`;
- `imagePositionX`: prosentti, oletus `50`, sallittu alue `0-100`;
- `imagePositionY`: prosentti, oletus `50`, sallittu alue `0-100`.

Säätimet näytetään jokaisessa muokkaustilan kuvaeditorissa liukusäätiminä sekä numeerisina arvoina. Kuvan esikatselu päivittyy säätämisen aikana. Kehys käyttää `overflow: hidden`-rajausta, `object-position`-sijaintia ja rajattua skaalausta niin, että kuvan ulkopuolinen osa ei vuoda kehyksen ulkopuolelle.

Ominaisuudet lisätään taaksepäin yhteensopivasti: vanha sisältö toimii ilman uusia kenttiä ja käyttää oletusarvoja. Käyttöön kuuluvat hero-kuvat, galleriakuvat, palvelukortit, kirjankannet, tapahtumamedia sekä Kirjat- ja Yhteystiedot-lomakekuvat.

### 5. Eyebrow-rakenne

Kaikki varsinaiset eyebrow-otsikot muutetaan samaan rakenteeseen:

```html
<p class="eyebrow editable-target" id="home-hero-kicker" data-edit-label="Muokkaa yläosan tunnuslausetta">Tervetuloa</p>
```

Jokaisella elementillä on sivukohtaisesti yksilöllinen ID ja suomenkielinen muokkauslabel. JavaScript rekisteröi saman metadatan myös dynaamisesti renderöidyille sisältöalueille. Headerin brändilause säilyy semanttisesti erillisenä brändielementtinä, mutta sen muokkaus toimii samalla editorin mekanismilla.

### 6. Lomakekuvien yhtenäistäminen

Kirjat- ja Yhteystiedot-sivujen `.photo-frame` pienennetään lomakepalstan sisällä hallituksi kuvakehykseksi, jossa on sama pyöristetty reuna, reunaviiva, varjo ja sisäinen kuvapinta kuin muissa sivuston kuvissa. Kehyksen mittasuhde pysyy responsiivisena, eikä kuvan luonnollista sisältöä leikata oletuksena.

### 7. SEO-tarkastus

Nykyiset vahvuudet säilytetään: kielimääritys, yksilölliset title- ja description-metat, canonical-osoitteet, Open Graph -metat, robots.txt, sitemap.xml, alt-tekstit, breadcrumb-rakenteet ja etusivun organisaatio-/henkilö-skeema.

Toteutetaan vain selkeät, vähäriskiset korjaukset:

- varmistetaan, että jokaisella sivulla on yksi selkeä H1 ja eyebrow-otsikot eivät korvaa otsikkohierarkiaa;
- poistetaan poistettavan sosiaalisen osion mahdollisesti turha näkyvä sisältö;
- pidetään event-skeema ajantasaisena vain tuleville tapahtumille;
- tarkistetaan rikkinäiset tai tyhjät media- ja linkkikentät;
- vältetään avainsanojen toistoa, piilotettua SEO-tekstiä, vanhentuneita tapahtumia ja turhia duplicate-sivuja.

Sisällöllisiä SEO-parannuksia, kuten placeholder-tapahtumien poistamista tai tekstien uudelleenkirjoittamista, ei tehdä ilman omistajan päätöstä.

### 8. Kuvien lataus ilman placeholder-välähdystä

Nykyinen placeholder poistetaan näkyvästä ensimmäisestä ruudusta latauksen ajaksi. Syy on se, että staattinen HTML näyttää placeholderin ennen kuin `content/site.json` ja mahdollinen selaimen luonnos on ehditty renderöidä.

Toteutetaan kaksitasoinen latausstrategia:

- sivun ylin hero-kuva asetetaan heti sisällön renderöinnin jälkeen `loading="eager"`-tilaan ja sille annetaan `fetchpriority="high"`, koska se on sivun todennäköinen LCP-kuva;
- kaikki hero-kuvan alapuoliset kuvat merkitään `loading="lazy"`-tilaan;
- staattiset placeholderit pidetään vain layout-varana ja piilotetaan latauksen aikana neutraalilla kehyksen taustalla;
- oikea kuva paljastetaan vasta sen `load`-/`decode`-tapahtuman jälkeen pehmeällä opacity-siirtymällä;
- jos kuva epäonnistuu lataamaan, placeholderia ei palauteta välähtävänä kuvana, vaan kehys näyttää hillityn neutraalin fallback-tilan;
- lataustila poistuu myös hallitusti virhetilanteessa, jotta sivu ei jää näkymättömäksi JavaScript- tai verkkovirheen vuoksi.

Näin käyttäjä näkee alussa sivuston värimaailmaan sopivan rauhallisen kuvakehyksen, ei teknistä placeholder-kuvaa. Ratkaisu vähentää samalla layout shift -riskiä, koska kehys säilyttää mitoituksensa ennen kuvan latautumista.

## Tiedonkulku

`content/site.json` -> `assets/site.js` renderöi sivun -> kuvaeditori lukee ja kirjoittaa kuva-asetukset samaan sisältödataan -> localStorage-/luonnostallennus -> julkaisu GitHubiin.

Kuvan esitysominaisuudet kulkevat renderöintiin meta-oliona. Editorin tallennus normalisoi arvot sallittuun alueeseen, joten käsin syötetty virheellinen arvo ei voi rikkoa CSS:ää tai renderöintiä.

## Virheenkäsittely

- Virheellinen tai puuttuva kuva käyttää nykyistä placeholder-kuvaa tai jättää vain turvallisen linkkikortin.
- Sosiaalisen median osoite avataan aina uudessa välilehdessä `noopener`-turvallisuusasetuksin.
- Editorin liukusäätimien arvot rajoitetaan sekä käyttöliittymässä että tallennuksen yhteydessä.
- Olemassa olevat sisältöobjektit ilman uusia kuva-asetuksia renderöidään oletusarvoilla.

## Testaus ja hyväksymiskriteerit

- Kaikki viisi HTML-sivua latautuvat ilman JavaScript-syntaksivirheitä.
- Tapahtumia-sivulla ei ole sosiaalisen median osiota eikä sen linkki-ikkunoita; footerissa Facebook, Instagram ja sähköposti toimivat.
- Navbarin ja footerin linkit käyttävät yhteistä painiketyyliä desktopilla ja mobiilissa, ja fokus näkyy näppäimistöllä.
- Facebook Reel ei päädy `<video src>`-lähteeksi; sen ulkoinen linkki toimii ja media-item ei ole tyhjä.
- Jokaisessa kuvakehyksessä editori näyttää koon ja X/Y-sijainnin säätimet, esikatselu päivittyy ja tallennettu arvo säilyy sivun uudelleenrenderöinnissä.
- Kirjat- ja Yhteystiedot-sivujen lomakekuvat ovat pienempiä, pyöristettyjä ja visuaalisesti samaa kuvajärjestelmää.
- Kaikilla eyebrow-otsikoilla on yksilöivä ID, `editable-target`-luokka ja `data-edit-label`.
- Ensimmäisessä ruudussa ei näy placeholder-kuvan välähdystä; hero-kuva latautuu etuoikeutettuna ja muut kuvat lazy-loadataan.
- JSON on validia, sitemap ja robots ovat ehjiä, eikä tarkistuksissa löydy tyhjiä H1-otsikoita tai rikkinäisiä paikallisia asset-polkuja.

## Rajaus ja myöhemmin päätettävät asiat

Placeholder-tapahtumien, tekstien ja mahdollisten vanhojen sosiaalikenttien sisällöllinen siivous jätetään tämän muutoksen ulkopuolelle. Ne raportoidaan toteutuksen lopussa päätöksiä varten.
