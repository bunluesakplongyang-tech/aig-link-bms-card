// node --test test/ha.test.mjs — entity finding and the Home Assistant → gateway "live" mapping (src/ha.js)
import test from "node:test";
import assert from "node:assert/strict";
import { findBms, resolve, snapshot, parseHex, numOf, mergeStats, bucketHistory, loadHistory, loadTempStats, loadSparks, watchedIds } from "../src/ha.js";
import { makeHass } from "./mockhass.js";

const st = (state, unit) => ({ state: String(state), attributes: unit ? { unit_of_measurement: unit } : {} });

test("finds the BMS by its total voltage + cells, most complete first", () => {
  const h = makeHass({ prefix: "jk_bms" });
  const other = makeHass({ prefix: "garage_pack", cells: 8 });
  Object.assign(h.states, other.states);
  h.states["sensor.inverter_total_voltage"] = st(230, "V");   // not a BMS: no cells, no SOC
  const list = findBms(h);
  assert.deepEqual(list.map((b) => b.prefix), ["jk_bms", "garage_pack"]);
  assert.equal(list[0].cells, 16);  // 24 cell sensors configured, 8 of them read 0 V
  assert.equal(list[1].cells, 8);
  assert.equal(list[0].name, "jk-bms");
});

test("snapshot = what the cloud gateway sends (mV, mΩ, 1-based cells, bit masks)", () => {
  const h = makeHass({ cells: 16, temps: 4, alarms: 0x801 });
  const r = resolve(h, "jk_bms");
  assert.equal(r.live.v, "sensor.jk_bms_total_voltage");
  assert.equal(r.live.chg, "binary_sensor.jk_bms_charging");
  assert.equal(r.switches.charging, "switch.jk_bms_charging");
  assert.equal(r.live.errHex, "sensor.jk_bms_errors_bitmask_hex");  // text_sensor → sensor domain
  assert.equal(r.cells.length, 24);
  assert.equal(r.temps.length, 4);
  const s = snapshot(h, r);
  const L = s.live;
  assert.equal(s.status.online, true);
  assert.equal(s.status.bms, "streaming");
  assert.equal(L.c.length, 16, "cell count from number.cell_count, not the 24 sensors");
  assert.ok(L.c.every((x) => Number.isInteger(x) && x > 3200 && x < 3400));
  assert.equal(L.mx, Math.max(...L.c));
  assert.ok(Math.abs(L.d - (L.mx - L.mn)) <= 1, "BMS delta (rounded separately)");
  assert.equal(L.c[L.mxc - 1], L.mx);
  assert.equal(L.c[L.mnc - 1], L.mn);
  assert.ok(L.r.every((x) => x > 55 && x < 80), "resistance Ω → mΩ");
  assert.equal(L.t.length, 4);
  assert.equal(L.err, 0x801);
  assert.equal(L.eb, 32);
  assert.equal(L.cf, 280);
  assert.equal(L.cy, 37);
  assert.equal(L.chg, true);
  assert.equal(s.settings.cell_ovp, 3.65);
  assert.equal(s.settings.charging, true);
  assert.equal(s.settingsW.cell_ovp, true);
  assert.deepEqual(s.sel.lcd_buzzer_trigger.i, 1);
  assert.equal(s.info.model, "BD6A20S10P");
  assert.equal(s.esp.ble, true);
});

test("older syssi names still work", () => {
  const h = makeHass({ old: true, alarms: 4 });
  const s = snapshot(h, resolve(h, "jk_bms"));
  assert.ok(s.live.mos > 30, "power_tube_temperature");
  assert.equal(s.live.cf, 280, "total_battery_capacity_setting");
  assert.equal(s.live.err, 4, "numeric errors_bitmask");
  assert.ok(s.live.ba === 0 || s.live.ba === 1, "balancing sensor");
});

