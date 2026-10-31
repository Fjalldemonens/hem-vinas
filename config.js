// Hem Vinäs – inställningar. Inga hemligheter här: filen är publik.
// CLIENT_ID är offentlig (syns ändå i inloggningslänken). CLIENT_SECRET ligger bara i Cloudflare.
window.HV_CONFIG = {
  // Från Homey Developer Tools → Web API Clients
  CLIENT_ID: 'FYLL_I_CLIENT_ID',
  // Din Cloudflare Worker, t.ex. https://hem-vinas-auth.<ditt-konto>.workers.dev
  AUTH_URL: 'https://FYLL_I.workers.dev',
  // Måste vara exakt samma som Redirect URL i Homey Developer Tools
  REDIRECT_URI: 'https://fjalldemonens.github.io/hem-vinas/',
};
