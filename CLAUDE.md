# Hem Vinäs – instruktioner för Claude

Det här repot är **huvudversionen** av Hem Vinäs-appen. Alla ändringar görs här, inte i artefakten "Hem Vinäs" på claude.ai (den är en äldre kopia).

## Publicering
- GitHub Pages publicerar automatiskt från `main` (root) till https://fjalldemonens.github.io/hem-vinas/ inom ungefär en minut efter push.
- Ingen byggprocess: ren HTML/CSS/JS. Inga bibliotek utöver Google Fonts.

## Filer
- `index.html` – appen (stil, markup, rendering av flikarna Belysning, Temperatur (inkl. bergvärmepump), Energi (inkl. Apparater från variabeln AI Förbrukning, flödet AI 14), Städ).
- `homey.js` – Homey Web API-klient: OAuth via Workern, delegationstoken, session mot Homey Pro (lokalt först, annars moln), enheter, zoner, variabler, moods.
- `config.js` – Client ID, Worker-adress, Redirect URL. Inga hemligheter.
- `worker/worker.js` – Cloudflare Worker `hem-vinas-auth` (https://hem-vinas-auth.uffes-mora.workers.dev). Ändringar här måste klistras in manuellt i Cloudflare (Edit code → Deploy) av användaren.

## Regler
- Lägg aldrig hemligheter (Client Secret, tokens) i repot. Repot är publikt.
- Homey API-klientens scopes: zone.readonly, device.readonly, device.control, logic.readonly, mood.readonly, mood.set, samt homey.logic (för att spara städschemat i variabeln AI Städschema). Behöver en ny funktion fler scopes måste användaren lägga till dem i Homey Developer Tools.
- Svenska i allt som syns i appen.
- Vid varje ändring: höj `app-version` i `index.html` (meta-taggen och `?v=` på config.js och homey.js, t.ex. 2026-11-02.2). Appen jämför versionen med GitHub Pages och visar "Ny version av appen finns – Uppdatera nu".
