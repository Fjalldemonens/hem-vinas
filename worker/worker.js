// Hem Vinäs – inloggningsserver (Cloudflare Worker).
// Byter Homeys inloggningskod mot token och förnyar token. Klienthemligheten finns bara här.
// Miljövariabler i Cloudflare: CLIENT_ID, CLIENT_SECRET (som Secret), ALLOWED_ORIGIN (t.ex. https://fjalldemonens.github.io)
const TOKEN_URL = 'https://api.athom.com/oauth2/token';

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = origin === env.ALLOWED_ORIGIN;
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Vary': 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (!allowed) return new Response('Forbidden', { status: 403 });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const path = new URL(req.url).pathname;
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, cors); }

    const form = new URLSearchParams();
    if (path === '/token' && typeof body.code === 'string') {
      form.set('grant_type', 'authorization_code');
      form.set('code', body.code);
      if (body.redirect_uri) form.set('redirect_uri', body.redirect_uri);
    } else if (path === '/refresh' && typeof body.refresh_token === 'string') {
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', body.refresh_token);
    } else {
      return json({ error: 'not_found' }, 404, cors);
    }
    form.set('client_id', env.CLIENT_ID);
    form.set('client_secret', env.CLIENT_SECRET);

    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + btoa(env.CLIENT_ID + ':' + env.CLIENT_SECRET) },
      body: form,
    });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  },
};
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s, headers: { ...h, 'content-type': 'application/json' } });
