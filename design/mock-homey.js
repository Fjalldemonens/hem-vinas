// Hem Vinäs – låtsas-Homey för design och test utan inloggning.
// Användning lokalt (committa aldrig ändringen): byt <script src="homey.js?v=…"> mot <script src="design/mock-homey.js">
// i index.html, eller låt en ny design ladda den här filen. Den ger samma API och dataformat som homey.js.
// Värdena är representativa för huset i Vinäs (november 2026), inte live.
(() => {
  const now = Date.now(), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const cap = (title, type, extra) => Object.assign({ title, type, setable: false, units: null, at: now - 60000, values: null }, extra || {});
  const dev = (id, name, zone, type, state, caps, more) => Object.assign({ id, name, zone, type, available: true, state, caps: caps || {}, images: [], batteries: [], model: null }, more || {});
  const light = (id, name, zone, on, dim, color) => dev(id, name, zone, 'light',
    Object.assign({ onoff: on }, dim != null ? { dim } : {}, color ? { light_mode: 'color', light_hue: color[0], light_saturation: color[1], light_temperature: 0.5 } : {}),
    Object.assign({ onoff: cap('Påslagen', 'boolean', { setable: true }) }, dim != null ? { dim: cap('Ljusstyrka', 'number', { setable: true }) } : {}, color ? { light_hue: cap('Nyans', 'number', { setable: true }), light_saturation: cap('Mättnad', 'number', { setable: true }), light_mode: cap('Läge', 'enum', { setable: true }), light_temperature: cap('Färgtemperatur', 'number', { setable: true }) } : {}));
  const sensor = (id, name, zone, t, h, batt) => dev(id, name, zone, 'sensor', Object.assign({ measure_temperature: t }, h != null ? { measure_humidity: h } : {}, batt != null ? { measure_battery: batt } : {}),
    { measure_temperature: cap('Temperatur', 'number', { units: '°C' }), measure_humidity: cap('Luftfuktighet', 'number', { units: '%' }) }, { batteries: batt != null ? ['CR2477'] : [] });
  const rooms = (list) => list.map(([id, title]) => ({ id, title }));

  const DEVICES = [
    // Belysning
    light('l1', 'Fönster 1', 'Hem > Bottenvåningen > Vardagsrum', true, null),
    light('l2', 'Fönster 2', 'Hem > Bottenvåningen > Vardagsrum', true, null),
    light('l3', 'Hue lightstrip plus 1', 'Hem > Bottenvåningen > Vardagsrum > TV', true, 0.6, [0.07, 0.87]),
    light('l4', 'Kök söder', 'Hem > Bottenvåningen > Kök', true, 0.8),
    light('l5', 'Kök väster', 'Hem > Bottenvåningen > Kök', false, 0.8),
    light('l6', 'Hall 1', 'Hem > Bottenvåningen > Hall', false, 0.5),
    light('l7', 'Sänglampa Maria', 'Hem > Övervåning > Huvudsovrum', false, 0.5),
    light('l8', 'Fönster balkong', 'Hem > Övervåning > Hall uppe', true, 0.3),
    light('l9', 'Altan', 'Hem > Utomhus > Altan', false, 0.4),
    light('l10', 'Strålkastare 1', 'Hem > Utomhus > Strålkastare', false, null),
    // Givare
    sensor('s1', 'Bottenvåning', 'Hem > Bottenvåningen', 22.3, 43),
    sensor('s2', 'Temp kök', 'Hem > Bottenvåningen > Kök', 22.8, 44.6, 46),
    sensor('s3', 'Temp sovrum', 'Hem > Övervåning > Huvudsovrum', 20.6, 50.8, 100),
    sensor('s4', 'Temp Uffe', 'Hem > Övervåning > Sovrum', 19.9, 51.6, 8),
    dev('s5', 'Temp ute', 'Hem > Utomhus', 'sensor', { measure_temperature: -3.4, measure_luminance: 1620, measure_battery: 100, alarm_motion: false }, { measure_temperature: cap('Temperatur', 'number', { units: '°C' }), measure_luminance: cap('Luminans', 'number', { units: 'lx' }) }),
    dev('s6', 'Water Leak sensor T1', 'Hem > Källare > Värmepump', 'sensor', { alarm_water: false, measure_battery: 100 }, { alarm_water: cap('Vattenlarm', 'boolean') }),
    // Värme
    dev('h1', 'Bergvärmepump ', 'Hem > Källare > Värmepump', 'thermostat', { target_temperature: 22, measure_temperature: -3, 'measure_temperature.supply': 34, 'measure_temperature.return': 28, 'measure_temperature.brine_in': 3, 'measure_temperature.brine_out': 0, 'measure_temperature.hotwater': 52, thermia_status: 'heat', thermia_opmode: 'operation mode auto', hotwater_status: true, hotwater_boost: false }, { target_temperature: cap('Rumstemperatur (kurva)', 'number', { setable: true, units: '°C' }) }),
    dev('h2', 'Z-TRM6 hall', 'Hem > Bottenvåningen > Hall', 'thermostat', { thermostat_mode: 'heat', target_temperature: 24, thermostat_state_IdleHeatCool: 'Heating', measure_power: 290, meter_power: 312.8, measure_temperature: 24.4, 'measure_temperature.internal': 24, 'measure_temperature.floor': 24.4 }, { target_temperature: cap('Måltemperatur', 'number', { setable: true }), thermostat_mode: cap('Läge', 'enum', { setable: true, values: rooms([['heat', 'Värme'], ['off', 'Av']]) }) }),
    dev('h3', 'Luftvärmepump', 'Hem > Bottenvåningen', 'thermostat', { se_onoff: false, target_temperature: 21, thermostat_mode: 'off', measure_temperature: 24.3, measure_humidity: 45.9 }, { se_onoff: cap('På', 'boolean', { setable: true }), thermostat_mode: cap('Läge', 'enum', { setable: true, values: rooms([['off', 'Av'], ['heat', 'Värme'], ['cool', 'Kyla'], ['auto', 'Auto']]) }) }),
    dev('h4', 'Element ', 'Hem > Bottenvåningen > Badrum', 'heater', { onoff: true }, { onoff: cap('Påslagen', 'boolean', { setable: true }) }),
    // Energi
    dev('e1', 'Elmätare', 'Hem > Energi', 'other', { measure_power: 1850, meter_power: 13.0, accumulatedCost: 16.81, 'measure_current.L1': 4.7, 'measure_current.L2': 5.4, 'measure_current.L3': 5.4, 'meter_power.imported': 56278.4, 'meter_power.exported': 30576.9 }, { measure_power: cap('Effekt', 'number', { units: 'W' }) }),
    dev('e2', 'Solceller', 'Hem > Energi', 'solarpanel', { measure_power: 1240, meter_power: 4.8, 'meter_power.YEAR': 11180, 'meter_power.TOTAL': 43890 }, { measure_power: cap('Effekt', 'number', { units: 'W' }) }),
    dev('e3', 'Homevolt', 'Hem > Energi', 'battery', { measure_battery: 64, measure_power: -820, 'meter_power.available': 8.2, measure_temperature: 24.1, measure_frequency: 50.01, battery_status: 'Laddar ur', target_power_mode: 'partner' }, { measure_power: cap('Effekt', 'number', { units: 'W', at: now - 30000 }) }),
    dev('e4', 'Laddbox', 'Hem > Energi', 'evcharger', { charger_status: 'Charging', measure_power: 3200, 'meter_power.lastCharge': 21.4, evcharger_charging: true, evcharger_charging_state: 'plugged_in_charging', target_charger_current: 16 }, {}),
    dev('e5', 'EX90 / 2025', 'Hem > Garage', 'car', { measure_battery: 72, charging_target_level: 90, ev_charging_state: 'plugged_in_charging' }, {}),
    dev('e6', 'Elpris', 'Hem > Energi', 'other', { measure_price_total: 2.09 }, {}),
    // Vitvaror
    dev('v1', 'Kylskåp ', 'Hem > Bottenvåningen > Kök', 'socket', { onoff: true, measure_power: 85, meter_power: 4.2 }, {}),
    dev('v2', 'Diskmaskin ', 'Hem > Bottenvåningen > Kök', 'socket', { onoff: true, measure_power: 0, meter_power: 9.1 }, {}),
    dev('v3', 'Tvättmaskin ', 'Hem > Bottenvåningen > Badrum', 'socket', { onoff: true, measure_power: 2100, meter_power: 14.5 }, {}),
    // Städrobotar (Roborock-appen i Homey)
    dev('r1', 'Saros 10R', 'Hem > Bottenvåningen', 'vacuumcleaner', { is_cleaning: false, dock: true, battery_charging_state: 'charging', measure_battery: 100, clean_time: 0.84, clean_area: 40.5, clean_last: 3.2, clean_mode: '0', suction_power: '104', mop_route: '300', scrub_intensity: '240', clean_room_pick: null, clean_full: false, alarm_bin_full: false, alarm_tank_empty: false },
      { clean_room_pick: cap('Städa rum', 'enum', { setable: true, values: rooms([['1', 'vardagsrum'], ['2', 'hall1'], ['3', 'kök'], ['4', 'badrum'], ['5', 'matsal'], ['6', 'hall 2']]) }),
        clean_mode: cap('Städläge', 'enum', { setable: true, values: rooms([['0', 'endast dammsugning'], ['1', 'dammsugning & moppning'], ['2', 'endast moppning']]) }),
        suction_power: cap('Sugkraft', 'enum', { setable: true, values: rooms([['101', 'tyst'], ['102', 'balanserad'], ['103', 'turbo'], ['104', 'max'], ['105', 'av'], ['110', 'smart']]) }),
        mop_route: cap('Mopprutt', 'enum', { setable: true, values: rooms([['300', 'standard'], ['301', 'djup'], ['303', 'djup+'], ['304', 'snabb'], ['306', 'smart']]) }),
        scrub_intensity: cap('Vattenflöde', 'enum', { setable: true, values: rooms([['200', 'av'], ['221', 'svag'], ['230', 'skonsam'], ['240', 'måttlig'], ['250', 'max']]) }),
        clean_full: cap('Städa allt', 'boolean', { setable: true }), clean_last: cap('Senaste städuppgift', 'number', { units: 'h sedan' }) }),
    dev('r2', 'Roborock Q7 L5', 'Hem > Övervåning', 'vacuumcleaner', { is_cleaning: true, dock: false, battery_charging_state: 'discharging', measure_battery: 63, clean_time: 0.4, clean_area: 12.1, clean_last: 0, clean_mode: '1', suction_power: '104', mop_route: '300', scrub_intensity: '202' },
      { clean_room_pick: cap('Städa rum', 'enum', { setable: true, values: rooms([['10', 'Hall'], ['11', 'Stort sovrum'], ['12', 'Sovrum']]) }) }),
  ];

  // Variabler i samma JSON-format som flödena skriver (se CLAUDE.md, "Kontraktet Homey ↔ app")
  const curve = (base, amp, n) => Array.from({ length: n }, (_, i) => Math.round((base + amp * Math.sin((i - 20) / 15) + (i > 64 && i < 72 ? amp * 0.8 : 0)) * 1000) / 1000);
  const imp = curve(2.1, 0.8, 96), exp = imp.map((v) => Math.round((v - 0.59) / 1.25 * 1000) / 1000);
  const pctDay = Array.from({ length: 288 }, (_, i) => (i * 5 < (Date.now() - t0) / 60000 ? Math.round((55 + 30 * Math.sin(i / 40)) * 10) / 10 : null));
  const VARS = {
    'AI Elpriser': { u: now, cur: 'SEK', f: '(([[price]]+0.0998)*1.25)+0.59', days: [
      { d: 'idag', s: t0.toISOString(), iv: 15, imp, exp },
      { d: 'imorgon', s: new Date(t0.getTime() + 864e5).toISOString(), iv: 15, imp: imp.map((v) => Math.round(v * 1.3 * 1000) / 1000), exp: exp.map((v) => Math.round(v * 1.4 * 1000) / 1000) }] },
    'AI Förbrukning': { u: now, p: 2.09, pe: 1.12, ps: 'kvart',
      kyl: { id: 'v1', n: 'Kylskåp', w: 85, yday: { d: 'igår', kwh: 0.81, kr: 1.62 }, month: { m: '2026-11', kwh: 14.2, kr: 29.8 }, prevMonth: { m: '2026-10', kwh: 24.9, kr: 47.1 } },
      disk: { id: 'v2', n: 'Diskmaskin', w: 0, last: { start: now - 864e5, end: now - 80e6, kwh: 1.05, kr: 2.1, min: 118, pk: 2050 }, month: { m: '2026-11', kwh: 18.3, kr: 37.4 }, run: null },
      tvatt: { id: 'v3', n: 'Tvättmaskin', w: 2100, run: { start: now - 1800e3, kwh: 0.42, kr: 0.9 }, last: { start: now - 2 * 864e5, end: now - 2 * 864e5 + 5400e3, kwh: 0.9, kr: 1.7, min: 90, kind: 'tvatt' }, month: { m: '2026-11', kwh: 11.2, kr: 22.5 } },
      grid: { d: 'idag', imp: { kwh: 13.0, kr: 24.36 }, exp: { kwh: 11.3, kr: 12.88 }, month: { m: '2026-11', imp: { kwh: 612, kr: 1490 }, exp: { kwh: 98, kr: 121 } }, prevMonth: { m: '2026-10', ik: 999, ikr: 1682, ek: 336, ekr: 311 } } },
    'AI Batterihistorik': { u: now, iv: 5, days: [{ d: 'idag', v: pctDay, p: pctDay.map((v, i) => (v == null ? null : Math.round(2500 * Math.cos(i / 30)))) }, { d: 'igår', v: pctDay.map((_, i) => Math.round((50 + 25 * Math.sin(i / 35)) * 10) / 10), p: pctDay.map((_, i) => Math.round(2000 * Math.cos(i / 25))) }] },
    'AI Laddkostnad': { u: now, p: 2.09, last: { start: now - 3 * 864e5, end: now - 3 * 864e5 + 4 * 3600e3, kwh: 28.4, kr: 52.3, from: 31, to: 90 }, cur: { kwh: 6.1, kr: 12.7, from: 58, pause: false }, month: { m: '2026-11', kwh: 142, kr: 268, from: '2026-11-15' }, prevMonth: null },
    'AI Termostater': { Badrum: { sp: 24, on: true } },
    'AI Termostat status': { Badrum: { sp: 24, on: true, t: 23.8, h: null, heat: true, u: now - 60000, err: '' } },
    'AI Städschema': { r1: [{ id: 'sa1', on: true, days: [1, 3, 4], time: '13:10', mode: '0', suction: '104', scrub: null, route: '300', rooms: ['5', '6', '3', '2', '1'], repeat: 1 }, { id: 'sa4', on: true, days: [5], time: '09:30', mode: '2', suction: null, scrub: '240', route: '301', rooms: ['5', '3', '1'], repeat: 2 }], r2: [] },
    'AI Städlogg': '21/11 09:30 Saros 10R: startade matsal, kök, vardagsrum (2 varv)\n20/11 13:10 Saros 10R: inställningarna höll',
    'AI Homevolt status': 'OK, senaste data idag 12:00',
    'AI Homevolt logg': '2026-11-20 04:05 Homevolt har kontakt igen. Avbrottet varade ca 8 min.',
    'AI Solladdning': false,
    'AI Solladdning status': 'Tibber · smartladdning',
    'AI Skumt ute': false,
    'AI Skumt inne': false,
  };
  const variables = async () => Object.entries(VARS).map(([name, v], i) => ({ id: 'var' + i, name, type: typeof v === 'boolean' ? 'boolean' : 'string', value: typeof v === 'object' ? JSON.stringify(v) : v }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.HomeyClient = {
    login() {}, logout() {}, handleRedirect: async () => false, loggedIn: () => true, where: () => 'lokalt',
    devices: async () => { await wait(150); return JSON.parse(JSON.stringify(DEVICES)); },
    variables,
    setVariable: async (name, value) => { VARS[name] = typeof VARS[name] === 'object' ? JSON.parse(value) : value; },
    moods: async () => [{ id: 'm1', name: 'Natt' }, { id: 'm2', name: 'Film' }],
    setMood: async () => {},
    setCaps: async (map) => { for (const [id, caps] of Object.entries(map)) { const d = DEVICES.find((x) => x.id === id); if (d) Object.assign(d.state, caps); } },
    image: async () => '',
  };
})();
