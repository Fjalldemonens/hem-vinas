// AI 18 · Laddkostnad (2026-11-15, passlogik ändrad 2026-11-20). Laddboxens förbrukning och kostnad: effekten varje minut ×
// köppriset för kvarten (AI Elpriser, imp). Uppskattning: sol- och batterienergi räknas också till köppris, Grid Rewards ingår inte.
// Ett pass = från första Laddar tills bilen nått laddmålet eller kabeln dragits ur bilen. Smartladdningens stopp och start
// emellan hör till samma pass. Kabel/laddmål/laddnivå hämtas från bilens enhet (Volvo: ev_charging_state, measure_battery,
// charging_target_level, charging_system_status). Saknas bilen gäller reservregeln: laddningen still i IDLE_MIN min = klart.
// Skriver variabeln AI Laddkostnad.
// === KONFIG (husspecifikt) ===
const EV = '';            // laddboxens id; tomt = hittas på klass evcharger med measure_power
const CAR = '';           // bilens id; tomt = hittas på enhet med charging_target_level + measure_battery
const IDLE_MIN = 10;      // reservregel utan bil: minuter utan laddning som avslutar ett pass
const DONE_WAIT_MIN = 2;  // laddmål nått: så många minuter utan laddning innan passet stängs
const MAX_OPEN_H = 48;    // säkerhetsventil: öppet pass utan laddning så här länge stängs ändå
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
// Bilen (för kabel, laddmål och laddnivå)
let car = null, cid = CAR || S.cid;
if (cid) { try { car = await Homey.devices.getDevice({ id: cid }); } catch (e) { cid = null; } }
if (!car) {
  try {
    const all2 = Object.values(await Homey.devices.getDevices());
    car = all2.find((x) => x.capabilitiesObj && x.capabilitiesObj.charging_target_level && x.capabilitiesObj.measure_battery) || null;
    if (car) S.cid = car.id;
  } catch (e) {}
}
const cc = (car && car.capabilitiesObj) || {};
const cv = (k) => (cc[k] && cc[k].value != null ? cc[k].value : null);
const cst = cv('ev_charging_state'), soc = cv('measure_battery') != null ? Number(cv('measure_battery')) : null, tgt = cv('charging_target_level') != null ? Number(cv('charging_target_level')) : null, sys = cv('charging_system_status');
const c = dev.capabilitiesObj || {};
const st = c.evcharger_charging_state ? c.evcharger_charging_state.value : null;
const w = Number(c.measure_power && c.measure_power.value) || 0;
const dtH = Math.min(Math.max(t - (S.lt || t), 0), 5 * 60000) / 3.6e6; S.lt = t;
const dk = st === 'plugged_in_charging' || w > 100 ? (w / 1000) * dtH : 0;
const dr = price == null ? 0 : dk * price;
if (!S.mon) { S.mon = mon; S.mk = 0; S.mr = 0; S.from = day; }
if (S.mon !== mon) { S.pm = { m: S.mon, kwh: r3(S.mk), kr: r2(S.mr), from: S.from || null }; S.mon = mon; S.mk = 0; S.mr = 0; S.from = null; }
S.mk += dk; S.mr += dr;
const eaOut = st === 'plugged_out';
const unplugged = car && cst != null ? cst === 'plugged_out' : eaOut;   // kabeln ur: bilens enhet först, annars laddboxen
S.out = unplugged ? (S.out || 0) + 1 : 0;                                // två körningar i rad (ca 2 min) mot flimmer
const atTgt = soc != null && tgt != null && soc >= tgt;
if (S.lock && (S.out >= 2 || !atTgt)) S.lock = false;                    // spärren efter laddmål släpps vid urdragen kabel eller höjt laddmål
if (dk > 0 && !S.cur && !S.lock) S.cur = { start: t, kwh: 0, kr: 0, from: soc != null ? Math.round(soc) : null };
if (S.cur && dk > 0) { S.cur.kwh += dk; S.cur.kr += dr; S.cur.seen = t; }
if (S.cur && dk === 0) {
  const idleMs = t - S.cur.seen;
  let why = null;
  if (S.out >= 2) why = 'ur';
  else if (car && (atTgt || sys === 'DONE') && idleMs >= DONE_WAIT_MIN * 60000) why = 'mal';
  else if (!car && idleMs > IDLE_MIN * 60000) why = 'still';
  else if (idleMs > MAX_OPEN_H * 3600000) why = 'ur';
  if (why) {
    if (S.cur.kwh > 0.05) S.last = { start: S.cur.start, end: S.cur.seen, kwh: r3(S.cur.kwh), kr: r2(S.cur.kr), from: S.cur.from == null ? null : S.cur.from, to: soc != null ? Math.round(soc) : null };
    if (why === 'mal') S.lock = true;
    S.cur = null;
  }
}
global.set('evk', JSON.stringify(S));
const out = { u: t, p: price, last: S.last || null, cur: S.cur ? { kwh: r3(S.cur.kwh), kr: r2(S.cur.kr), from: S.cur.from == null ? null : S.cur.from, pause: dk === 0 } : null,
  month: { m: S.mon, kwh: r3(S.mk), kr: r2(S.mr), from: S.from || null }, prevMonth: S.pm || null };
await Homey.logic.updateVariable({ id: vOut.id, variable: { value: JSON.stringify(out) } });
return true;