test("BMS away (syssi publishes NaN) / ESP32 away (Home Assistant: unavailable)", () => {
  const h = makeHass({ offline: true });
  const s = snapshot(h, resolve(h, "jk_bms"));
  assert.equal(s.live, null);
  assert.equal(s.status.online, true, "text sensors of the ESP32 still there");
  assert.equal(s.status.bms, "idle");
  const h2 = makeHass({ espDown: true });
  const s2 = snapshot(h2, resolve(h2, "jk_bms"));
  assert.equal(s2.live, null);
  assert.equal(s2.status.online, false);
  assert.equal(s2.status.bms, "offline");
  assert.ok(s2.ts > 0, "last seen = when the entities went unavailable");
});

test("display units chosen in Home Assistant are converted back", () => {
  assert.equal(numOf(st(1.5, "kW"), "W"), 1500);
  assert.ok(Math.abs(numOf(st(3312, "mV"), "V") - 3.312) < 1e-12);
  assert.ok(Math.abs(numOf(st(86, "°F"), "°C") - 30) < 1e-9);
  assert.ok(Math.abs(numOf(st(61, "mΩ"), "Ω") - 0.061) < 1e-12);
  assert.ok(isNaN(numOf(st("unavailable"), "V")));
  assert.ok(isNaN(numOf(st("unknown"), "V")));
  assert.equal(numOf(st(2, "h"), "s"), 7200);
  assert.equal(numOf(st(0.1, "h")), 0.1, "a setting in hours is not turned into seconds (RCV time)");
  assert.equal(numOf(st(5, "h")), 5);
});

test("error bitmask text", () => {
  assert.equal(parseHex("0x00000801"), 0x801);
  assert.equal(parseHex("0x0000"), 0);
  assert.equal(parseHex("0801"), 0x801);
  assert.equal(parseHex("1A"), 0x1a);
  assert.equal(parseHex("2049"), 2049);
  assert.equal(parseHex("Offline"), null);
});

test("entity overrides", () => {
  const h = makeHass();
  h.states["sensor.shunt_soc"] = st(55, "%");
  const r = resolve(h, "jk_bms", { soc: "sensor.shunt_soc", v: "sensor.does_not_exist" });
  assert.equal(r.live.soc, "sensor.shunt_soc");
  assert.equal(r.live.v, "sensor.jk_bms_total_voltage", "a missing override falls back");
  assert.equal(snapshot(h, r).live.soc, 55);
  assert.ok(watchedIds(r).includes("sensor.shunt_soc"));
});

test("statistics: ms, seconds and ISO start times; history fallback buckets", () => {
  const list = [["v", "sensor.a"], ["soc", "sensor.b"]];
  const t0 = Date.UTC(2026, 10, 11, 0, 0);
  const rows = mergeStats({ "sensor.a": [{ start: t0, mean: 52 }, { start: (t0 + 300e3) / 1000, mean: 53 }], "sensor.b": [{ start: new Date(t0).toISOString(), mean: 80 }] }, list);
  assert.deepEqual(rows, [{ ts: t0, v: 52, soc: 80 }, { ts: t0 + 300e3, v: 53 }]);
  const hist = { "sensor.a": [{ s: "50", lu: t0 / 1000 + 10 }, { s: "52", lu: t0 / 1000 + 100 }, { s: "unavailable", lu: t0 / 1000 + 200 }, { s: "60", lu: t0 / 1000 + 400 }] };
  assert.deepEqual(bucketHistory(hist, list, 300e3, t0, t0 + 3600e3), [{ ts: t0, v: 51 }, { ts: t0 + 300e3, v: 60 }]);
});

test("history: 5-minute statistics for a day, hourly beyond; Δ in mV, t = warmer of T1/T2", async () => {
  const h = makeHass();
  const r = resolve(h, "jk_bms");
  const to = Date.now(), day = await loadHistory(h, r, to - 24 * 3600e3, to);
  assert.ok(day.length > 250 && day.length <= 288, String(day.length));
  assert.equal(h.calls.at(-1).period, "5minute");
  assert.ok(day.every((p) => p.d > 1 && p.d < 20), "mV");
  assert.ok(day.every((p) => p.t > 20 && p.t < 40));
  const month = await loadHistory(h, r, to - 720 * 3600e3, to);
  assert.equal(h.calls.at(-1).period, "hour");
  assert.ok(month.length > 700, String(month.length));
});

