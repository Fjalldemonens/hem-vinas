// AI 15 · Solladdning. Körs var 30:e sekund (sedan 2026-11-08 14:10, tidigare varje minut).
// Variabeln "AI Solladdning" (Ja/Nej) slås på av knappen "Laddning sol" i Hem Vinäs.
// På:  Tibbers smartladdning stängs av och Easee laddas bara med solöverskott (bilen före batteriet).
//      Moln = laddningen pausas och väntar på solen. 1-fas vid lite sol, 3-fas vid mycket.
// Av (tillbaka till Tibber) när: bilen är full (laddgräns i bilen), kabeln dras ur,
//      solen är borta för dagen, eller knappen slås av. Ström och faser återställs FÖRE Tibber tar över.
// Skriver "AI Solladdning status" (text) som appen visar i laddbox-kortet.

// === KONFIG (husspecifikt) ===
const CHARGER = '7a0e129f-ec95-4faf-8fc9-9142c056590b'; // Easee "Laddbox"
const GRID = '2b5aab67-5453-47c7-91eb-3807ecd28135';    // Tibber Pulse "Elmätare" (negativ = export)
const SOLAR = '51de5b89-b274-49fa-af84-6e131cffd533';   // "Solceller"
const BATTERY = 'bb92dcb1-6a8b-4ce3-ad55-57eec631ec8c'; // Homevolt
const BAT_SIGN = 1;      // +1 om batteriets measure_power är positiv vid laddning. VERIFIERA när batteriet går.
const V = 230;           // fasspänning
const A_MIN = 6, A_MAX = 16;
const START_W = 1600;    // starta 1-fas när snitt 3 min ≥ detta
const PAUSE_W = 1200;    // pausa när snitt 3 min < detta (moln)
const UP3_W = 4600;      // 1-fas → 3-fas när snitt 5 min ≥ detta
const DOWN1_W = 4000;    // 3-fas → 1-fas när snitt 5 min < detta
const MARGIN_W = 100;    // marginal så vi inte köper el
const DARK_W = 300;      // solen borta: produktion < detta ...
const DARK_MIN = 30;     // ... i så här många minuter → tillbaka till Tibber
const FULL_MIN = 6;      // erbjuden ström ≥ A_MIN men bilen tar < 100 W i så här många min → full
const SAMPLE_S = 30;     // flödets intervall i sekunder (snitten räknas i minuter oavsett intervall)
// Skydd för Easees moln (det har en gräns för antal anrop):
const MAX_CMD_H = 60;    // högst så här många kommandon per timme, sedan bara nödvändiga sänkningar
const ERR_MAX = 3;       // så här många fel i rad ...
const ERR_PAUSE_MIN = 5; // ... ger så här lång paus i kommandon (laddboxen ligger kvar på senaste värdet)
// === SLUT KONFIG ===

const vars = Object.values(await Homey.logic.getVariables());
const vOn = vars.find((x) => x.name === 'AI Solladdning');
const vSt = vars.find((x) => x.name === 'AI Solladdning status');
if (!vOn) return false;
const setVar = async (v, val) => { if (v && v.value !== val) await Homey.logic.updateVariable({ id: v.id, variable: { value: val } }); };
const card = (c, args) => Homey.flow.runFlowCardAction({ id: 'homey:device:' + CHARGER + ':' + c, args: args || {} });
const now = Date.now();
const kw = (w) => (w / 1000).toFixed(1).replace('.', ',') + ' kW';
const hm = () => new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });

const val = async (id, cap) => { try { const d = await Homey.devices.getDevice({ id }); const c = d.capabilitiesObj || {}; return c[cap] ? c[cap].value : null; } catch (e) { return null; } };

let S = {}; try { S = JSON.parse(global.get('solS') || '{}'); } catch (e) { S = {}; }
const save = () => global.set('solS', JSON.stringify(S));
const N = (min) => Math.max(1, Math.round(min * 60 / SAMPLE_S)); // antal mätvärden för ett snitt över min minuter
// Kommando till Easee med räknare och felbroms
const cmd = async (c, args) => {
  S.cmds = (S.cmds || []).filter((t) => now - t < 3600000); S.cmds.push(now);
  try { await card(c, args); S.errs = 0; }
  catch (e) { S.errs = (S.errs || 0) + 1; if (S.errs >= ERR_MAX) S.errPause = now; throw e; }
};

// Återgång till Tibber: först ström/faser tillbaka, sedan smartladdning på.
const restore = async (why) => {
  try {
    const c = S.prevCircuit || 40, a = S.prevCharger || 16;
    await card('circuitCurrentControlPerPhase', { current1: c, current2: c, current3: c });
    await card('setDynamicChargerCurrent', { current: a });
    await card('enableSmartCharging');
  } catch (e) { await setVar(vSt, 'FEL vid återgång till Tibber ' + hm() + ': ' + e.message); return; }
  S = {}; save();
  await setVar(vOn, false);
  await setVar(vSt, 'Tibber · ' + why + ' ' + hm());
};

// Knappen avslagen
if (vOn.value !== true) {
  if (S.active) await restore('solladdning avslutad');
  return true;
}

