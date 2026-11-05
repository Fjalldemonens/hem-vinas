// Homevolt-vakt (AI 11), var 10:e min. Sant = ny händelse, då skickas push.
// (1) Kontaktvakt: Homevolt-enheten i Homey har inte rapporterat på 15 min / är otillgänglig.
// (2) Systemvakt: batteriet står still trots kontakt – nätfrekvens 0 Hz i Homey, eller EMS-alarm på den
//     lokala sidan – i minst 15 min. Medan en modul står i IGNORE loggas stoppet bara (ingen push, ingen
//     röd ruta), eftersom ett trasigt BAT00 väntas fälla systemet. Lades till efter stoppet 2026-11-05 16:05–20:45.
// (3) Modulvakt: läser Homevolts lokala sida http://192.168.1.168/ems.json och larmar när en batterimodul
//     inte är "Connected" eller har alarm i 1 h. Moduler i IGNORE hoppas över till och med angivet datum.
// (4) Lokal sida tyst > 30 min loggas (ingen push), liksom när den svarar igen.
// Skapad 2026-11-02. Modulvakt 2026-11-05 (BAT00 trasig, byte bokat 2026-11-25). Systemvakt 2026-11-05.
const ID = 'bb92dcb1-6a8b-4ce3-ad55-57eec631ec8c';
const EMS_URL = 'http://192.168.1.168/ems.json';
const IGNORE = { 0: '2026-11-25' };   // modul-id: ignoreras t.o.m. detta datum
const LIMIT_MIN = 15;                 // kontaktvakt
const STOP_MIN = 15;                  // systemvakt: stoppet måste hålla i sig så här länge
const FAULT_MIN = 60;                 // modulvakt: felet måste hålla i sig så här länge
const EMS_QUIET_MIN = 30;             // lokal sida tyst så här länge = loggas
const fmt = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).slice(0, 16);
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const dur = (since) => { const m = Math.round((Date.now() - since) / 60000); return m >= 60 ? (m / 60).toFixed(1).replace('.', ',') + ' h' : m + ' min'; };
const short = (a) => a.replace(/^EMS_(ALARM|WARNING)_(BAT_)?/, '').replace(/_(ALARM|WARNING)$/, '').toLowerCase().replace(/_/g, ' ');

// Kontakt via Homey
const d = await Homey.devices.getDevice({ id: ID });
const caps = d.capabilitiesObj || {};
const ts = Object.values(caps).map((c) => (c && c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0));
const last = Math.max(0, ...ts);
const ageMin = last ? (Date.now() - last) / 60000 : 999;
const down = d.available === false || ageMin > LIMIT_MIN;
const hz = caps.measure_frequency ? Number(caps.measure_frequency.value) : NaN;

// Lokala sidan
let ems = null, mods = null, emsErr = '';
try {
  const j = await Promise.race([
    fetch(EMS_URL).then((r) => r.json()),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
  ]);
  const e0 = (j.ems || [])[0] || {};
  ems = e0.ems_data || null;
  mods = (e0.bms_data || []).map((m, i) => ({ id: m.id != null ? m.id : i, ...m }));
} catch (e) { emsErr = String(e.message || e); }

// Systemvakt
const emsFlags = ems && Number(ems.alarm) !== 0 ? (ems.alarm_str || ['alarm ' + ems.alarm]) : [];   // OBS: warning DC_DISCONNECT finns kvar även när systemet går (BAT00 frånkopplad) – används inte
const stopWhy = [];
if (hz === 0) stopWhy.push('nätfrekvens 0 Hz');
if (emsFlags.length) stopWhy.push('EMS ' + (ems.state_str || '') + ': ' + emsFlags.map(short).join(', '));
const stopNow = !down && stopWhy.length > 0;
if (stopNow && !global.get('hvStopSince')) global.set('hvStopSince', Date.now());
if (!stopNow) global.set('hvStopSince', null);
const stopSince = global.get('hvStopSince');
const stop = stopNow && stopSince && Date.now() - stopSince >= STOP_MIN * 60000;

// Modulvakt
const name = (m) => 'BAT0' + m.id;
const ignored = (m) => IGNORE[m.id] && today <= IGNORE[m.id];
const stopQuiet = Object.values(IGNORE).some((dt) => today <= dt);   // känt fel, väntar på byte
const bad = (mods || []).filter((m) => !ignored(m) && (m.state_str !== 'Connected' || Number(m.alarm) !== 0));
const why = bad.map((m) => name(m) + ' ' + (m.state_str || 'okänd status') + ((m.alarm_str || []).length ? ' (' + m.alarm_str.map(short).join(', ') + ')' : '')).join('; ');
const sus = !down && bad.length > 0;
if (sus && !global.get('hvSusSince')) global.set('hvSusSince', Date.now());
if (!sus) global.set('hvSusSince', null);
const susSince = global.get('hvSusSince');
const fault = sus && susSince && Date.now() - susSince >= FAULT_MIN * 60000;

