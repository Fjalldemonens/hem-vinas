// Städschema från Hem Vinäs-appen. Vid utsatt tid läggs schemat i en kö. När roboten är ledig i laddstationen
// ställs städläge, sugkraft, moppning och rutt in och ALLA valda rum startas i ETT jobb
// (Roborock-appens kort "Städa ett eller flera rum", med antal varv). Hela hemmet = kortet "Städa alla rum".
const vars = Object.values(await Homey.logic.getVariables());
const v = vars.find((x) => x.name === 'AI Städschema');
const vLog = vars.find((x) => x.name === 'AI Städlogg');
let S = {}; try { S = JSON.parse((v && v.value) || '{}'); } catch (e) { return false; }
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = p2(now.getHours()) + ':' + p2(now.getMinutes()), dow = now.getDay();
const stamp = now.toDateString() + ' ' + hhmm;
// Paus utan setTimeout (finns inte i HomeyScript, gav "FEL setTimeout is not defined" 2026-11-06 09:30):
// HomeyScripts inbyggda wait() om den finns, annars korta enhetsanrop tills tiden gått.
const pause = async (ms, devId) => {
  if (typeof wait === 'function') return wait(ms);
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await Homey.devices.getDevice({ id: devId }); } catch (e) {} }
};
const getQ = (id) => { try { return JSON.parse(global.get('stadq_' + id) || '[]'); } catch (e) { return []; } };
const putQ = (id, q) => global.set('stadq_' + id, JSON.stringify(q));
const logLines = [];
const note = (txt) => { logLines.push(p2(now.getDate()) + '/' + p2(now.getMonth() + 1) + ' ' + hhmm + ' ' + txt); log(txt); };
// 1. Lägg scheman som ska starta nu i kön (ett jobb per schema, med alla rum)
for (const [devId, list] of Object.entries(S)) {
  for (const e of list || []) {
    if (!e || !e.on || e.time !== hhmm || !(e.days || []).includes(dow)) continue;
    const k = 'stad_' + devId + '_' + e.id;
    if (global.get(k) === stamp) continue;
    global.set(k, stamp);
    const rooms = (e.rooms && e.rooms.length) ? e.rooms : (e.room ? [e.room] : []);
    const q = getQ(devId).filter((s) => Array.isArray(s.rooms));   // gamla steg från förra versionen slängs
    q.push({ e: e.id, at: Date.now(), mode: e.mode || null, suction: e.suction || null, scrub: e.scrub || null, route: e.route || null, rooms, repeat: Math.min(Math.max(Number(e.repeat) || 1, 1), 3) });
    putQ(devId, q);
  }
}
// 2. Starta nästa jobb när roboten är ledig. Roborock-appen uppdaterar status ungefär var 5:e minut,
//    därför minst 15 min mellan två starter så ett pågående jobb aldrig avbryts av gammal status.
let started = 0;
for (const devId of Object.keys(S)) {
  let q = getQ(devId).filter((s) => Array.isArray(s.rooms) && Date.now() - s.at < 6 * 3600e3);
  if (!q.length) { putQ(devId, q); continue; }
  const d = await Homey.devices.getDevice({ id: devId });
  const c = d.capabilitiesObj || {};
  const val = (k) => (c[k] ? c[k].value : null);
  const busy = val('is_cleaning') === true || val('dock') === false;
  const last = Number(global.get('stadlast_' + devId) || 0);
  if (busy || Date.now() - last < 15 * 60000) { putQ(devId, q); continue; }
  const s = q.shift(); putQ(devId, q);
  global.set('stadlast_' + devId, String(Date.now()));
  const set = (cap, value) => Homey.devices.setCapabilityValue({ deviceId: devId, capabilityId: cap, value });
  const names = s.rooms.map((id) => { const o = ((c.clean_room_pick && c.clean_room_pick.values) || []).find((x) => String(x.id) === String(id)); return o ? (typeof o.title === 'object' ? (o.title.sv || o.title.en) : o.title) : null; }).filter(Boolean);
  try {
    for (const [cap, value] of [['clean_mode', s.mode], ['suction_power', s.suction], ['scrub_intensity', s.scrub], ['mop_route', s.route]]) {
      if (value != null && c[cap] && String(val(cap)) !== String(value)) { await set(cap, value); await pause(2000, devId); }
    }
    if (names.length) {
      await Homey.flow.runFlowCardAction({ id: 'homey:device:' + devId + ':clean_room', args: { rooms: names.join(', '), repeat: s.repeat } });
      note(d.name.trim() + ': startade ' + names.join(', ') + (s.repeat > 1 ? ' (' + s.repeat + ' varv)' : '') + (q.length ? ', ' + q.length + ' i kö' : ''));
    } else {
      await Homey.flow.runFlowCardAction({ id: 'homey:device:' + devId + ':clean_all', args: {} });
      note(d.name.trim() + ': startade hela hemmet' + (q.length ? ', ' + q.length + ' i kö' : ''));
    }
    started++;
  } catch (err) { note(d.name.trim() + ': FEL ' + (err && err.message)); }
}
if (logLines.length && vLog) {
  const old = String(vLog.value || '').split('\n').filter((x) => x && x !== '-');
  await Homey.logic.updateVariable({ id: vLog.id, variable: { value: logLines.concat(old).slice(0, 15).join('\n') } });
}
return started > 0;
