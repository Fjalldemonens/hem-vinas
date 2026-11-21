# Hem Vinäs – designbrief för en ny design

Den här filen är skriven för en AI-agent (eller designer) som ska ta fram ett **förslag på nytt utseende** för Hem Vinäs.

> **Viktigast av allt:** du gör **bara en mock** (en fristående prototyp med låtsasdata). Du ändrar **ingenting** i den riktiga appen – inte `index.html`, `homey.js`, `config.js`, `CLAUDE.md` eller något annat befintligt – och du rör aldrig den riktiga Homey. Den skarpa appen ändras bara av Claude, efter att användaren har godkänt designen. Se §8.
 Den beskriver vad appen gör, vilken data som finns, vilka ramar som gäller och vad användaren gillar. Läs den här först. Teknisk detalj finns i `CLAUDE.md`, och den nuvarande koden ligger i `index.html`.

Repo: https://github.com/Fjalldemonens/hem-vinas (publikt) · Live: https://fjalldemonens.github.io/hem-vinas/

---

## 1. Vad Hem Vinäs är

- En egen webbapp (PWA) för att se och styra hemmet i Vinäs, Mora, via en **Homey Pro (Early 2023)**. Ersätter Homey-, Tibber- och Roborock-apparna i vardagen.
- Användare: Ulf (tekniskt kunnig, elinstallatör i grunden) och hans fru. Läggs till på hemskärmen i iPhone.
- Används på **iPhone först**, men också iPad och dator. I familjens nya hus (byggs 2027) är tanken en **väggpanel** (iPad-typ) med samma app.
- Fyra vyer: **Ljus**, **Klimat**, **Energi** och **Städ**.
- Allt som syns i appen är på **svenska**.

## 2. Ramar som inte går att ändra

| Ram | Varför |
|---|---|
| En enda fil `index.html` med inbäddad CSS och JS, plus `homey.js` och `config.js` | Ingen byggprocess. GitHub Pages publicerar `main` direkt. |
| Inga bibliotek. Bara Google Fonts är tillåtet. | Användarens regel. Ikoner och diagram är egen SVG. |
| Ljust **och** mörkt läge (`prefers-color-scheme`), alla färger som CSS-variabler | Används dygnet runt. |
| Fungerar från 320 px till stor skärm (telefon, iPad, dator, väggpanel) | Se §1. |
| Data hämtas bara via `window.HomeyClient` (se §4) | Inloggning, token och lokalt/moln sköts där. |
| Inga hemligheter i repot | Repot är publikt. |
| Svensk text, svenska tal (`1 850 W`, `2,09 kr/kWh`, `−3,4°`) | Användarens krav. |
| `<meta name="app-version">` höjs vid varje ändring (även `?v=` på `config.js` och `homey.js`) | Appen visar då "Ny version av appen finns – Uppdatera nu". |

## 3. Så testar du utan Homey

`design/mock-homey.js` ger samma API och samma dataformat som `homey.js`, men med låtsasdata som liknar huset (lampor, givare, värmepumpar, elmätare, sol, batteri, laddbox, elbil, vitvaror, två robotar och alla AI-variabler).

Byt lokalt `<script src="homey.js?v=…">` mot `<script src="design/mock-homey.js">` och öppna `index.html` i en webbläsare. **Committa aldrig det bytet.** Ändringar du gör i appen (tänd lampa och så vidare) sparas i minnet tills sidan laddas om.

Skärmbilder av nuvarande design (390 px bred, med mock-data) finns i `design/screens/` för alla fyra vyerna, i ljust och mörkt läge.

## 4. Data: `window.HomeyClient`

| Funktion | Gör |
|---|---|
| `loggedIn()` / `login()` / `logout()` / `handleRedirect()` | Inloggning med Homey-konto. Inloggningsskärmen visas om `loggedIn()` är falskt. |
| `devices()` | Alla enheter (se format nedan). Appen hämtar var **15 s**. |
| `variables()` | Alla logikvariabler `[{id,name,type,value}]`. JSON-variabler är strängar som tolkas med `JSON.parse`. Appen hämtar var **2 min**. |
| `setCaps({ deviceId: { capability: värde } })` | Styr enheter, till exempel `onoff`, `dim`, `target_temperature`. |
| `setVariable(namn, värde)` | Skriver en variabel (används för städschema, termostater och solladdning). |
| `moods()` / `setMood(id)` | Homey-scener ("Natt", "Film"). |
| `where()` | `'lokalt'` eller `'via molnet'`, visas i statusknappen. |
| `image(url)` | Hämtar en enhetsbild (används inte just nu). |

