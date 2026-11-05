# Arbeidshåndbok (offline-app)

Et oppslagsverk for nyansatte som fungerer på PC og Android, også uten nett.
Når enheten er på nett, henter appen nye og endrede artikler automatisk.

## Slik fungerer det

- Appen er en PWA (nettapp som kan installeres). Første gang den åpnes med nett, lagres alt på enheten.
- Etter det åpnes den uten nett. Søk, kategorier, favoritter og artikler fungerer som vanlig.
- Når enheten er på nett (ved oppstart, hvert 30. minutt, når nettet kommer tilbake, eller via «Sjekk etter oppdateringer»), leses `content/articles.json` på nytt. Er noe endret, lagres det og brukeren får beskjed.
- Nye og endrede artikler får merket «Ny» eller «Oppdatert».

## Slik legger du til og endrer artikler (editor)

Du trenger ikke kode. Åpne `editor.html` på samme adresse som håndboken, for eksempel `https://din-adresse/editor.html`. Siden er ikke lenket fra håndboken, så legg den gjerne som bokmerke.

1. **Ny artikkel:** trykk «+ Ny artikkel», fyll ut tittel, kategori, sammendrag og innhold. Bruk knappene over tekstfeltet til å lage overskrifter, lister, merknader, advarsler, tabeller og lenker til andre artikler. Forhåndsvisningen til høyre viser hvordan det blir.
2. **Endre eller slette:** bruk «Rediger», «Kopier» og «Slett» i listen. «Kopier» er en rask måte å lage en lignende artikkel på.
3. **Kategorier:** trykk «Kategorier» for å legge til, gi nytt navn, flytte opp/ned (bestemmer rekkefølgen på forsiden) eller slette tomme kategorier.
4. **Publisere:** endringene lagres først som et utkast i nettleseren din. Er editoren koblet til GitHub (se under), trykker du **«Publiser til GitHub»**, og endringene er ute i håndboken etter 1–2 minutter. Uten GitHub trykker du **«Last ned articles.json»** (eller «Lagre direkte til fil» i Chrome/Edge på PC), legger filen i mappen `content/` på webserveren og erstatter den gamle.
5. Editoren viser hva som er nytt, endret eller slettet siden forrige publisering. «Forkast endringer» tilbakestiller til det som er publisert.

Gode råd:
- Utkastet ligger bare i nettleseren du redigerer i. Bruk én nettleser, og publiser før du bytter maskin.
- Hvis flere redigerer, slår editoren sammen endringene når den åpnes: artikler andre har publisert beholdes, og dine egne endringer legges oppå. Redigerer to personer *samme artikkel*, vinner den som publiserer sist. Ved publisering via GitHub får du en advarsel hvis noen har publisert etter at du åpnet editoren.
- Ta gjerne en sikkerhetskopi av `articles.json` før du erstatter den.
- Editoren fungerer også uten nett. Du kan skrive artikler på farten og laste ned filen senere.

Editoren ordner selv `id`, «Oppdatert»-datoen, versjonsnummeret og at alle kategorier finnes. Hvis du vil rette direkte i filen, ser formatet slik ut:

```json
{
  "id": "unik-id-uten-mellomrom",
  "title": "Tittel",
  "category": "Må matche en av kategoriene øverst i filen",
  "summary": "Én setning som vises i oversikten.",
  "tags": ["søkeord", "synonymer"],
  "updated": "2026-11-04",
  "related": ["id-til-annen-artikkel"],
  "body": "Brødtekst med enkel formatering, se under."
}
```

### Formatering i innholdet

| Skriv | Resultat |
|---|---|
| `## Overskrift` | Overskrift |
| `1. Steg` | Nummerert liste |
| `- Punkt` | Punktliste |
| `**tekst**` | **Fet** |
| `> Tekst` | Merknad |
| `> ! Tekst` | Advarsel (oransje) |
| `\| A \| B \|` | Tabell |
| `[tekst](#/artikkel/id)` | Lenke til annen artikkel |
| `[tekst](https://…)` | Ekstern lenke |

## Publisering med ett klikk via GitHub Pages

> **Viktig om personvern:** GitHub Pages på gratis konto krever et **offentlig** repo. Alle som kjenner adressen kan da lese håndboken, og innholdet i repoet er offentlig. Legg ikke inn interne eller fortrolige opplysninger (telefonnumre, interne rutiner, kundeinformasjon) uten å ha tenkt gjennom dette. Trenger dere lukket tilgang, kan dere bruke Netlify eller Cloudflare Pages med innlogging, en intern server, eller GitHub med betalt plan som støtter private sider.