const vars = Object.values(await Homey.logic.getVariables());
const setVar = async (n, val) => { const x = vars.find((y) => y.name === n); if (x) await Homey.logic.updateVariable({ id: x.id, variable: { value: val } }); };
const getVar = (n) => { const x = vars.find((y) => y.name === n); return x ? String(x.value || '') : ''; };

const msgs = [];   // push + logg
const quiet = [];  // bara logg
const was = global.get('homevoltDown') === true;
if (down && !was) {
  global.set('homevoltDown', true);
  global.set('homevoltDownAt', last || Date.now());
  msgs.push('Homevolt har tappat kontakten. Senaste data ' + (last ? fmt(last) : 'okänd') + (d.available === false ? ' (otillgänglig i Homey)' : '') + '.');
} else if (!down && was) {
  const since = global.get('homevoltDownAt') || last;
  global.set('homevoltDown', false);
  msgs.push('Homevolt har kontakt igen. Avbrottet varade ca ' + dur(since) + ' (från ' + fmt(since) + ').');
}
const wasS = global.get('hvStop') === true;
if (stop && !wasS) {
  global.set('hvStop', true);
  global.set('hvStopAt', stopSince);
  global.set('hvStopWhy', stopWhy.join('; '));
  (stopQuiet ? quiet : msgs).push('Homevolt står still sedan ' + fmt(stopSince) + ' trots kontakt: ' + stopWhy.join('; ') + '.');
} else if (!stopNow && wasS && !down) {
  const since = global.get('hvStopAt') || Date.now();
  global.set('hvStop', false);
  (stopQuiet ? quiet : msgs).push('Homevolt är igång igen. Stoppet varade ca ' + dur(since) + ' (från ' + fmt(since) + ').');
}
const wasF = global.get('hvFault') === true;
if (fault && !wasF) {
  global.set('hvFault', true);
  global.set('hvFaultAt', susSince);
  global.set('hvFaultWhy', why);
  msgs.push('Homevolt: batterimodul i fel sedan ' + fmt(susSince) + ': ' + why + '.');
} else if (!sus && wasF && mods) {
  const since = global.get('hvFaultAt') || Date.now();
  global.set('hvFault', false);
  msgs.push('Homevolt: batterimodulerna är OK igen. Felet varade ca ' + dur(since) + ' (från ' + fmt(since) + ').');
}
if (emsErr && !global.get('hvEmsErrSince')) global.set('hvEmsErrSince', Date.now());
const emsErrSince = global.get('hvEmsErrSince');
if (emsErr && emsErrSince && Date.now() - emsErrSince >= EMS_QUIET_MIN * 60000 && global.get('hvEmsQuiet') !== true) {
  global.set('hvEmsQuiet', true);
  quiet.push('Homevolts lokala sida svarar inte sedan ' + fmt(emsErrSince) + ' (' + emsErr + '). Modulvakten är blind, systemvakten går på frekvensen.');
} else if (!emsErr) {
  if (global.get('hvEmsQuiet') === true) quiet.push('Homevolts lokala sida svarar igen (tyst ca ' + dur(emsErrSince || Date.now()) + ').');
  global.set('hvEmsQuiet', false);
  global.set('hvEmsErrSince', null);
}

const ignList = (mods || []).filter(ignored).map((m) => name(m) + ' ignoreras t.o.m. ' + IGNORE[m.id]).join(', ');
await setVar('AI Homevolt status',
  down ? 'Ingen kontakt sedan ' + (last ? fmt(last) : 'okänt')
  : global.get('hvStop') === true && !stopQuiet ? 'FEL sedan ' + fmt(global.get('hvStopAt')) + ': ' + (stopWhy.join('; ') || global.get('hvStopWhy'))
  : global.get('hvFault') === true ? 'FEL sedan ' + fmt(global.get('hvFaultAt')) + ': ' + (why || global.get('hvFaultWhy') || 'batterimodul i fel')
  : 'OK, senaste data ' + fmt(last) + (global.get('hvStop') === true ? ' (står still sedan ' + fmt(global.get('hvStopAt')).slice(11) + ', känt BAT00-fel)' : emsErr ? ' (lokal sida svarar inte)' : ignList ? ' (' + ignList + ')' : ''));
const all = [...msgs, ...quiet].join(' ');
if (all) {
  const old = getVar('AI Homevolt logg').split('\n').filter((l) => l && l !== '-');
  await setVar('AI Homevolt logg', [fmt(Date.now()) + ' ' + all, ...old].slice(0, 30).join('\n'));
}
const msg = msgs.join(' ');
if (msg) await setVar('AI Homevolt händelse', msg);
log('Ålder min:', ageMin.toFixed(1), 'Nere:', down, 'Hz:', hz, 'Stopp:', !!stop, stopWhy.join('; ') || '-', 'Moduler:', mods ? mods.map((m) => name(m) + ':' + m.state_str + (ignored(m) ? '(ign)' : '')).join(' ') : 'fel ' + emsErr, 'Fel:', !!fault, 'Händelse:', all || '-');
return !!msg;
