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

### Bilder

- I editoren: trykk **🖼 Bilde** i verktøylinjen, eller lim inn / dra et bilde inn i tekstfeltet. På mobil velger du fra galleriet eller tar et nytt bilde.
- Du blir bedt om en kort beskrivelse. Den vises under bildet og leses opp av skjermlesere.
- Bildene gjøres automatisk mindre (maks 1600 piksler, komprimert), så et mobilbilde på flere MB blir ofte under 300 kB. Skjermbilder (PNG) beholdes skarpe når de er små nok.
- Forhåndsvisningen viser bildet med en gang. Bildet publiseres sammen med artikkelen.
- **Med GitHub:** «Publiser» laster først opp bildene, deretter artikkelen. Bildene havner i `content/bilder/`.
- **Uten GitHub:** «Last ned oppdatering (.zip)» gir én zip med `articles.json` og bildene. Pakk den ut i håndbok-mappen på webserveren (så filene havner i `content/`) og la den overskrive eksisterende filer.
- Alle som bruker håndboken, får bildene lastet ned i bakgrunnen når de er på nett, slik at de også vises uten nett.
- Vil du fjerne et bilde fra en artikkel, sletter du linjen som starter med `![`. Selve bildefilen blir liggende i `content/bilder/` (du kan slette den på GitHub hvis du vil rydde).
- Formatet i teksten er `![Beskrivelse](bilder/navn.jpg)` på en egen linje.

### Hent inn en Word-fil

I redigeringen av en artikkel (eller med «📄 Ny fra Word» på oversikten) velger du en `.docx`-fil. Tekst, overskrifter, lister, tabeller, nettlenker, fet/kursiv og bilder legges inn i **Innhold**, så du kan rette det manuelt. Alt skjer i nettleseren din. Første toppoverskrift (eller Word-stilen «Tittel») brukes som artikkeltittel hvis tittelfeltet er tomt.

Begrensninger: bare `.docx` (lagre eldre `.doc` på nytt i Word), lister blir flate, bilder i tabeller og formatene EMF/WMF/SVG hoppes over, og tekstbokser, fotnoter og topp-/bunntekst tas ikke med. Se alltid over resultatet i forhåndsvisningen.

### Automatiske lenker mellom artikler

«✨ Lag lenker» leter i teksten etter titler og søkeord fra andre artikler og gjør første omtale av hver til en lenke (nye lenker utheves gult i forhåndsvisningen). Overskrifter, bilder og eksisterende lenker røres ikke. Vil du ikke ha en lenke, trykker du den lille **✕** ved siden av den i forhåndsvisningen, så blir den vanlig tekst igjen.

### Sammenligning med andre artikler

Når du henter inn en Word-fil sjekkes teksten automatisk mot de andre artiklene. Under tekstfeltet vises setninger som ligner på noe som allerede står i en annen artikkel (så du kan unngå å skrive det samme to steder), og forslag til relaterte artikler. Det samme kan du gjøre når som helst for tekst du har skrevet selv med **«🔍 Finn relaterte»**. «+ Se også» legger artikkelen til i «Se også»-listen. Sammenligningen er en enkel ordsammenligning, så vurder alltid forslagene selv.

### Klikkbare bilder (f.eks. en meny)

Legg først inn bildet. Trykk så **«🗺 Bilde med lenker»**, dra et rektangel over hver del av bildet som skal være klikkbar (med mus eller finger), og velg artikkelen den skal føre til. Trykk «Bruk». I håndboken kan leseren trykke på området, og under bildet vises også en vanlig liste med de samme lenkene. Under panseret legges dette på bildelinjen, f.eks. `![Meny](bilder/meny.jpg){lenker: vpn@5,10,30,40; ferie@40,10,30,40}` (venstre, topp, bredde, høyde i prosent), så du kan også rette det for hånd. Slettes en artikkel som et område peker til, skjules området i håndboken.

### «Se også»

Under hver artikkel kan du velge relaterte artikler. Med mange artikler bruker du søkefeltet over listen: du kan søke på tittel, kategori og søkeord. «Bare valgte» viser det du allerede har krysset av. Valg du har gjort, beholdes selv om de er skjult av søket.

## Godkjenning: alle kan skrive, hovedadmin godkjenner

Slik er det satt opp:

| Rolle | Kan | Nøkkel |
|---|---|---|
| **Hovedadmin** (du) | Publisere direkte, og se gjennom og godkjenne forslag fra andre | Nøkkel med skrivetilgang til håndbok-repoet (og innboksen) |
| **Redaktør** (alle andre) | Skrive, endre og slette artikler i eget utkast og **sende dem til godkjenning** | Nøkkel som bare har tilgang til innboks-repoet |
| Uten tilkobling | Skrive utkast og laste ned filen | Ingen |

