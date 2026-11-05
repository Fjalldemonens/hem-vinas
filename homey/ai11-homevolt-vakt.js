// Homevolt-vakt (AI 11), var 5:e min. Sant = ny händelse, då skickas push.
// (1) Kontaktvakt: Homevolt-enheten i Homey har inte rapporterat på 15 min / är otillgänglig.
// (2) Modulvakt: läser Homevolts lokala sida http://192.168.1.168/ems.json och larmar när en batterimodul
//     inte är "Connected" eller har alarm i 1 h. Moduler i IGNORE hoppas över till och med angivet datum.
// Skapad 2026-11-02. Modulvakt 2026-11-05 (BAT00 trasig, byte bokat 2026-11-25).
const ID = 'bb92dcb1-6a8b-4ce3-ad55-57eec631ec8c';
const EMS_URL = 'http://192.168.1.168/ems.json';
const IGNORE = { 0: '2026-11-25' };   // modul-id: ignoreras t.o.m. detta datum
const LIMIT_MIN = 15;                 // kontaktvakt
const FAULT_MIN = 60;                 // modulvakt: felet måste hålla i sig så här länge
const fmt = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).slice(0, 16);
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const dur = (since) => { const m = Math.round((Date.now() - since) / 60000); return m >= 60 ? (m / 60).toFixed(1).replace('.', ',') + ' h' : m + ' min'; };

// Kontakt via Homey
const d = await Homey.devices.getDevice({ id: ID });
const ts = Object.values(d.capabilitiesObj || {}).map((c) => (c && c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0));
const last = Math.max(0, ...ts);
const ageMin = last ? (Date.now() - last) / 60000 : 999;
const down = d.available === false || ageMin > LIMIT_MIN;

// Moduler via Homevolts lokala sida
let mods = null, emsErr = '';
try {
  const j = await Promise.race([
    fetch(EMS_URL).then((r) => r.json()),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
  ]);
  mods = (((j.ems || [])[0] || {}).bms_data || []).map((m, i) => ({ id: m.id != null ? m.id : i, ...m }));
} catch (e) { emsErr = String(e.message || e); }
const name = (m) => 'BAT0' + m.id;
const ignored = (m) => IGNORE[m.id] && today <= IGNORE[m.id];
const bad = (mods || []).filter((m) => !ignored(m) && (m.state_str !== 'Connected' || Number(m.alarm) !== 0));
const why = bad.map((m) => name(m) + ' ' + (m.state_str || 'okänd status') + ((m.alarm_str || []).length ? ' (' + m.alarm_str.map((a) => a.replace(/^EMS_ALARM_(BAT_)?/, '').replace(/_ALARM$/, '').toLowerCase().replace(/_/g, ' ')).join(', ') + ')' : '')).join('; ');

const sus = !down && bad.length > 0;
if (sus && !global.get('hvSusSince')) global.set('hvSusSince', Date.now());
if (!sus) global.set('hvSusSince', null);
const susSince = global.get('hvSusSince');
const fault = sus && susSince && Date.now() - susSince >= FAULT_MIN * 60000;

const vars = Object.values(await Homey.logic.getVariables());
const setVar = async (n, val) => { const x = vars.find((y) => y.name === n); if (x) await Homey.logic.updateVariable({ id: x.id, variable: { value: val } }); };
const getVar = (n) => { const x = vars.find((y) => y.name === n); return x ? String(x.value || '') : ''; };

const msgs = [];
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

const ign = (mods || []).filter(ignored).map((m) => name(m) + ' ignoreras t.o.m. ' + IGNORE[m.id]).join(', ');
await setVar('AI Homevolt status',
  down ? 'Ingen kontakt sedan ' + (last ? fmt(last) : 'okänt')
  : global.get('hvFault') === true ? 'FEL sedan ' + fmt(global.get('hvFaultAt')) + ': ' + (why || global.get('hvFaultWhy') || 'batterimodul i fel')
  : 'OK, senaste data ' + fmt(last) + (emsErr ? ' (lokal sida svarar inte)' : ign ? ' (' + ign + ')' : ''));
const msg = msgs.join(' ');
if (msg) {
  const old = getVar('AI Homevolt logg').split('\n').filter((l) => l && l !== '-');
  await setVar('AI Homevolt logg', [fmt(Date.now()) + ' ' + msg, ...old].slice(0, 30).join('\n'));
  await setVar('AI Homevolt händelse', msg);
}
log('Ålder min:', ageMin.toFixed(1), 'Nere:', down, 'Moduler:', mods ? mods.map((m) => name(m) + ':' + m.state_str + (ignored(m) ? '(ign)' : '')).join(' ') : 'fel ' + emsErr, 'Fel:', !!fault, 'Händelse:', msg || '-');
return !!msg;
