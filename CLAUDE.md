# Hem Vinäs – instruktioner för Claude

Det här repot är **huvudversionen** av Hem Vinäs-appen. Alla ändringar görs här, inte i artefakten "Hem Vinäs" på claude.ai (den är en äldre kopia).

## Publicering
- GitHub Pages publicerar automatiskt från `main` (root) till https://fjalldemonens.github.io/hem-vinas/ inom ungefär en minut efter push.
- Ingen byggprocess: ren HTML/CSS/JS. Inga bibliotek utöver Google Fonts.

## Filer
- `index.html` – appen (stil, markup, rendering av flikarna Belysning, Temperatur (inkl. bergvärmepump), Energi (elpris i Homey-stil med dra-i-grafen som i Tibber – markör + stora siffran visar vald kvart, kortet ritas inte om mitt i ett drag; rubriken har samma form för Idag/Imorgon (Imorgon visar snittpris) och lägst/högst står under grafen för båda dagarna, Idag med månad/föregående månad, Solceller, Batteri & laddbox, Apparater), Städ (inkl. Schema bakom knapp)). Nuvarande version 2026-11-07.1.
- `homey.js` – Homey Web API-klient: OAuth via Workern, delegationstoken, session mot Homey Pro (lokalt först, annars moln), enheter, zoner, variabler, moods.
- `homey/` – kopior av HomeyScript-koden i flödena AI 11, AI 13 och AI 14 (källan som körs ligger i Homey; uppdatera kopian när flödet ändras).
- Ikon (2026-11-06.8): orange bakgrund #ff8a1f, stort fyllt svart hus #0a0a0a (vald för att synas mot svart hemskärmstapet) (`icon.svg` med rundade hörn; PNG:erna är fyrkantiga, iOS rundar själv). iOS cachar hemskärmsikonen – ta bort och lägg till appen igen för att se ny ikon.
- `config.js` – Client ID, Worker-adress, Redirect URL. Inga hemligheter.
- `worker/worker.js` – Cloudflare Worker `hem-vinas-auth` (https://hem-vinas-auth.uffes-mora.workers.dev). Ändringar här måste klistras in manuellt i Cloudflare (Edit code → Deploy) av användaren.

## Regler
- Lägg aldrig hemligheter (Client Secret, tokens) i repot. Repot är publikt.
- Homey API-klientens scopes: zone.readonly, device.readonly, device.control, logic.readonly, mood.readonly, mood.set, samt homey.logic (för att spara städschemat i variabeln AI Städschema). Behöver en ny funktion fler scopes måste användaren lägga till dem i Homey Developer Tools.
- Svenska i allt som syns i appen.
- Vid varje ändring: höj `app-version` i `index.html` (meta-taggen och `?v=` på config.js och homey.js, t.ex. 2026-11-02.2). Appen jämför versionen med GitHub Pages och visar "Ny version av appen finns – Uppdatera nu".

## Homey-sidan (flöden och variabler som appen bygger på)
Flöden hittas via id, så mappar och flödesnamn får ändras. **Variabelnamnen får inte ändras** – skript och app letar upp dem på namn.

| Flöde | Id | Gör |
|---|---|---|
| AI 11 · Homevolt-vakt | c58c08ad-20bf-441c-b14f-060cd3248af3 | Var 10:e min. Kontaktvakt: push om Homevolt i Homey saknat data >15 min. Systemvakt (2026-11-05): push om batteriet står still trots kontakt – `measure_frequency` = 0 Hz i Homey eller `ems_data.alarm` ≠ 0 – i 15 min; status blir `FEL sedan …: nätfrekvens 0 Hz`. Medan en modul står i `IGNORE` (BAT00 t.o.m. 2026-11-25) loggas stoppet bara: ingen push, ingen röd ruta, status `OK … (står still sedan HH:MM, känt BAT00-fel)`. Lokal sida tyst >30 min loggas utan push. Modulvakt (2026-11-05): HomeyScript hämtar http://192.168.1.168/ems.json (lokalt nät) och larmar om en batterimodul inte är `Connected` eller har alarm i 1 h. `IGNORE` hoppar över moduler t.o.m. ett datum (BAT00 t.o.m. 2026-11-25, byte bokat). Skriver AI Homevolt status (`OK …` / `FEL sedan ÅÅÅÅ-MM-DD HH:MM: orsak` / `Ingen kontakt …`), händelse och logg. Appen visar röd ruta i batterikortet bara vid `FEL`. Kopia: `homey/ai11-homevolt-vakt.js`. |
| AI 12 · Elpriser till appen | fb284696-b2e9-43eb-bd70-dbe581d5657f | Var 15:e min: kvartspriser idag/imorgon från Homey Energy → AI Elpriser `{u,cur,f,days:[{d,s,iv,imp[],exp[]}]}`. imp = användarens formel, exp = spot. |
| AI 13 · Städschema (test) | 421b0a25-622b-41fc-a2e6-67950df7d2da | Varje min: kör scheman i AI Städschema. Ställer in läge/sug/moppning/rutt via capabilities, startar sedan ALLA rum i ETT jobb med Roborock-kortet `clean_room` (args `rooms`: rumsnamn kommaseparerade, `repeat` 1–3), annars `clean_all`. Minst 15 min mellan starter. Logg → AI Städlogg. |
| AI 14 · Förbrukning kyl, disk, tvätt, nät | 5079f42e-afc5-4fed-9262-2c7ea3ec0b4f | Varje min: kylskåp (dygn/månad – bara hela dygn midnatt–midnatt redovisas; ett påbörjat dygn slängs vid midnatt och månaden = hela dygn + idag), disk/tvätt (senaste pass/månad; per pass även `min`, toppeffekt `pk`, värmeminuter ≥1000 W `hot`, värme efter 75 min `late`, de 8 senaste passen med 10-min-profil i `hist`; tvätt får `kind` `tork` om `late` ≥ 15, preliminär gräns tills mönstret är kartlagt – tvättmaskinen är en AEG 7000 Kombi, ibland tvätt + tork), nätet köpt/sålt idag, månad, föregående månad → AI Förbrukning. Tillstånd i HomeyScript `global 'elf'`. |

Variabler: AI Elpriser, AI Förbrukning, AI Städschema, AI Städlogg, AI Homevolt status/händelse/logg, AI Skumt ute, AI Skumt inne. Testrester som får tas bort: flödet "🗑 Claude test energipris", variabeln "🗑 Claude flödesexport".

## Kontraktet Homey ↔ app (grunden för flytten till nya huset)
Appen pratar bara med Homey via **variabelnamn + JSON-format** och via enheternas **typ/capabilities/namn** – aldrig via märke. Det är detta som gör att appen kan flytta med till nya huset (Vinäs 249:11) utan omskrivning. Beslutat 2026-11-06:
- **Variabelnamn och format är låsta.** Ändras ett format får det bara *utökas* (nya fält), aldrig byta betydelse eller ta bort fält som appen läser.
- **Allt husspecifikt** (enhets-id, IP, tariffer, rumsnummer) ska ligga i ett konfigblock överst i varje HomeyScript, märkt `// === KONFIG (husspecifikt) ===`. Vid flytten byts bara konfigblocken + prisformeln, inte logiken.
- **Byte av märke** (Homevolt → SigenStor, Thermia → Nibe) görs i Homey-flödena, som skriver samma variabler. Märkesbundna variabelnamn (`AI Homevolt …`) får neutrala efterträdare först när nya huset närmar sig; appen ska då läsa nya namnet och falla tillbaka på det gamla. Inget byts i förväg.

| Variabel | Skrivs av | Läses av appen | Format (kort) |
|---|---|---|---|
| AI Elpriser | AI 12 | Elpris-kortet | `{u,cur,f,days:[{d,s,iv,imp[],exp[]}]}` – imp = köppris enligt prisformeln, exp = spot |
| AI Förbrukning | AI 14 | Apparater, Idag/månad | `{u,p,pe,ps, kyl:{…}, disk:{…}, tvatt:{…}, grid:{d,imp,exp,…}}` |
| AI Homevolt status | AI 11 | Batterikortet (röd ruta bara vid `FEL`) | text: `OK …` / `FEL sedan ÅÅÅÅ-MM-DD HH:MM: orsak` / `Ingen kontakt …` |
| AI Homevolt händelse, AI Homevolt logg | AI 11 | Batteriloggen | text, en händelse per rad |
| AI Städschema | appen | AI 13 | JSON per robot-id: `[{id,on,time,days[],rooms[],mode,suction,scrub,route,repeat}]` |
| AI Städlogg | AI 13 | Städ-fliken | text, en rad per händelse |
| AI Skumt ute | flöden i Homey | Belysning, Temperatur (chip Skumt/Dagsljus) | boolesk |
| AI Skumt inne | flöden i Homey | – (bara Homey-flöden) | boolesk |

Enhetsroller som appen hittar själv (inget id i appen): lampor = typ `light`; energikort = typ `battery`/`solarpanel`/`evcharger`; elmätare = `meter_power.imported` eller namnet "Elmätare"; innetemperatur = givaren "Bottenvåning" (annars snitt inne); utegivare = `measure_luminance` + "temp" i namnet.

## Husprofil (vilken enhet fyller vilken roll)
Fakta om nya huset är planer per 2026-11-06 och bekräftas när enheterna finns. **Homey Pro (Early 2023) flyttar med** – flöden, variabler och appen följer med, men alla nya enheter får nya id.

| Roll | Nuvarande hus (gäller nu) | Nya huset (plan) | Konsekvens vid flytten |
|---|---|---|---|
| Homey | Homey Pro (Early 2023) | Samma Homey Pro | Flöden/variabler följer med |
| Elhandel | Tibber (Pulse = elmätaren i Homey) | **Inte Tibber.** Leverantör ej vald | Prisformelns påslag (0,0998) och fallbacken i AI 14 (`d4736f20-…` `measure_price_total`) måste bytas. Ny elmätare i Homey behövs (Pulse följer inte med i rollen) → `GRID` i AI 14 |
| Elnät | Ellevio (Mora, reducerad energiskatt) | **Ellevio, kvar** | Överföring/energiskatt i prisformeln (0,59) och `NAT_PROD` kontrolleras mot gällande avtal vid flytten, inte mot dagens siffror |
| Batteri | Homevolt (`bb92dcb1-…`, lokalt `192.168.1.168/ems.json`) | SigenStor Neo, < 20 kWh i garaget | AI 11 ersätts av en Sigen-vakt som skriver samma statusformat |
| Solceller | Befintliga (via Homevolt/Homey) | Ca 12–13 kWp via SigenStor Neo | Appen hittar `solarpanel` själv om Sigen-appen exponerar typen |
| Värmepump | Thermia Diplomat Inverter L ("Bergvärmepump", Thermia Online, skrivskyddat kort) | Nibe S735 | Kortet ska bygga på standardvärden (börvärde, ärvärde, varmvatten), inte Thermia-specifika |
| Kyl/disk/tvätt | Shelly Plug M Gen3 (`DEV` i AI 14) | Shelly (modell ej vald) | Nya id i `DEV` |
| Städrobotar | Saros 10R + Q7 L5, rum enligt nedan | Samma robotar, ny karta | Rumsnumren mappas om (AI 13 + appens rumsnamn) |
| Belysning | Hue + Shelly | Shelly (Gen4), dimmer bara till takspotar; Hue utesensor för lux kvar | Appen tar typ `light` – inget att ändra |

## Kända fakta och fällor (verifierade 2026-11-05)
- **Prisformel i Homey Energy:** `((Baspris + 0.0998) * 1.25) + 0.59`. 0,0998 = Tibber fasta påslag 6,00 + rörliga 3,98 öre (exkl. moms, rörliga ändras månadsvis). 0,59 = Ellevio överföring 26,00 + energiskatt 33,00 öre inkl. moms (Mora har 9,6 öre avdrag på energiskatten). Grid Rewards och fasta avgifter (Ellevio 590 kr/mån, Tibber 39,20 kr/mån exkl. moms) räknas inte per kWh.
- **Såld el:** Tibber betalar spot (utan moms) + Ellevio produktionsersättning 3,20 öre/kWh (`NAT_PROD` i AI 14).
- **Tibber Pulse i Homey (Elmätare 2b5aab67-…):** `meter_power.imported` är tillförlitlig. `meter_power.exported` står still i timmar och hoppar ikapp – därför räknas sålt från `measure_power` (negativ = export) varje minut. Avstämt mot Tibber-appen: köpt och sålt inom ~1 %.
- **Homeys historik:** idag/denna månad finns i 5-min/1-h-upplösning, förra månaden bara i 6-h-block (kronor blir ungefärliga för den).
- **HomeyScript:** körs varje minut – tunga engångsjobb måste delas upp (t.ex. 3 dagar per körning), annars hinner skriptet inte klart och flödet står still.
- **Roborock (Homey-appen):** status (`is_cleaning`, `dock`) uppdateras bara ungefär var 5:e min. Starta därför aldrig rum ett i taget baserat på status – använd kortet `clean_room` med alla rum.
- **Saros 10R** (f46d4d93-…): rum 1 vardagsrum, 2 hall1, 3 kök, 4 badrum, 5 matsal, 6 hall 2. Sugkraft 101 tyst, 102 balanserad, 103 turbo, 104 max, 105 av, 110 smart. Mopprutt 300 standard, 301 djup, 303 djup+, 304 snabb, 306 smart. Vattenflöde 200 av, 221 svag, 225 låg, 230 skonsam, 235 medel, 240 måttlig, 245 hög, 250 max. Städläge 0 dammsugning, 1 damm+mopp, 2 moppning.
- **Roborock Q7 L5** (9736de40-…): rum 10 Hall, 11 Stort sovrum, 12 Sovrum. Sugkraft även 108 max+. Vattenflöde 200 av, 201 mild, 202 måttlig, 203 intensiv.
- **Homey Web API, skriva variabel:** `PUT /api/manager/logic/variable/:id` med kroppen `{ value }` (inte `{ variable: { value } }` – det svarar OK men sparar inget).
- **Homevolt i Homey (bb92dcb1-…):** Homey-appen exponerar inget fellarm – vid fel syns bara `battery_status: "Okänd"` och `measure_power` 0. Använd i stället Homevolts lokala JSON **http://192.168.1.168/ems.json**: `ems[0].ems_data` (state_str, warning_str, alarm_str, soc_avg ×0,01 %), `ems[0].bms_data[]` = en post per modul i ordningen BAT00, BAT01 (inget id-fält): `state_str` (Connected/Fault), `alarm`, `alarm_str[]`, `soc` ×0,01 %, `energy_avail` Wh, `cycle_count`, `tmin`/`tmax` ×0,1 °C. `sensors[]` = grid/solar/load. En modul i Fault stoppar hela systemet (BATTERY_DC_DISCONNECT).
- **Homevolt kan stå still med full kontakt:** 2026-11-05 16:05–20:45 låg nätfrekvensen på 0 Hz men Homey fick nya värden hela tiden, så kontaktvakten såg inget. Stopp syns säkrast som `measure_frequency` = 0. `ems_data.warning_str` innehåller `BATTERY_DC_DISCONNECT_WARNING` även när systemet går på BAT01 – använd inte den som stoppsignal. HomeyScripts fetch mot ems.json kan sluta svara en tid ("lokal sida svarar inte").
- **HomeyScript saknar `setTimeout`** (ReferenceError). Använd aldrig `Promise.race` med `setTimeout` för timeouts – använd `fetch(url, { timeout: ms })`. Modulvakten i AI 11 var blind 2026-11-05 till 2026-11-06 06:10 av just detta, och AI 13 kraschade 2026-11-06 09:30 på samma sak (pausen efter lägesbyte) – nu `pause()` med HomeyScripts `wait()` eller korta enhetsanrop.
- **Thermia börvärde via Homey:** fungerar (verifierat 2026-11-07: ändring i Homey-appen slog igenom i Thermia och låg kvar). 2026-11-06 studsade en ändring tillbaka – troligen tillfälligt strul i Thermias moln. Appen har +/− igen sedan 2026-11-07.1, utan kontroll/varning; visat värde kommer alltid från Homey så en studs syns direkt.
- **Hue lightstrip** får inte vara med i något flöde (styrs av Harmony). Luft-luftvärmepumpen används bara för kyla åt hundarna.

## Arbetssätt (för att spara användning)
- Läs inte alla variabler/enheter i onödan – AI Elpriser och enhetslistan är stora.
- Testa appändringar lokalt med Playwright och låtsasdata innan push.
- Vid ändring av HomeyScript: håll en lokal kopia, kontrollera syntax med node, skicka sedan hela flödet en gång.