Godkjenningen håndheves av GitHub, ikke bare av knappene i editoren: en redaktørnøkkel har ikke skrivetilgang til håndbok-repoet, så ingen kan publisere uten din nøkkel. Forslag ligger i et eget **privat** repo (innboksen) til du har godkjent dem.

**Engangsoppsett (hovedadmin)**
1. Sett opp publisering til GitHub Pages som beskrevet under (håndbok-repoet).
2. Lag et nytt **privat** repo for innboksen, for eksempel `handbok-innsendinger`. Huk av for «Add a README file».
3. Lag en nøkkel til deg selv med tilgang til **begge** repoene (Contents: Read and write). Koble til i editoren under **⚙ Tilkobling**: først «Hovedadmin», deretter «Innboks».
4. Lag en **egen** nøkkel til redaktørene med tilgang til **bare** innboks-repoet (Contents: Read and write). Vil du ha e-postvarsel når noen sender inn noe, gir du den også Issues: Read and write, slår på Issues i innboks-repoets innstillinger og følger repoet.
5. Under **⚙ Tilkobling → Inviter redaktører** limer du inn redaktørnøkkelen og får en invitasjonslenke. Editoren nekter å lage lenken hvis du limer inn din egen hovedadmin-nøkkel eller en nøkkel som kan skrive til håndboken.
6. Send lenken privat til redaktørene. Når de åpner den, kobles de til som redaktører med ett klikk. De trenger ikke GitHub-konto.

**Slik jobber redaktørene:** de skriver og endrer artikler som vanlig. Når de er ferdige, trykker de **«Send til godkjenning»**. De kan ikke lage nye kategorier. Under «Mine innsendinger» ser de om forslaget venter, er godkjent eller er avvist, og hva du skrev som begrunnelse.

**Slik godkjenner du:**
1. Åpne editoren. Knappen **«📥 Innboks»** viser hvor mange forslag som venter.
2. Trykk «Se gjennom». Du ser forslaget slik det blir i håndboken, og for endringer en fane «Endringer» som markerer hva som er lagt til og fjernet. Advarsler vises hvis artikkelen er endret siden forslaget ble laget, hvis en ny kategori opprettes, eller hvis noe er galt med bildene.
3. **Godkjenn** legger forslaget i utkastet ditt (nye bilder følger med). **Avvis** sender det tilbake med en begrunnelse.
4. Når du er fornøyd, trykker du **«Publiser til GitHub»** i oversikten. Først da kommer endringene ut. Forslagene markeres samtidig som godkjent, og varsel-issuene lukkes.

**Sikkerhet**
- Alt i innboksen behandles som upålitelig. Editoren kontrollerer id-er, feltlengder og bilder (må være ekte JPEG, PNG eller GIF, ikke SVG), og teksten vises aldri som kjørbar kode. Du ser alltid forslaget før noe godkjennes.
- Redaktørnøkkelen kan lese og endre alt i innboksen, men ingenting i håndbok-repoet. Verste utfall hvis den kommer på avveie, er at noen sender inn søppelforslag eller leser uferdige utkast. Trekk den da tilbake på GitHub og lag en ny.
- «Navn» på forslag skrives inn av redaktøren selv og er ikke verifisert. Vil du ha verifiserte navn, kan hver redaktør få sin egen nøkkel (egen GitHub-bruker med tilgang til innboks-repoet).
- Du som hovedadmin kan fortsatt redigere og publisere direkte uten godkjenning.
- Ligger håndboken i et offentlig repo, er publisert innhold offentlig. Innboksen er privat, så forslag er ikke synlige før du publiserer dem.

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

Endrer du `index.html`, `editor.html`, `style.css`, `editor.css`, `app.js`, `editor.js`, `godkjenning.js`, `imagemap.js`, `wordimport.js`, `autolenker.js`, `md.js` eller ikoner, må du øke `VERSION` i `sw.js` (fra `v9` til `v10`, og så videre). Da henter alle enheter ny app neste gang de er på nett. Rene innholdsendringer krever ikke dette.

## Filer

| Fil | Innhold |
|---|---|
| `index.html`, `style.css`, `app.js`, `md.js` | Selve håndboken |
| `editor.html`, `editor.js`, `editor.css` | Redigeringsverktøyet |
| `godkjenning.js` | Roller, innsending og godkjenning |
| `imagemap.js` | Tegne klikkbare områder på bilder |
| `wordimport.js` | Leser Word-filer (.docx) i nettleseren |
| `autolenker.js` | Finner og lager lenker til andre artikler |
| `sw.js` | Offline og hurtigbuffer |
| `manifest.webmanifest`, `icons/` | Installering og ikon |
| `content/articles.json` | Alle artiklene |
| `content/bilder/` | Bilder brukt i artiklene (opprettes når du legger inn det første bildet) |
