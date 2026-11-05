// Förbrukning och kostnad för kylskåp, diskmaskin och tvättmaskin (Shelly Plug M Gen3), samt köpt/sålt el idag.
// Körs varje minut: mätarens ökning sedan förra minuten × elpriset för just den kvarten.
const DEV = { kyl: '73e322a0-197e-40fa-adc0-75cddff530be', disk: 'aa436302-665d-4f51-a89c-fe2e959dd2c6', tvatt: '3c4ab65f-c279-4e6e-b9c2-6cd4a4322471' };
// Ett disk-/tvättpass börjar över "on" W och är klart när effekten legat under "off" W i "idle" minuter.
const CYCLE = { disk: { on: 8, off: 3, idle: 30 }, tvatt: { on: 8, off: 3, idle: 20 } };
const t = Date.now();
const vars = Object.values(await Homey.logic.getVariables());
const vOut = vars.find((x) => x.name === 'AI Förbrukning');
const vPris = vars.find((x) => x.name === 'AI Elpriser');
const loc = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
const p2 = (n) => String(n).padStart(2, '0');
const day = loc.getFullYear() + '-' + p2(loc.getMonth() + 1) + '-' + p2(loc.getDate());
const mon = day.slice(0, 7);
const hm = p2(loc.getHours()) + ':' + p2(loc.getMinutes());
// Elpris per kvart från AI Elpriser: köp (inkl. påslag enligt Homey Energy) och sälj (spot)
let P = {}; try { P = JSON.parse((vPris && vPris.value) || '{}') || {}; } catch (e) {}
const slot = (ts, key) => {
  for (const d of P.days || []) {
    const i = Math.floor((ts - Date.parse(d.s)) / ((d.iv || 15) * 60000));
    if (i >= 0 && i < (d[key] || []).length) return Number(d[key][i]);
  }
  return null;
};
let price = slot(t, 'imp'), src = price == null ? '' : 'kvart';
if (price == null) {
  try { const e = await Homey.devices.getDevice({ id: 'd4736f20-c61d-42bf-bb8d-e9baf9043591' }); price = Number(e.capabilitiesObj.measure_price_total.value); src = 'tibber'; } catch (e) {}
}
// Såld el: spotpris (Tibber) + Ellevios produktionsersättning 3,20 öre/kWh (faktura okt 2026, ingen moms)
const NAT_PROD = 0.032;
const pSpotExp = slot(t, 'exp'), pExp = pSpotExp == null ? null : pSpotExp + NAT_PROD;
let S = {}; try { S = JSON.parse(global.get('elf') || '{}') || {}; } catch (e) {}
const r3 = (x) => Math.round(x * 1000) / 1000, r2 = (x) => Math.round(x * 100) / 100;
const out = { u: t, p: price, pe: pExp, ps: src };
for (const [k, id] of Object.entries(DEV)) {
  let d; try { d = await Homey.devices.getDevice({ id }); } catch (e) { continue; }
  const c = d.capabilitiesObj || {};
  const kwh = c.meter_power && c.meter_power.value != null ? Number(c.meter_power.value) : null;
  const w = c.measure_power ? Number(c.measure_power.value) || 0 : 0;
  const s = S[k] || (S[k] = { since: t, last: kwh });
  if (kwh != null) {
    let dk = s.last == null ? 0 : kwh - s.last;
    if (dk < 0) dk = kwh;            // mätaren nollställd
    s.last = kwh;
    const kr = price == null ? 0 : dk * price;
    // dygn (räknas in i det gamla dygnet först, sedan byte vid midnatt)
    if (!s.day) { s.day = day; s.dkwh = 0; s.dkr = 0; s.dfrom = hm; }
    s.dkwh += dk; s.dkr += kr;
    if (s.day !== day) { s.yday = { d: s.day, kwh: r3(s.dkwh), kr: r2(s.dkr), from: s.dfrom || null }; s.day = day; s.dkwh = 0; s.dkr = 0; s.dfrom = null; }
    // månad
    if (!s.mon) { s.mon = mon; s.mkwh = 0; s.mkr = 0; s.mfrom = day; }
    s.mkwh += dk; s.mkr += kr;
    if (s.mon !== mon) { s.prevMon = { m: s.mon, kwh: r3(s.mkwh), kr: r2(s.mkr), from: s.mfrom || null }; s.mon = mon; s.mkwh = 0; s.mkr = 0; s.mfrom = null; }
    // disk-/tvättpass
    const C = CYCLE[k];
    if (C) {
      if (s.run) {
        s.run.kwh += dk; s.run.kr += kr;
        if (w > C.off) s.run.idle = null; else if (!s.run.idle) s.run.idle = t;
        if (s.run.idle && t - s.run.idle >= C.idle * 60000) {
          if (s.run.kwh >= 0.02) s.lastRun = { start: s.run.start, end: s.run.idle, kwh: r3(s.run.kwh), kr: r2(s.run.kr) };
          log('Klart', k, s.run.kwh.toFixed(3), 'kWh', s.run.kr.toFixed(2), 'kr');
          s.run = null;
        }
      } else if (w >= C.on) { s.run = { start: t, kwh: 0, kr: 0, idle: null }; log('Start', k); }
    }
  }
  out[k] = {
    id, n: String(d.name || '').trim(), w, since: s.since,
    today: s.day ? { d: s.day, kwh: r3(s.dkwh), kr: r2(s.dkr), from: s.dfrom || null } : null,
    yday: s.yday || null,
    month: s.mon ? { m: s.mon, kwh: r3(s.mkwh), kr: r2(s.mkr), from: s.mfrom || null } : null,
    prevMonth: s.prevMon || null,
    last: s.lastRun || null,
    run: s.run ? { start: s.run.start, kwh: r3(s.run.kwh), kr: r2(s.run.kr) } : null,
  };
}
// Nätet idag (Elmätare). Köpt: mätarställningen × kvartens köppris (första gången ifylld från Homeys historik).
// Sålt: Tibber-appen uppdaterar inte mätarställningen för såld el, så den räknas från effekten varje minut × spotpris.
const GRID = '2b5aab67-5453-47c7-91eb-3807ecd28135';
try {
  const g = await Homey.devices.getDevice({ id: GRID }); const gc = g.capabilitiesObj || {};
  const num = (k) => (gc[k] && gc[k].value != null ? Number(gc[k].value) : null);
  const imp = num('meter_power.imported'), wNow = num('measure_power');
  let G = S.grid;
  // Ny dag-start eller ändrad prisformel i Homey Energy: räkna om dagens köpt från historiken (sålt behålls)
  if (!G || (G.f !== (P.f || '') && G.day === day)) {
    const keep = G ? { lt: G.lt, ek: G.ek, ekr: G.ekr, efrom: G.efrom, yday: G.yday, pm: G.pm, pmJob: G.pmJob, seed: G.seed } : {};
    G = S.grid = { day, ik: 0, ikr: 0, li: imp, from: hm, bf: '', f: P.f || '', ...keep };
    try {
      const r = await Homey.insights.getLogEntries({ id: 'homey:device:' + GRID + ':meter_power.imported', resolution: 'today' });
      const list = (r && (r.values || r.entries)) || [];
      let k = 0, kr = 0;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i]; if (a.v == null || b.v == null) continue;
        const dk = b.v - a.v; if (dk <= 0) continue;
        const p = slot(Date.parse(a.t), 'imp'); if (p == null) continue;
        k += dk; kr += dk * p;
      }
      if (list.length) { G.ik = k; G.ikr = kr; G.li = list[list.length - 1].v; G.from = null; G.bf = 'ok ' + list.length; } else G.bf = 'tom historik';
    } catch (e) { G.bf = 'fel: ' + e.message; }
  }
  if (G.lt == null) { G.lt = t; G.ek = 0; G.ekr = 0; G.efrom = hm; }
  // Engångsstart 5 nov: såld el före 13:04 enligt Tibber-appen (9,39 kWh / 10,51 kr kl 13:10, minus ca 0,57 kWh räknat 13:04–13:10) + Ellevios 3,2 öre
  if (!G.seed && day === '2026-11-05') { G.ek += 8.82; G.ekr += 9.88 + 8.82 * NAT_PROD; G.efrom = null; G.seed = 'tibber'; }
  // Månaden hittills: avslutade dagar fylls första gången i från Homeys timhistorik × timmens snittpris (Homey Energy)
  const dayStart = (() => { const d = (P.days || []).find((x) => x.d === day); return d ? Date.parse(d.s) : t - ((loc.getHours() * 60 + loc.getMinutes()) * 60 + loc.getSeconds()) * 1000; })();
  // Hjälpfunktioner för historik: Homeys timvärden för Elmätaren × timmens snittpris (Homey Energy, er formel)
  const calc = (p) => { const e = String(P.f || '[[price]]').replace(/\[\[price\]\]/g, '(' + p + ')'); return /^[\d\s.+\-*/()]+$/.test(e) ? Function('return ' + e)() : p; };
  const ymdL = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const ent = async (cap, res) => { const r = await Homey.insights.getLogEntries({ id: 'homey:device:' + GRID + ':' + cap, resolution: res }); return (r && (r.values || r.entries)) || []; };
  const histMonth = async (li, le, match, end) => {
    const dates = new Set(); li.concat(le).forEach((x) => { const ts = Date.parse(x.t); if (ts < end && match(ymdL(ts))) dates.add(ymdL(ts)); });
    const spot = [];
    for (const ds of dates) { try { const r = await Homey.energy.fetchDynamicElectricityPrices({ date: ds }); for (const q of (r && r.pricesPerInterval) || []) spot.push([Date.parse(q.periodStart), Number(q.value)]); } catch (e) {} }
    const avgSpot = (x, y) => { let sum = 0, n = 0; for (const [ts, v] of spot) if (ts >= x && ts < y) { sum += v; n++; } return n ? sum / n : null; };
    const tot = (list, fn) => {
      let k = 0, kr = 0;
      for (let i = 1; i < list.length; i++) {
        const p0 = list[i - 1], p1 = list[i], ta = Date.parse(p0.t), tb = Date.parse(p1.t);
        if (tb > end || !match(ymdL(ta)) || p0.v == null || p1.v == null) continue;
        const dk = p1.v - p0.v; if (dk <= 0) continue;
        const sp = avgSpot(ta, tb); if (sp == null) continue;
        k += dk; kr += dk * fn(sp);
      }
      return { k, kr };
    };
    const ti = tot(li, calc), te = tot(le, (sp) => sp + NAT_PROD);
    return { ik: ti.k, ikr: ti.kr, ek: te.k, ekr: te.kr, est: 'ok ' + li.length + '/' + le.length + '/' + spot.length };
  };
  // Månaden hittills: avslutade dagar fylls första gången i från historiken, därefter läggs varje avslutad dag till
  if (!G.mon) {
    G.mon = mon; G.mi = 0; G.mikr = 0; G.me = 0; G.mekr = 0; G.mest = '';
    try {
      const h = await histMonth(await ent('meter_power.imported', 'thisMonth'), await ent('meter_power.exported', 'thisMonth'), (d) => d.slice(0, 7) === mon, dayStart);
      G.mi = h.ik; G.mikr = h.ikr; G.me = h.ek; G.mekr = h.ekr; G.mest = h.est;
    } catch (e) { G.mest = 'fel: ' + e.message; }
  }
  // Föregående månad: fylls i från historiken i små steg (3 dagar per körning, så skriptet hinner klart), sparas sedan vid varje månadsskifte
  if (!G.pm) {
    const pmKey = (() => { const y = loc.getFullYear(), m = loc.getMonth(); return m === 0 ? (y - 1) + '-12' : y + '-' + p2(m); })();
    const J = G.pmJob && G.pmJob.m === pmKey ? G.pmJob : (G.pmJob = { m: pmKey, next: 1, ik: 0, ikr: 0, ek: 0, ekr: 0 });
    const nDays = new Date(Number(pmKey.slice(0, 4)), Number(pmKey.slice(5, 7)), 0).getDate();
    try {
      const firstNow = async (cap) => (await ent(cap, 'thisMonth')).slice(0, 1);
      const li = (await ent('meter_power.imported', 'lastMonth')).concat(await firstNow('meter_power.imported'));
      const le = (await ent('meter_power.exported', 'lastMonth')).concat(await firstNow('meter_power.exported'));
      for (let n = 0; n < 3 && J.next <= nDays; n++, J.next++) {
        const ds = pmKey + '-' + p2(J.next);
        const h = await histMonth(li, le, (d) => d === ds, dayStart);
        J.ik += h.ik; J.ikr += h.ikr; J.ek += h.ek; J.ekr += h.ekr;
      }
      if (J.next > nDays) { G.pm = { m: pmKey, ik: r3(J.ik), ikr: r2(J.ikr), ek: r3(J.ek), ekr: r2(J.ekr), est: 'historik' }; delete G.pmJob; }
    } catch (e) { log('Förra månaden', e.message); }
  }
  let di = imp != null && G.li != null ? imp - G.li : 0;
  if (di < 0 || di > 50) di = 0;   // nollställd mätare eller glapp
  if (imp != null) G.li = imp;
  const dtH = Math.min(Math.max(t - G.lt, 0), 5 * 60000) / 3.6e6; G.lt = t;
  const de = wNow != null && wNow < 0 ? (-wNow / 1000) * dtH : 0;
  G.ik += di; G.ikr += di * (price || 0); G.ek += de; G.ekr += de * (pExp || 0);
  if (G.day !== day) {
    G.yday = { d: G.day, ik: r3(G.ik), ikr: r2(G.ikr), ek: r3(G.ek), ekr: r2(G.ekr), from: G.from, efrom: G.efrom };
    G.mi += G.ik; G.mikr += G.ikr; G.me += G.ek; G.mekr += G.ekr;
    if (G.mon !== mon) { G.pm = { m: G.mon, ik: r3(G.mi), ikr: r2(G.mikr), ek: r3(G.me), ekr: r2(G.mekr) }; G.mon = mon; G.mi = G.mikr = G.me = G.mekr = 0; G.mest = 'ny månad'; }
    G.day = day; G.ik = G.ikr = G.ek = G.ekr = 0; G.from = null; G.efrom = null;
  }
  out.grid = { d: G.day, imp: { kwh: r3(G.ik), kr: r2(G.ikr), from: G.from || null }, exp: { kwh: r3(G.ek), kr: r2(G.ekr), from: G.efrom || null }, bf: G.bf || '', yday: G.yday || null,
    month: { m: G.mon, imp: { kwh: r3(G.mi + G.ik), kr: r2(G.mikr + G.ikr) }, exp: { kwh: r3(G.me + G.ek), kr: r2(G.mekr + G.ekr) }, est: G.mest || '' }, prevMonth: G.pm || null };
} catch (e) { log('Elmätare', e.message); }
global.set('elf', JSON.stringify(S));
if (vOut) await Homey.logic.updateVariable({ id: vOut.id, variable: { value: JSON.stringify(out) } });
return true;