test("12-hour temperature stats: min / max of the 5-minute statistics, raw history when a sensor has none", async () => {
  const h = makeHass({ temps: 4 });
  const r = resolve(h, "jk_bms"), to = Date.UTC(2026, 10, 12, 6), from = to - 12 * 3600e3;
  const s = await loadTempStats(h, r, from, to, 2);
  const q = h.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.deepEqual(q.statistic_ids, ["sensor.jk_bms_mosfet_temperature", "sensor.jk_bms_temperature_sensor_1", "sensor.jk_bms_temperature_sensor_2"]);
  assert.deepEqual(q.types, ["mean", "min", "max"]);
  assert.equal(q.period, "5minute");
  assert.ok(s.mos.min < s.mos.mean && s.mos.mean < s.mos.max, JSON.stringify(s.mos));
  assert.ok(s.mos.max > 33.2 && s.mos.min < 32.8);      // 33 + 4·sin, ±0.3 inside each 5 minutes
  assert.ok(s.bat.max <= 32.3 + 1e-9 && s.bat.min >= 25.7 - 1e-9);
  assert.ok(s.mos.from >= from && s.mos.from < from + 300e3);
  // no statistics (no state_class): the raw states
  const raw = { "sensor.jk_bms_mosfet_temperature": [{ s: "30.5", lu: (from + 60e3) / 1000 }, { s: "41.2", lu: (from + 3600e3) / 1000 }, { s: "unavailable", lu: (from + 7200e3) / 1000 }] };
  const h2 = { callWS: async (m) => (m.type === "history/history_during_period" ? raw : {}) };
  const s2 = await loadTempStats(h2, { live: { mos: "sensor.jk_bms_mosfet_temperature" }, temps: [] }, from, to);
  assert.deepEqual([s2.mos.min, s2.mos.max, s2.mos.mean], [30.5, 41.2, (30.5 + 41.2) / 2]);
  assert.equal(s2.bat, null);
});

test("tile sparklines: 6 h / 12 h of 5-minute means on a fixed grid, gaps repeat, warmer of T1/T2, Δ in mV", async () => {
  const h = makeHass({ temps: 4 });
  const r = resolve(h, "jk_bms"), now = Date.UTC(2026, 10, 13, 2, 7, 30);   // 02:07:30 → last full 5 minutes 02:00
  const sp = await loadSparks(h, r, now);
  const q = h.calls.find((c) => c.type === "recorder/statistics_during_period");
  assert.equal(q.period, "5minute");
  assert.equal(Date.parse(q.end_time), Date.UTC(2026, 10, 13, 2, 5));
  assert.equal(Date.parse(q.start_time), Date.UTC(2026, 10, 13, 2, 5) - 12 * 3600e3);
  for (const k of ["v", "i", "p", "d"]) assert.equal(sp[k].slots, 72, k);
  for (const k of ["mos", "t"]) assert.equal(sp[k].slots, 144, k);
  assert.ok(sp.d.vals.every((x) => x > 1 && x < 20), "Δ in mV");
  assert.ok(sp.v.vals.every((x) => x > 50 && x < 55));
  // a sensor without statistics: raw history in 5-minute means; a gap repeats the 5 minutes before
  const end = Date.UTC(2026, 10, 13, 2, 5), t0 = end - 6 * 3600e3;
  const raw = { "sensor.v": [{ s: "52.0", lu: (t0 + 3600e3 + 10e3) / 1000 }, { s: "52.4", lu: (t0 + 3600e3 + 200e3) / 1000 }, { s: "53.0", lu: (t0 + 3600e3 + 900e3) / 1000 }] };
  const h2 = { callWS: async (m) => (m.type === "history/history_during_period" ? raw : {}) };
  const s2 = await loadSparks(h2, { live: { v: "sensor.v" }, temps: [] }, now, { v: 6 });
  assert.equal(s2.v.slots, 72);
  assert.equal(s2.v.t0, t0 + 3600e3);                    // starts with the first 5 minutes that have data
  assert.deepEqual(s2.v.vals.slice(0, 4).map((x) => +x.toFixed(2)), [52.2, 52.2, 52.2, 53]);
  assert.equal(s2.v.vals.length, 72 - 12);
  assert.equal(s2.i, undefined);
});
