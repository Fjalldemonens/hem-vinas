// AI 18 · Laddkostnad (2026-11-15). Laddboxens förbrukning och kostnad: effekten varje minut × köppriset för kvarten
// (AI Elpriser, imp). Uppskattning: sol- och batterienergi räknas också till köppris. Ett pass = från Laddar tills bilen
// kopplas ur eller laddningen stått still i 10 min. Skriver variabeln AI Laddkostnad.
// === KONFIG (husspecifikt) ===
const EV = '';            // laddboxens id; tomt = hittas på klass evcharger med measure_power
const IDLE_MIN = 10;      // minuter utan laddning som avslutar ett pass
// === slut KONFIG ===
const t = Date.now();
const vars = Object.values(await Homey.logic.getVariables());
const vOut = vars.find((x) => x.name === 'AI Laddkostnad');
const vPris = vars.find((x) => x.name === 'AI Elpriser');
if (!vOut) return 'Variabeln AI Laddkostnad saknas';
const p2 = (n) => String(n).padStart(2, '0');
const loc = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
const day = loc.getFullYear() + '-' + p2(loc.getMonth() + 1) + '-' + p2(loc.getDate()), mon = day.slice(0, 7);
let P = {}; try { P = JSON.parse((vPris && vPris.value) || '{}') || {}; } catch (e) {}
let price = null;
for (const d of P.days || []) {
  const i = Math.floor((t - Date.parse(d.s)) / ((d.iv || 15) * 60000));
  if (i >= 0 && i < (d.imp || []).length) { price = Number(d.imp[i]); break; }
}
let S = {}; try { S = JSON.parse(global.get('evk') || '{}') || {}; } catch (e) {}
const r3 = (x) => Math.round(x * 1000) / 1000, r2 = (x) => Math.round(x * 100) / 100;
let id = EV || S.id;
let dev = null;
if (id) { try { dev = await Homey.devices.getDevice({ id }); } catch (e) { id = null; } }
if (!dev) {
  const all = Object.values(await Homey.devices.getDevices());
  dev = all.find((x) => x.class === 'evcharger' && x.capabilitiesObj && x.capabilitiesObj.measure_power);
  if (!dev) return 'Ingen laddbox hittades';
  S.id = dev.id;
}
const c = dev.capabilitiesObj || {};
const st = c.evcharger_charging_state ? c.evcharger_charging_state.value : null;
const w = Number(c.measure_power && c.measure_power.value) || 0;
const dtH = Math.min(Math.max(t - (S.lt || t), 0), 5 * 60000) / 3.6e6; S.lt = t;
const dk = st === 'plugged_in_charging' || w > 100 ? (w / 1000) * dtH : 0;
const dr = price == null ? 0 : dk * price;
if (!S.mon) { S.mon = mon; S.mk = 0; S.mr = 0; S.from = day; }
if (S.mon !== mon) { S.pm = { m: S.mon, kwh: r3(S.mk), kr: r2(S.mr), from: S.from || null }; S.mon = mon; S.mk = 0; S.mr = 0; S.from = null; }
S.mk += dk; S.mr += dr;
if (dk > 0) {
  if (!S.cur) S.cur = { start: t, kwh: 0, kr: 0 };
  S.cur.kwh += dk; S.cur.kr += dr; S.cur.seen = t;
}
if (S.cur && dk === 0 && (st === 'plugged_out' || t - S.cur.seen > IDLE_MIN * 60000)) {
  if (S.cur.kwh > 0.05) S.last = { start: S.cur.start, end: S.cur.seen, kwh: r3(S.cur.kwh), kr: r2(S.cur.kr) };
  S.cur = null;
}
global.set('evk', JSON.stringify(S));
const out = { u: t, p: price, last: S.last || null, cur: S.cur ? { kwh: r3(S.cur.kwh), kr: r2(S.cur.kr) } : null,
  month: { m: S.mon, kwh: r3(S.mk), kr: r2(S.mr), from: S.from || null }, prevMonth: S.pm || null };
await Homey.logic.updateVariable({ id: vOut.id, variable: { value: JSON.stringify(out) } });
return true;
