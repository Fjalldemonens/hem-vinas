// AI 7 · Kyla bottenvåning (hundarna) – startgrenen. Körs när köket varit över 24 °C i 10 min och luftvärmepumpen är av.
// Luftvärmepumpen får bara starta kyla om det är varmare än MIN_OUT ute (2026-11-10: den startade när vi eldade i kaminen).
// Avstängningsgrenen (kök under 23 °C i 10 min → av) är vanliga kort i flödet och påverkas inte.

// === KONFIG (husspecifikt) ===
const PUMP = '0da56a7c-5d6e-4fe6-b825-f730fac245f5';  // Luftvärmepump (Sensibo)
const MIN_OUT = 20;    // starta bara om det är varmare än så här ute (°C)
const TARGET = 22;     // kylmål (°C)
// Utegivaren hittas som i appen: measure_temperature + measure_luminance och "temp" i namnet (helst i zonen Utomhus)
// === SLUT KONFIG ===

const all = Object.values(await Homey.devices.getDevices());
const cands = all.filter((d) => d.capabilitiesObj && d.capabilitiesObj.measure_temperature && d.capabilitiesObj.measure_luminance && /temp/i.test(d.name));
const zones = await Homey.zones.getZones();
const out = cands.find((d) => /utomhus/i.test((zones[d.zone] || {}).name || '')) || cands[0];
const t = out ? Number(out.capabilitiesObj.measure_temperature.value) : NaN;
if (!Number.isFinite(t)) { log('Ingen utetemperatur – startar inte (säkrast att låta bli)'); return false; }
if (t <= MIN_OUT) { log('Ute ' + t + ' °C (' + out.name + ') – inte över ' + MIN_OUT + ' °C, startar inte'); return false; }
await Homey.devices.setCapabilityValue({ deviceId: PUMP, capabilityId: 'thermostat_mode', value: 'cool' });
await Homey.devices.setCapabilityValue({ deviceId: PUMP, capabilityId: 'target_temperature', value: TARGET });
await Homey.devices.setCapabilityValue({ deviceId: PUMP, capabilityId: 'se_onoff', value: true });
log('Ute ' + t + ' °C – kyla startad, mål ' + TARGET + ' °C');
return true;
