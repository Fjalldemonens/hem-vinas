// AI 17 · Batterihistorik. Körs var 5:e minut.
// Läser husbatteriets laddnivå (measure_battery) ur Homeys Insights för idag och igår och skriver
// variabeln "AI Batterihistorik" som appen Hem Vinäs ritar som diagram under Husbatteri → Historik.
//   {"u":ms,"iv":5,"days":[{"d":"2026-11-14","v":[25.1,24,null,…]},{"d":"2026-11-13","v":[…]}]}
//   v = ett värde per 5-minutersfack från 00:00 lokal tid (288 per dygn), null = inget värde, en decimal.

// === KONFIG (husspecifikt) ===
const BATTERY = '';      // enhets-id; tomt = första enheten av typ battery som inte är en elbil (har inte charging_target_level)
const CAP = 'measure_battery';
const TZ = 'Europe/Stockholm';
const IV = 5;            // minuter per fack
// === SLUT KONFIG ===

let id = BATTERY;
if (!id) {
  const all = Object.values(await Homey.devices.getDevices());
  const b = all.find((d) => (d.class === 'battery' || d.virtualClass === 'battery') && d.capabilitiesObj && d.capabilitiesObj[CAP] && !d.capabilitiesObj.charging_target_level);
  if (!b) throw new Error('Inget husbatteri hittades');
  id = b.id;
}
const parts = (ms) => {
  const p = {}; for (const x of new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { d: p.year + '-' + p.month + '-' + p.day, slot: Math.floor((Number(p.hour) * 60 + Number(p.minute)) / IV) };
};
const N = 1440 / IV;
const days = {};
for (const res of ['today', 'yesterday']) {
  let r; try { r = await Homey.insights.getLogEntries({ id: 'homey:device:' + id + ':' + CAP, resolution: res }); } catch (e) { log('Insights ' + res + ': ' + e.message); continue; }
  for (const e of (r && (r.values || r.entries)) || []) {
    const v = Number(e.v); if (e.v === null || !Number.isFinite(v)) continue;
    const { d, slot } = parts(new Date(e.t).getTime());
    const arr = days[d] || (days[d] = new Array(N).fill(null));
    if (slot >= 0 && slot < N) arr[slot] = Math.round(v * 10) / 10;
  }
}
const today = parts(Date.now()).d;
const yest = parts(Date.now() - 86400000).d;
const out = { u: Date.now(), iv: IV, days: [today, yest].filter((d) => days[d]).map((d) => ({ d, v: days[d] })) };
const vars = Object.values(await Homey.logic.getVariables());
const vh = vars.find((x) => x.name === 'AI Batterihistorik');
if (!vh) throw new Error('Variabeln AI Batterihistorik saknas');
const txt = JSON.stringify(out);
if (vh.value !== txt) await Homey.logic.updateVariable({ id: vh.id, variable: { value: txt } });
log(out.days.map((x) => x.d + ': ' + x.v.filter((y) => y !== null).length + ' värden').join(', '));
return true;
