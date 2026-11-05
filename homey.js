// Hem Vinäs – minimal klient för Homeys Web API (OAuth2 via egen Cloudflare Worker).
// Flöde: Athom-inloggning → kod → Worker byter mot token → delegationstoken → session på Homey Pro.
// Tokens sparas bara i den här telefonens webbläsare.
(() => {
  const C = window.HV_CONFIG;
  const ATHOM = 'https://api.athom.com';
  const K = { tok: 'hv.token', homey: 'hv.homey', sess: 'hv.session', base: 'hv.base', state: 'hv.state' };
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  class HttpError extends Error { constructor(status, msg) { super(msg || 'HTTP ' + status); this.status = status; } }

  async function http(url, opts = {}, timeout = 12000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      const txt = await r.text(); let body = txt; try { body = txt ? JSON.parse(txt) : null; } catch (e) {}
      if (!r.ok) throw new HttpError(r.status, (body && (body.error_description || body.error || body.message)) || r.statusText);
      return body;
    } finally { clearTimeout(t); }
  }
  const authPost = (path, data) => http(C.AUTH_URL.replace(/\/$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const saveToken = (t) => { t.expires_at = Date.now() + ((t.expires_in || 3600) - 120) * 1000; ls.set(K.tok, t); return t; };

  /* ---------- inloggning ---------- */
  function login() {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ls.set(K.state, state);
    const u = new URL(ATHOM + '/oauth2/authorise');
    u.searchParams.set('client_id', C.CLIENT_ID);
    u.searchParams.set('redirect_uri', C.REDIRECT_URI);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('state', state);
    location.href = u.toString();
  }
  function logout() { Object.values(K).forEach(ls.del); }
  // Körs vid sidladdning: tar hand om ?code=… efter inloggningen
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'); if (!code) return false;
    const expected = ls.get(K.state); ls.del(K.state);
    history.replaceState(null, '', location.pathname + location.hash);
    if (expected && q.get('state') && q.get('state') !== expected) throw new Error('Inloggningen kunde inte verifieras. Försök igen.');
    saveToken(await authPost('/token', { code, redirect_uri: C.REDIRECT_URI }));
    ls.del(K.sess); ls.del(K.homey);
    return true;
  }
  const loggedIn = () => !!ls.get(K.tok);

  async function accessToken() {
    let t = ls.get(K.tok); if (!t) throw new HttpError(401, 'Inte inloggad');
    if (Date.now() > t.expires_at) {
      try { t = saveToken({ ...t, ...(await authPost('/refresh', { refresh_token: t.refresh_token })) }); }
      catch (e) { logout(); throw new HttpError(401, 'Inloggningen har gått ut'); }
    }
    return t.access_token;
  }
  const athom = async (path, opts = {}) => http(ATHOM + path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + await accessToken() } });

  /* ---------- session mot Homey Pro ---------- */
  async function pickHomey() {
    let h = ls.get(K.homey); if (h) return h;
    const me = await athom('/user/me');
    const list = (me && me.homeys) || [];
    if (!list.length) throw new Error('Ditt Homey-konto har ingen Homey kopplad.');
    h = list.find((x) => x.platform === 'local') || list[0];
    h = { id: h._id || h.id, name: h.name, urls: [h.localUrlSecure, h.localUrl, h.remoteUrl].filter(Boolean) };
    ls.set(K.homey, h); return h;
  }
  let sessPromise = null;
  async function session(force) {
    if (!force) { const s = ls.get(K.sess), b = ls.get(K.base); if (s && b) return { token: s, base: b }; }
    if (sessPromise) return sessPromise;
    sessPromise = (async () => {
      ls.del(K.sess); ls.del(K.homey);
      const h = await pickHomey();
      const dtok = await athom('/delegation/token?audience=homey', { method: 'POST' });
      let last;
      for (const base of h.urls) {
        // Lokalt nät först (snabbast), annars Homeys molnadress
        const local = !/connect\.athom\.com|homey\.app/.test(base) && base !== h.urls[h.urls.length - 1];
        try {
          const tok = await http(base.replace(/\/$/, '') + '/api/manager/users/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: dtok }) }, local ? 3000 : 12000);
          ls.set(K.sess, tok); ls.set(K.base, base.replace(/\/$/, ''));
          return { token: tok, base: base.replace(/\/$/, '') };
        } catch (e) { last = e; }
      }
      throw last || new Error('Når inte Homey');
    })();
    try { return await sessPromise; } finally { sessPromise = null; }
  }
  async function homey(path, opts = {}, retried) {
    const s = await session(false);
    try {
      return await http(s.base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}), authorization: 'Bearer ' + s.token } });
    } catch (e) {
      // 401 = sessionen gått ut, nätverksfel = vi har bytt nät (hemma ↔ borta): skapa ny session en gång
      if (!retried && (e.status === 401 || e.name === 'AbortError' || e instanceof TypeError)) { await session(true); return homey(path, opts, true); }
      throw e;
    }
  }

  /* ---------- data i samma form som appen använder ---------- */
  function zonePath(zones, id) {
    const parts = []; let z = zones[id], guard = 0;
    while (z && guard++ < 10) { parts.unshift(z.name); z = z.parent ? zones[z.parent] : null; }
    return parts.join(' > ') || 'Hem';
  }
  let zoneCache = null, zoneAt = 0;
  async function devices() {
    if (!zoneCache || Date.now() - zoneAt > 600000) { zoneCache = await homey('/api/manager/zones/zone/'); zoneAt = Date.now(); }
    const raw = await homey('/api/manager/devices/device/');
    return Object.values(raw || {}).map((d) => {
      const state = {}, caps = {};
      const txt = (t) => (t && typeof t === 'object' ? (t.sv || t.en || Object.values(t)[0]) : t);
      Object.entries(d.capabilitiesObj || {}).forEach(([k, c]) => {
        state[k] = c ? c.value : null;
        // Namn, typ och valbara lägen per funktion, så appen kan bygga knappar (t.ex. för robotdammsugaren)
        if (c) caps[k] = { title: txt(c.title), type: c.type, setable: c.setable !== false, units: txt(c.units), at: c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0, values: Array.isArray(c.values) ? c.values.map((x) => ({ id: String(x.id), title: txt(x.title) || String(x.id) })) : null };
      });
      // Bilder som enheten publicerar i Homey, t.ex. robotens karta
      const images = (d.images || []).map((x) => ({ id: x.id, title: txt(x.title), url: x.imageObj && x.imageObj.url, at: x.imageObj && x.imageObj.lastUpdated })).filter((x) => x.url);
      return { id: d.id, name: d.name, zone: zonePath(zoneCache || {}, d.zone), type: d.virtualClass || d.class, available: d.available, state, caps, images };
    });
  }
  // Hämtar en bild från Homey (kräver inloggning) och ger en lokal adress som <img> kan visa.
  async function image(url, retried) {
    const s = await session(false);
    const full = /^https?:/.test(url) ? url : s.base + (url.startsWith('/') ? '' : '/') + url;
    const r = await fetch(full, { headers: { authorization: 'Bearer ' + s.token } });
    if (r.status === 401 && !retried) { await session(true); return image(url, true); }
    if (!r.ok) throw new HttpError(r.status, 'Bilden kunde inte hämtas');
    return URL.createObjectURL(await r.blob());
  }
  // Skriver en logikvariabel (kräver behörigheten homey.logic i Homey Developer Tools).
  async function setVariable(name, value) {
    const v = (await variables()).find((x) => x.name === name);
    if (!v) throw new Error('Variabeln ' + name + ' finns inte i Homey');
    return homey('/api/manager/logic/variable/' + encodeURIComponent(v.id), { method: 'PUT', body: JSON.stringify({ variable: { value } }) });
  }
  async function variables() { const v = await homey('/api/manager/logic/variable/'); return Object.values(v || {}); }
  async function moods() { try { const m = await homey('/api/manager/moods/mood/'); return Object.values(m || {}); } catch (e) { return []; } }
  async function setMood(id) { return homey('/api/manager/moods/mood/' + encodeURIComponent(id) + '/set', { method: 'POST', body: '{}' }); }
  async function setCaps(map) {
    const jobs = [];
    for (const [id, caps] of Object.entries(map)) for (const [cap, value] of Object.entries(caps)) {
      jobs.push(homey('/api/manager/devices/device/' + encodeURIComponent(id) + '/capability/' + encodeURIComponent(cap), { method: 'PUT', body: JSON.stringify({ value }) }));
    }
    const res = await Promise.allSettled(jobs);
    const bad = res.find((r) => r.status === 'rejected'); if (bad) throw bad.reason;
  }
  const where = () => { const b = ls.get(K.base) || ''; return !b ? '' : /connect\.athom\.com/.test(b) ? 'via molnet' : 'lokalt'; };

  window.HomeyClient = { login, logout, handleRedirect, loggedIn, devices, image, variables, setVariable, moods, setMood, setCaps, where };
})();
