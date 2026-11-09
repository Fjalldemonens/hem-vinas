// AI 16 · Termostater. Körs varje minut.
// Gör en vanlig på/av-enhet (puck/uttag till ett element) till en termostat: ärvärde från en givare (valfri temperatur-capability, `cap`),
// börvärde och på/av från variabeln "AI Termostater" som appen Hem Vinäs skriver.
// Skriver "AI Termostat status" (JSON) som appen visar i Värme-kortet.
//   AI Termostater:      {"Badrum":{"sp":22,"on":true}}            (appen skriver, skriptet läser)
//   AI Termostat status: {"Badrum":{"t":22.4,"h":52,"heat":true,"u":1731130000000,"err":""}}

// === KONFIG (husspecifikt) ===
const ROOMS = {
  Badrum: { heater: 'dc366413-f3e0-426e-b3f2-68f98b14b8a5',   // "Element " (puck i uttaget)
            sensor: 'ceb98956-c246-43c9-8e9c-57c2d24115a2',    // "Z-TRM6 badrum" (golvvärmetermostaten) ...
            cap: 'measure_temperature.internal' },             // ... dess inbyggda rumsgivare (measure_temperature = golvet). Tidigare "Temp badrum" eb3031b5-…, tyst sedan aug 2026
};
const DEFAULT_SP = 22;   // börvärde om appen inte satt något
const ON_BELOW = 0.3;    // slå på när ärvärdet är så här mycket under börvärdet ...
const OFF_ABOVE = 0.2;   // ... och av när det är så här mycket över (hysteres, skonar reläet)
const MIN_SWITCH_MIN = 5; // minst så här många minuter mellan två omslag
const STALE_MIN = 180;   // givaren tyst längre än så här → elementet av (säkerhet)
const MAX_T = 30;        // över detta → alltid av (säkerhet)
const SP_MIN = 5, SP_MAX = 28;
// === SLUT KONFIG ===

const vars = Object.values(await Homey.logic.getVariables());
const vCfg = vars.find((x) => x.name === 'AI Termostater');
const vSt = vars.find((x) => x.name === 'AI Termostat status');
let cfg = {}; try { cfg = JSON.parse((vCfg && vCfg.value) || '{}') || {}; } catch (e) { cfg = {}; }
let S = {}; try { S = JSON.parse(global.get('termS') || '{}') || {}; } catch (e) { S = {}; }
const now = Date.now();
const out = {};

for (const [name, r] of Object.entries(ROOMS)) {
  const c = cfg[name] || {};
  const on = c.on !== false;
  const sp = Math.min(SP_MAX, Math.max(SP_MIN, Number.isFinite(Number(c.sp)) ? Number(c.sp) : DEFAULT_SP));
  const st = S[name] || (S[name] = {});
  let t = null, h = null, tAt = 0, heaterOn = null, err = '';
  try {
    const d = await Homey.devices.getDevice({ id: r.sensor }); const co = d.capabilitiesObj || {};
    const tc = co[r.cap || 'measure_temperature'];
    if (tc && tc.value !== null) { t = Number(tc.value); tAt = new Date(tc.lastUpdated || 0).getTime(); }
    if (co.measure_humidity && co.measure_humidity.value !== null) h = Math.round(Number(co.measure_humidity.value));
  } catch (e) { err = 'givaren hittas inte'; }
  try {
    const d = await Homey.devices.getDevice({ id: r.heater }); const co = d.capabilitiesObj || {};
    heaterOn = co.onoff ? co.onoff.value === true : null;
    if (d.available === false) err = err || 'elementet svarar inte';
  } catch (e) { err = err || 'elementet hittas inte'; }

  // Önskat läge: av om avstängd, givare saknas/tyst eller för varmt; annars hysteres kring börvärdet.
  let want = heaterOn;
  if (!on) want = false;
  else if (t === null || !Number.isFinite(t)) { want = false; err = err || 'ingen temperatur från givaren'; }
  else if (tAt && now - tAt > STALE_MIN * 60000) { want = false; err = err || 'givaren tyst sedan ' + new Date(tAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' – byt batteri?'; }
  else if (t >= MAX_T) want = false;
  else if (t <= sp - ON_BELOW) want = true;
  else if (t >= sp + OFF_ABOVE) want = false;
  else if (heaterOn === null) want = false;

  // Säkerhetsavslag (av) går alltid igenom; vanliga omslag högst var MIN_SWITCH_MIN minut.
  const urgent = want === false && (!on || err || t >= MAX_T);
  if (heaterOn !== null && want !== heaterOn && (urgent || !st.sw || now - st.sw >= MIN_SWITCH_MIN * 60000)) {
    try {
      await Homey.devices.setCapabilityValue({ deviceId: r.heater, capabilityId: 'onoff', value: want });
      heaterOn = want; st.sw = now;
    } catch (e) { err = 'kunde inte styra elementet: ' + e.message; }
  }
  out[name] = { sp, on, t: t === null ? null : Math.round(t * 10) / 10, h, heat: heaterOn === true, u: now, err };
}

global.set('termS', JSON.stringify(S));
const txt = JSON.stringify(out);
if (vSt && vSt.value !== txt) await Homey.logic.updateVariable({ id: vSt.id, variable: { value: txt } });
return true;