**Enhet:**
`{ id, name, zone: "Hem > Bottenvåningen > Kök", type, available, state: { capability: värde }, caps: { capability: { title, type, setable, units, at, values: [{id,title}] | null } }, batteries: ["CR2477"], model }`

`at` är när värdet senast ändrades, i ms. Det används för att visa om något är gammalt eller har tappat kontakt.

**Appen hittar enheter efter roll, aldrig efter märke:**
- Lampor har typen `light`, med `onoff`, `dim` och ibland `light_hue`/`light_saturation`/`light_mode`/`light_temperature`.
- Elmätaren har `meter_power.imported`. Dess `measure_power` är husets effekt mot nätet, där minus betyder att huset säljer.
- Solceller har typen `solarpanel`, husbatteriet `battery`, laddboxen `evcharger`. Elbilen är en enhet med `charging_target_level` + `measure_battery`.
- Värme har typen `thermostat` (bergvärmepump, golvvärme, luftvärmepump). Badrummets element styrs via variabler (AI 16).
- Givare har `measure_temperature`/`measure_humidity`. Utegivaren har `measure_luminance` och "temp" i namnet.
- Vitvaror är `socket` (kyl, disk, tvätt). De får **aldrig** gå att stänga av från appen.
- Städrobotar har typen `vacuumcleaner`, med enum-capabilities för rum, läge, sugkraft, moppning och rutt.

**Variabler (JSON) som appen läser.** Formaten är låsta och får bara utökas. Fullständig tabell finns i `CLAUDE.md` under "Kontraktet Homey ↔ app".

| Variabel | Innehåll |
|---|---|
| AI Elpriser | Kvartspriser idag och imorgon: `days[].imp[]` = köppris (allt inräknat), `exp[]` = säljpris (spot), 96 värden per dag |
| AI Förbrukning | Köpt/sålt idag, månad och föregående månad (kWh + kr), kylskåp, disk och tvätt per pass och månad |
| AI Batterihistorik | Husbatteriets laddnivå % och effekt per 5 min, idag och igår |
| AI Laddkostnad | Elbilens laddning: pågående, senaste, månad (kWh, kr, laddnivå från → till) |
| AI Termostater / AI Termostat status | Börvärde och på/av för badrumselementet, samt ärvärde och om det värmer |
| AI Solladdning (+ status) | Knappen "Laddning sol" (ladda bilen på solöverskott) och vad den gör just nu |
| AI Homevolt status / logg | Batteriets hälsa (`OK …`, `FEL sedan …`, `Ingen kontakt …`) och händelselogg |
| AI Städschema / AI Städlogg | Robotarnas scheman (appen skriver) och vad som startats |

## 5. Innehåll som måste finnas (funktionsinventering)

En ny design får möblera om fritt, men **ingen funktion får försvinna**. Kontrollera mot listan.

**Överallt**
- Inloggningsskärm med knappen "Logga in med Homey".
- Rubrik "Hem Vinäs" och dagens datum.
- **Livestatus** ("Lokalt · nu" / "För 40 s sedan" / gul vid > 60 s / röd vid fel). Tryck på den uppdaterar.
- Tre **översiktsrutor** som också är genvägar:
  - **Tänt** "5 av 10", gul när något lyser.
  - **Ute** "−3,4°", blå under 0° och varm färg över.
  - **Förbrukning** "1 850 W" i heltal watt som i Tibber Pulse, minus vid försäljning, röd vid köp och grön vid försäljning.
- Flikrad för de fyra vyerna (nu nere i bild).
- Banner för ny version, felbanner, toast-meddelanden och "Logga ut".
- Blad ("sheets") som glider upp för detaljer.

**Ljus**
- Ljusrutan: väder för innevarande timme (SMHI-symbol), Dag/Skymning/Gryning/Natt efter lux och luxvärdet.
- Scener (Homey moods) som knappar.
- **Alla lampor** grupperade per våning och rum. Rubriken visar "X av Y tända" och har "Tänd rum"/"Släck rum".
- Lamprad: ikon, namn, **ljusstyrkestapel som också är reglaget** (dra eller tryck direkt på stapeln) och en brytare.
  - Färglampor visar stapeln i den färg de lyser med. Tryck på lampikonen öppnar ett färgval med färgrutor, Varm vit, Kall vit och reglage för nyans och mättnad.
  - Lampor som inte dimmas har bara på/av.
- "Släck allt inne" (överst) och "Släck allt", även ute (underst, kräver dubbeltryck).

