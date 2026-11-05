// Homevolt-vakt: larmar (1) när batteriet slutar rapportera till Homey och (2) när det har kontakt men står still i felläge.
// Sant = ny händelse, då skickas push. Skapad 2026-11-02, driftvakt tillagd 2026-11-05.
const ID = 'bb92dcb1-6a8b-4ce3-ad55-57eec631ec8c';
const LIMIT_MIN = 15;      // kontaktvakt: inga nya värden på så här länge = nere
const FAULT_MIN = 15;      // driftvakt: avvikelsen måste hålla i sig så här länge
const d = await Homey.devices.getDevice({ id: ID });
const C = d.capabilitiesObj || {};
const v = (k) => (C[k] ? C[k].value : null);
const ts = Object.values(C).map((c) => (c && c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0));
const last = Math.max(0, ...ts);
const ageMin = last ? (Date.now() - last) / 60000 : 999;
const down = d.available === false || ageMin > LIMIT_MIN;
const fmt = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).slice(0, 16);
const kW = (w) => (Math.abs(w) / 1000).toFixed(1).replace('.', ',') + ' kW';

// Driftvakt: Homevolts status okänd/fel, eller beordrad effekt som inte levereras (inte när batteriet är fullt/tomt)
const st = String(v('battery_status') || '');
const tgt = Number(v('measure_power.target_power')) || 0;
const pw = Number(v('measure_power')) || 0;
const soc = Number(v('measure_battery'));
const badSt = /okänd|unknown|fel|fault|error|alarm/i.test(st);
const charge = tgt < 0;                    // negativ = ladda
const room = isNaN(soc) ? true : charge ? soc < 97 : soc > 5;
const stuck = Math.abs(tgt) >= 500 && Math.abs(pw) < 50 && room;
const sus = !down && (badSt || stuck);
if (sus && !global.get('hvSusSince')) global.set('hvSusSince', Date.now());
if (!sus) global.set('hvSusSince', null);
const susSince = global.get('hvSusSince');
const fault = sus && susSince && Date.now() - susSince >= FAULT_MIN * 60000;
const why = (stuck ? 'beordrad att ' + (charge ? 'ladda ' : 'ladda ur ') + kW(tgt) + ' men levererar ' + Math.round(Math.abs(pw)) + ' W' : '') + (stuck && badSt ? ', ' : '') + (badSt ? 'status "' + st + '"' : '');

const vars = Object.values(await Homey.logic.getVariables());
const setVar = async (n, val) => { const x = vars.find((y) => y.name === n); if (x) await Homey.logic.updateVariable({ id: x.id, variable: { value: val } }); };
const getVar = (n) => { const x = vars.find((y) => y.name === n); return x ? String(x.value || '') : ''; };
const dur = (since) => { const m = Math.round((Date.now() - since) / 60000); return m >= 60 ? (m / 60).toFixed(1).replace('.', ',') + ' h' : m + ' min'; };

let msgs = [];
// Kontaktvakt
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
// Driftvakt
const wasF = global.get('hvFault') === true;
if (fault && !wasF) {
  global.set('hvFault', true);
  global.set('hvFaultAt', susSince);
  msgs.push('Homevolt står still sedan ' + fmt(susSince) + ': ' + why + '. Kontakten fungerar, felet sitter i batterisystemet.');
} else if (!sus && wasF) {
  const since = global.get('hvFaultAt') || Date.now();
  global.set('hvFault', false);
  msgs.push('Homevolt är i drift igen. Stilleståndet varade ca ' + dur(since) + ' (från ' + fmt(since) + ').');
}

await setVar('AI Homevolt status',
  down ? 'Ingen kontakt sedan ' + (last ? fmt(last) : 'okänt')
  : global.get('hvFault') === true ? 'FEL sedan ' + fmt(global.get('hvFaultAt')) + ': ' + why
  : 'OK, senaste data ' + fmt(last));
const msg = msgs.join(' ');
if (msg) {
  const old = getVar('AI Homevolt logg').split('\n').filter((l) => l && l !== '-');
  await setVar('AI Homevolt logg', [fmt(Date.now()) + ' ' + msg, ...old].slice(0, 30).join('\n'));
  await setVar('AI Homevolt händelse', msg);
}
log('Ålder min:', ageMin.toFixed(1), 'Nere:', down, 'Misstänkt:', sus, why || '-', 'Fel:', !!fault, 'Händelse:', msg || '-');
return !!msg;