**Engangsoppsett**
1. Lag en gratis konto på github.com og opprett et nytt repo (for eksempel `handbok`, offentlig).
2. Pakk ut zip-filen. På repoets side: **Add file → Upload files**. Dra inn *innholdet* i mappen `handbok` (filene og mappene `content` og `icons`), ikke selve zip-filen, og trykk **Commit changes**.
3. Gå til **Settings → Pages**. Velg **Deploy from a branch**, gren `main` og mappe `/ (root)`, og trykk Save. Etter noen minutter vises adressen, for eksempel `https://firma.github.io/handbok/`.
4. Åpne `https://…/editor.html`, trykk **«Koble til GitHub»** og følg veiledningen på siden. Du lager en tilgangsnøkkel som bare gir tilgang til dette ene repoet. Navnet på bruker og repo fylles ut automatisk.
5. Trykk **«Test og lagre»**. Fra nå av er det bare «Publiser til GitHub».

**Tilgangsnøkkelen**
- Lag en nøkkel (fine-grained token) som bare har tilgang til håndbok-repoet og rettigheten *Contents: Read and write*. Ikke bruk en nøkkel med bredere tilgang.
- Nøkkelen lagres bare i nettleseren på maskinen du redigerer på. Fjern haken for «Husk nøkkelen» hvis du ikke vil at den skal bli liggende.
- Alle på samme GitHub-konto deler nettleserlagring på `brukernavn.github.io`. Ligger det andre nettsider du ikke stoler på under samme konto, bør du ikke huske nøkkelen. Bruk da en egen organisasjon eller et eget tilpasset domene for håndboken.
- Nøkler har utløpsdato. Får du melding om at GitHub avviser nøkkelen, lag en ny under «GitHub» i editoren.
- «Fjern tilkobling» sletter nøkkelen fra nettleseren. Trekk den også tilbake på GitHub (Settings → Developer settings) hvis maskinen byttes eller nøkkelen har kommet på avveie.

**Slik virker publiseringen:** editoren leser siste versjon av `content/articles.json` rett fra GitHub (ikke fra nettsiden, som kan henge 1–2 minutter etter), og lagrer en ny versjon der når du publiserer. Hver publisering blir en egen versjon i repoets historikk, så du kan alltid gå tilbake til en tidligere versjon på GitHub (**History** på filen).

## Publisere appen (viktig)

Offline-funksjonen krever at siden vises over **HTTPS** (eller `localhost` under testing).
Hele mappen må legges på en webserver. Alternativer:

- Intranett eller intern webserver med HTTPS.
- GitHub Pages, Netlify, Cloudflare Pages eller Azure Static Web Apps (gratis for statiske sider).
- SharePoint fungerer vanligvis dårlig for dette, siden den ikke gir riktig støtte for service workers.

Hvis håndboken skal være lukket for utenforstående, bruk en løsning med innlogging foran (for eksempel Netlify/Cloudflare Access eller intern server).

## Installere

- **Android (Chrome):** åpne adressen, velg «Installer som app» nederst, eller menyen ⋮ → «Legg til på startskjermen».
- **PC (Chrome/Edge):** trykk installeringsikonet i adressefeltet, eller «Installer som app» nederst.
- **iPhone/iPad (Safari):** Del → «Legg til på Hjemskjerm».

## Teste lokalt

```bash
cd handbok
python3 -m http.server 8080
```
Åpne `http://localhost:8080`. Slå av nettet i utviklerverktøyene (Network → Offline) og last siden på nytt for å teste offline.

## Når du endrer selve appen

Endrer du `index.html`, `editor.html`, `style.css`, `editor.css`, `app.js`, `editor.js`, `md.js` eller ikoner, må du øke `VERSION` i `sw.js` (fra `v3` til `v4`, og så videre). Da henter alle enheter ny app neste gang de er på nett. Rene innholdsendringer krever ikke dette.

## Filer

| Fil | Innhold |
|---|---|
| `index.html`, `style.css`, `app.js`, `md.js` | Selve håndboken |
| `editor.html`, `editor.js`, `editor.css` | Redigeringsverktøyet |
| `sw.js` | Offline og hurtigbuffer |
| `manifest.webmanifest`, `icons/` | Installering og ikon |
| `content/articles.json` | Alle artiklene |
