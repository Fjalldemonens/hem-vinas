# Hem Vinäs

En webbapp för hemmet: belysning, temperatur och energi från Homey Pro. Den läggs på hemskärmen i mobilen och fungerar både hemma och borta.

## Säkerhet

- Koden här är publik, men den ger ingen åtkomst. För att se eller styra något måste man logga in med ett Homey-konto som är användare på er Homey.
- Klienthemligheten (`CLIENT_SECRET`) ligger **bara** i Cloudflare, aldrig i det här repot.
- Inloggningsservern svarar bara på anrop från appens egen adress (`ALLOWED_ORIGIN`).
- Inloggningen sparas bara i varje telefons webbläsare. "Logga ut" längst ner tar bort den.

## Engångsinställning

### 1. Registrera appen hos Homey
1. Gå till [tools.developer.homey.app](https://tools.developer.homey.app) och logga in med ditt Homey-konto.
2. Välj **Web API Clients** och skapa en ny klient:
   - Name: `Hem Vinäs`
   - Redirect URL: `https://fjalldemonens.github.io/hem-vinas/`
3. Spara **Client ID** och **Client Secret**.

### 2. Skapa inloggningsservern i Cloudflare (gratis)
1. Skapa ett konto på [dash.cloudflare.com](https://dash.cloudflare.com).
2. Välj **Workers & Pages → Create → Worker**. Döp den till `hem-vinas-auth` och välj **Deploy**.
3. Välj **Edit code**, ersätt allt med innehållet i `worker/worker.js` och välj **Deploy**.
4. Under **Settings → Variables and Secrets** lägger du till:
   - `CLIENT_ID`: ditt Client ID (Text)
   - `CLIENT_SECRET`: ditt Client Secret (**Secret**)
   - `ALLOWED_ORIGIN`: `https://fjalldemonens.github.io` (Text, utan snedstreck på slutet)
5. Notera Worker-adressen, till exempel `https://hem-vinas-auth.<konto>.workers.dev`.

### 3. Fyll i `config.js`
Fyll i `CLIENT_ID` och `AUTH_URL` (Worker-adressen). Inget av det är hemligt.

### 4. Slå på GitHub Pages
Gå till **Settings → Pages**, välj Source **Deploy from a branch**, branch `main` och mappen `/ (root)`.

### 5. Lägg appen på hemskärmen
Öppna `https://fjalldemonens.github.io/hem-vinas/` i Safari, välj **Dela → Lägg till på hemskärmen** och logga in med Homey.

## Så fungerar det

1. Du loggar in hos Homey (Athom).
2. Inloggningsservern byter koden mot en token.
3. Appen hämtar en session på er Homey Pro.
4. Appen pratar direkt med Homey: lokalt när ni är hemma, annars via Homeys moln.