// Läs mätvärden
const grid = Number(await val(GRID, 'measure_power')) || 0;
const solar = Math.max(0, Number(await val(SOLAR, 'measure_power')) || 0);
const chg = Number(await val(CHARGER, 'measure_power')) || 0;
const bat = BAT_SIGN * (Number(await val(BATTERY, 'measure_power')) || 0);
const plug = await val(CHARGER, 'evcharger_charging_state');
// Bilen först: det bilen tar nu + det batteriet laddar − det vi köper.
const surplus = Math.round(chg + bat - grid); // batteri som laddar räknas som ledigt, batteri som laddar ur räknas bort

// Nyss påslagen: spara läget, stäng av Tibber, börja pausat
if (!S.active) {
  S = { active: true, mode: 'off', hist: [], amps: 0, since: now,
    prevCircuit: Number(await val(CHARGER, 'target_circuit_current')) || 40,
    prevCharger: Number(await val(CHARGER, 'target_charger_current')) || 16 };
  try {
    await card('setDynamicChargerCurrent', { current: 0 });
    await card('disableSmartCharging');
  } catch (e) { S = {}; save(); await setVar(vOn, false); await setVar(vSt, 'FEL vid start ' + hm() + ': ' + e.message); return false; }
}

// Avslut: kabel ur
if (plug === 'plugged_out') { await restore('bilen urkopplad'); return true; }

// Avslut: solen borta för dagen
if (solar < DARK_W) { S.darkSince = S.darkSince || now; } else S.darkSince = null;
if (S.darkSince && now - S.darkSince >= DARK_MIN * 60000) { await restore('solen borta för dagen'); return true; }

// Avslut: bilen full (vi erbjuder ström men bilen tar inget)
if (S.amps >= A_MIN && chg < 100 && S.ampsSince && now - S.ampsSince >= 3 * 60000) { S.idleSince = S.idleSince || now; } else S.idleSince = null;
if (S.idleSince && now - S.idleSince >= FULL_MIN * 60000) { await restore('bilen full'); return true; }

// De första 2 min efter start mäts inget: om Tibber laddade bilen när knappen trycktes
// syns den laddningen som falskt överskott (t.ex. 8,7 kW vid premiären 2026-11-08 13:48).
if (now - S.since < 120000) { S.hist = []; save(); await setVar(vSt, 'Sol · startar, mäter överskott … ' + hm()); return true; }

// Glidande snitt
S.hist = (S.hist || []).concat(surplus).slice(-N(5));
const avg = (n) => { const h = S.hist.slice(-n); return h.reduce((a, b) => a + b, 0) / h.length; };
const a3 = S.hist.length >= N(3) ? avg(N(3)) : -1e9, a5 = S.hist.length >= N(5) ? avg(N(5)) : -1e9;

// Lägesbyte med hysteres
let mode = S.mode;
if (mode === 'off' && a3 >= START_W) mode = '1p';
else if (mode === '1p' && a5 >= UP3_W) mode = '3p';
else if (mode === '3p' && a5 < DOWN1_W) mode = '1p';
// Moln: pausa när snittet 3 min är för lågt och läget legat minst 3 min (inte samma minut som ett lägesbyte)
if (mode === S.mode && (mode === '1p' || mode === '3p') && a3 < PAUSE_W && now - (S.modeSince || now) >= 3 * 60000) mode = 'off';

const ph = mode === '3p' ? 3 : 1;
let amps = mode === 'off' ? 0 : Math.floor((surplus - MARGIN_W) / (V * ph));
if (mode !== 'off') amps = Math.min(A_MAX, Math.max(A_MIN, amps));
// Höjning först när två mätningar i rad räcker (sänkning direkt) – färre anrop när huset fladdrar
if (mode === S.mode && amps > S.amps && S.amps > 0) { if (!(S.upWant > S.amps)) { S.upWant = amps; amps = S.amps; } else { amps = Math.min(amps, S.upWant); S.upWant = 0; } } else S.upWant = 0;
// Easee-skydd: felpaus, och timkvot (då bara sänkningar och lägesbyten)
const paused = S.errPause && now - S.errPause < ERR_PAUSE_MIN * 60000;
const overQuota = (S.cmds || []).filter((t) => now - t < 3600000).length >= MAX_CMD_H;
if (paused || (overQuota && amps > S.amps && mode === S.mode)) { amps = S.amps; if (paused) mode = S.mode; }

try {
  if (mode !== S.mode) {
    S.modeSince = now; S.ampsSince = now;
    if (mode === '1p') await cmd('circuitCurrentControlPerPhase', { current1: A_MAX, current2: 0, current3: 0 });
    if (mode === '3p') await cmd('circuitCurrentControlPerPhase', { current1: A_MAX, current2: A_MAX, current3: A_MAX });
    S.mode = mode;
  }
  if (amps !== S.amps) {
    await cmd('setDynamicChargerCurrent', { current: amps });
    if (amps > 0 && S.amps === 0 && plug === 'plugged_in_paused') { try { await cmd('resumeCharging'); } catch (e) {} }
    S.amps = amps; S.ampsSince = now;
  }
} catch (e) { save(); await setVar(vSt, 'FEL ' + hm() + ': Easee svarade inte (' + e.message + ')' + (S.errPause ? ', pausar kommandon ' + ERR_PAUSE_MIN + ' min' : '')); return false; }

save();
await setVar(vSt, mode === 'off'
  ? 'Sol · väntar på sol (överskott ' + kw(Math.max(0, surplus)) + ') ' + hm()
  : 'Sol · ' + ph + '-fas ' + amps + ' A (överskott ' + kw(surplus) + ') ' + hm());
return true;