**Klimat**
- Ute: stor temperatur och knappen **Väderprognos**, som öppnar ett blad i SMHI-stil: Idag/Imorgon, temperaturkurva med nederbörd och timlista med ikon, temperatur, mm och vind/byvind.
- **Värme**, en rad per värmekälla. Lägesrutan är på/av-knappen och är svagt röd när den värmer och blå när den kyler.
  - **Bergvärmepump**: inne nu, värmer/inget behov, driftläge. Under "Mer info": framledning, retur, köldbärare, varmvatten, börvärde och ärvärde.
  - **Golvvärme** (hall, badrum): rum/golv-temperatur, värmer + watt, −/+ i steg om 0,5°.
  - **Luftvärmepump** (kyla åt hundarna): Av/Värme/Kyla/Auto, börvärde −/+.
  - **Badrumselement** (AI 16): börvärde −/+ i steg om 0,2°, värmer/vilar, röd vid fel.
  - Röd pulserande ruta **"💧 Töm hinken"** när vattenlarmet i källaren slår till.
- **Rum**: rutor med temperatur och fukt. Batterivarning under 10 % med batterityp ("Batteri 8 % · byt CR2477").

**Energi**
- **Just nu**: energiflöde med fem noder, sol, nät, husbatteri (%), elbil (%) och huset i mitten. Animerade ledningar visar riktning, och en mening förklarar flödet ("Huset köper el från nätet och laddar bilen…"). En stapel visar var husets el kommer ifrån (sol/batteri/nät i %). Tryck på en nod öppnar dess blad.
- **Elpris**: köp och sälj just nu, nivå-chip (Billigt/Normalt/Dyrt/Mycket dyrt), minuter kvar på kvarten och ett kvartsdiagram över dygnet.
  - Diagrammet följer **Homey-stil**: linjen färgas efter pris från grönt till rött, ytan under tonas ut, den andra kurvan är grå i bakgrunden, och punkten för "nu" är tydlig med en prisetikett.
  - **Dra med fingret** i grafen för att se vald kvart, som i Tibber.
  - Köp/Sälj-väljare, Idag/Imorgon (imorgon visar snittpris, och priserna kommer runt 13:00). Lägst/högst med klockslag.
- **Idag**: kostnad hittills, köpt och sålt (kWh + kr), netto och solel idag.
- **Månad**: månadens namn som rubrik, kostnad hittills, köpt/sålt och knappen "Visa föregående månad".
- Lista som öppnar blad:
  - **Husbatteri**: laddnivå som batterigrafik i glasstil, färgad efter nivå (röd < 10, orange < 20, gul < 30, annars grön, ⚡ när det laddar). Status, temperatur, händelselogg och röd ruta vid FEL. **Historik**: diagram med % överst och effekt under (grön upp = laddar, orange ner = laddar ur), Idag/Igår, gå att dra i, grå list när batteriet stått still ≥ 1 h.
  - **Laddbox & bil**: status (Laddar + effekt + A), bilens batterigrafik med streck vid laddmålet, knappen **☀️ Laddning sol** (av = grå, på = solgul, vilande = 🌥️) och laddkostnad (pågående, senaste med från → till %, månad, förra månaden).
  - **Solceller**: effekt nu, idag, år och totalt.
  - **Faser**: L1/L2/L3 i ampere.
  - **Vitvaror**: kylskåp (igår, månad), disk och tvätt (senaste pass med tid, kWh och kr, pågående pass, månad).

**Städ**
- En ruta per robot (Saros 10R nere, Q7 L5 uppe) med status och batteri. Vald robot visas stort.
- Status ("I laddstationen", "Städning pågår · läge"), tagg "Nästa: måndag 13:10" och knappen **Städa allt**.
- Senaste städning: avslutad, tid och yta.
- **Städa rum** (ett tryck startar rummet), Städinställningar (städläge, sugkraft, moppning, mopprutt, stationens knappar som Töm dammbehållaren).
- **Schema**: lista med på/av per schema. Redigera dagar, tid, städläge, rum i ordning, sugkraft, moppning, rutt och antal varv (1–3). Sparas i AI Städschema.

## 6. Vad användaren gillar (lärt under arbetet)

- **Lugnt och tydligt, inte rörigt.** Detaljer får gärna ligga bakom en knapp eller i ett blad. Det viktigaste ska synas direkt.
- **Etiketter och tal får inte radbrytas eller kapas** ("Förbrukning", "Bergvärmepump", "1,01 kW"). Han reagerar direkt på sådant.
- **Stora, tydliga siffror** för det viktiga. Indikatorer ska vara lätta att se. Han fick be om en tydligare "nu"-punkt.
- **Förebilder är apparna han redan använder:** Homey (prisdiagram), Tibber Pulse (watt, dra i grafen) och SMHI (väder). När han visar en skärmbild vill han ha **samma upplägg**, inte en egen tolkning.
- Konsekvent **färgspråk**:
  - sol = gul, nät = blå, batteri = grön, elbil = lila
  - köp = rött och sälj = grönt
  - värmer = svagt rött, kyler = blått
  - fel = rött och varning = gult
- Samma kontroll ska fungera likadant överallt. Till exempel är lägesrutan på/av-knappen i alla värmerader.
- **Huset i appen (2026-11-21):** faluröd husbild (de bor i ett falurött hus) i Energi och Klimat. Fönstren ska lysa när lamporna på våningen är tända – ingen påhittad status. Översikten i Energi får gärna ta hela skärmen.
- Han vill se att saker **lever**: tid för senaste data, gult/rött när data är gammal, pulserande larm.
- Skrivs på svenska, med korta etiketter: "Tänt", "Ute", "Förbrukning", "Köpt", "Sålt", "Netto".

## 7. Nuvarande designsystem (utgångspunkt, inte krav)

- Typsnitt **Manrope** (Google Fonts), tabellsiffror (`font-variant-numeric: tabular-nums`).
- Ljust grundläge som följer telefonens mörka läge. En accentfärg, teal (`--accent` #0B7A66 ljust / #1FB596 mörkt).
- Kort med rundning 20 px på ljusgrå bakgrund (#EEF1F6 ljust / #0E141C mörkt). Flikrad nere. Blad som glider upp.
- Semantiska variabler i `:root`, bland annat `--sun`, `--grid`, `--batt`, `--ev`, `--danger`, `--warn`, `--ok`, `--cold`, `--warm`, `--price` och `--amber`. JS-koden använder variabelnamnen, så behåll namnen eller byt överallt.
- Appikon (användarens egen): grön diagonal gradient #17B394 → #0A7A67, vitt hus i linjestil och en orange sol (#F5A623).

## 8. Så levererar du – i två steg

### Steg 1: Mock (det enda du bygger)
- Bygg en fristående prototyp i en **egen mapp**, t.ex. `design/<ditt-namn>/index.html`, som laddar `../mock-homey.js` (eller en egen kopia av den) och visar **alla fyra vyerna** med låtsasdata, inklusive bladen (batteri, laddbox, elpris imorgon, schemaredigering, färgval).
- Prototypen ska visa **utseende och känsla**. Klick och reglage får gärna fungera mot låtsasdatan, men ingen riktig styrning behövs.
- **Absolut förbjudet:** ändra befintliga filer i repot, pusha till `main`, logga in mot eller skicka kommandon till den riktiga Homey, byta variabelnamn eller dataformat. Har du skrivrätt till repot: lägg mocken i en egen gren eller lämna filerna direkt till användaren i stället.
- Testa i 390 px (iPhone), 820 px (iPad) och 1280 px (dator), ljust och mörkt läge, och lämna skärmbilder (`design/<ditt-namn>/screens/`).
- Användaren tittar och säger om han gillar den. Gör justeringar i mocken tills han är nöjd.

### Steg 2: Underlag till Claude (bara om användaren godkänner)
Bygg inte om appen själv. Skriv i stället ett underlag, `design/<ditt-namn>/UNDERLAG.md`, som Claude använder för att föra över designen till den riktiga appen. Det ska innehålla:
1. **Designsystem:** alla färger (ljust + mörkt) som CSS-variabler, typsnitt, storlekar, avstånd, rundningar, skuggor, animationer. Ange vilka av dagens variabler (§7) som byts mot vad.
2. **Komponent för komponent:** för varje del i §5 – hur den ska se ut och bete sig, med hänvisning till skärmbild och till motsvarande ställe i mocken (CSS-klass/fil). Säg uttryckligen när något ska se ut **som idag**.
3. **Layout per skärmstorlek:** telefon, iPad, dator (och gärna väggpanel).
4. **Ändringar i struktur eller navigation** (t.ex. flyttade kort, nya blad, annan flikrad) – och var varje befintlig funktion hamnar, så att ingen försvinner (stäm av mot listan i §5).
5. **Ikoner och grafik:** SVG-koden eller filer, inga bibliotek.
6. **Öppna frågor och avvägningar** du gjorde, så användaren kan ta ställning.

Bifoga mockens filer och skärmbilderna. Claude inför sedan ändringarna stegvis i den riktiga appen, testar med riktig data och behåller allt som fungerar idag.

**Gör inte (gäller båda stegen):**
- Ändra den riktiga appen eller skicka kommandon till den riktiga Homey.
- Ändra variabelnamn eller JSON-format.
- Lägga till bibliotek eller byggsteg (mocken får inte heller bero på dem – den ska kunna föras över).
- Lägga till en av/på-knapp för kyl, disk eller tvätt.
- Ta bort funktioner för att designen ska bli renare – göm hellre bakom en knapp.
