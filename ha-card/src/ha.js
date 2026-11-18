// Home Assistant entities of an ESPHome JK-BMS (syssi/esphome-jk-bms) → the app's data model.
//
// syssi's examples name every entity after its config key ("total voltage", "cell voltage 1" …), so Home Assistant
// gives them ids like  sensor.<prefix>_total_voltage  — <prefix> is the ESPHome device name (jk-bms → jk_bms).
// The card finds the prefix itself (or takes it from the card config) and reads the same values the cloud gateway
// sends to Firebase: live / status / info / settings, in the gateway's units (mV, mΩ …), so model.js toBms(),
// widgets and energy.js work unchanged. Pure functions — tested in test/ha.test.mjs.

// Temperature probes the BMS really reads (1.0.12). syssi creates temperature_sensor_1…5 for every BMS, but an input with
// no probe reads nothing (or junk), and on the PB series the 5th slot repeats the MOSFET sensor value for value. So: a
// reading outside −40…150 °C is no probe, and a probe that has only ever matched the MOSFET reading is that copy — it is
// shown from the first time it differs (remembered for the page, so a real probe that briefly matches stays shown).
const realTemps = new Set();
function realTemp(id, x, mos) {
  if (x == null || x < -40 || x > 150) return null;
  if (isFinite(mos) && !realTemps.has(id)) {
    if (Math.abs(x - mos) < 0.05) return null;
    realTemps.add(id);
  }
  return x;
}

// ---- entity map ------------------------------------------------------------------------------------------------
// key → [domain, suffix, …older syssi names]
export const LIVE = {
  v: ["sensor", "total_voltage"],
  i: ["sensor", "current"],
  p: ["sensor", "power"],
  soc: ["sensor", "state_of_charge"],
  soh: ["sensor", "state_of_health"],
  mx: ["sensor", "max_cell_voltage"],
  mn: ["sensor", "min_cell_voltage"],
  avg: ["sensor", "average_cell_voltage"],
  d: ["sensor", "delta_cell_voltage"],
  mxc: ["sensor", "max_voltage_cell"],
  mnc: ["sensor", "min_voltage_cell"],
  mos: ["sensor", "mosfet_temperature", "power_tube_temperature"],
  bi: ["sensor", "balancing_current"],
  ba: ["sensor", "balancer_status_bitmask", "balancing"],
  cr: ["sensor", "capacity_remaining"],
  cf: ["sensor", "full_charge_capacity", "total_battery_capacity_setting"],
  cy: ["sensor", "charging_cycles"],
  cc: ["sensor", "total_charging_cycle_capacity"],
  rt: ["sensor", "total_runtime"],
  hi: ["sensor", "heating_current"],
  cs: ["sensor", "charge_status_id"],
  bt: ["sensor", "battery_type_id"],
  em: ["sensor", "emergency_time_countdown"],
  pwr: ["sensor", "power_on_count"],
  errHex: ["text_sensor", "errors_bitmask_hex"],
  errNum: ["sensor", "errors_bitmask"],
  errTxt: ["text_sensor", "errors"],
  chg: ["binary_sensor", "charging"],
  dis: ["binary_sensor", "discharging"],
  pre: ["binary_sensor", "precharging"],
  heat: ["binary_sensor", "heating"],
  bal: ["binary_sensor", "balancing"],
  online: ["binary_sensor", "online_status"],
  dry1: ["binary_sensor", "dry_contact_1"],
  dry2: ["binary_sensor", "dry_contact_2"],
  // device information (text sensors)
  model: ["text_sensor", "device_model"],
  hw: ["text_sensor", "hardware_version"],
  sw: ["text_sensor", "software_version"],
  serial: ["text_sensor", "serial_number"],
  mfg: ["text_sensor", "manufacturing_date"],
  bmsName: ["text_sensor", "device_name"],
  // syssi's switch for the BLE link of the ESP32
  ble: ["switch", "enable_bluetooth_connection"],
};
export const CELLS = 32, TEMPS = 5;

// app setting key (data/model.js DEFS) ← syssi number
export const NUMBERS = {
  cell_ovp: ["cell_voltage_overvoltage_protection"],
  cell_ovpr: ["cell_voltage_overvoltage_recovery"],
  cell_uvp: ["cell_voltage_undervoltage_protection"],
  cell_uvpr: ["cell_voltage_undervoltage_recovery"],
  soc100_voltage: ["cell_soc100_voltage"],
  soc0_voltage: ["cell_soc0_voltage"],
  rcv: ["cell_request_charge_voltage"],
  rfv: ["cell_request_float_voltage"],
  rcv_time: ["cell_request_charge_voltage_time"],
  rfv_time: ["cell_request_float_voltage_time"],
  power_off_voltage: ["power_off_voltage"],
  smart_sleep_voltage: ["smart_sleep_voltage"],
  max_charge_current: ["max_charge_current"],
  charge_ocp_delay: ["charge_overcurrent_protection_delay"],
  charge_ocp_recovery: ["charge_overcurrent_protection_recovery_time"],
  max_discharge_current: ["max_discharge_current"],
  discharge_ocp_delay: ["discharge_overcurrent_protection_delay"],
  discharge_ocp_recovery: ["discharge_overcurrent_protection_recovery_time"],
  scp_delay: ["short_circuit_protection_delay"],
  scp_recovery: ["short_circuit_protection_recovery_time"],
  charge_otp: ["charge_overtemperature_protection"],
  charge_otpr: ["charge_overtemperature_protection_recovery"],
  charge_utp: ["charge_undertemperature_protection"],
  charge_utpr: ["charge_undertemperature_protection_recovery"],
  discharge_otp: ["discharge_overtemperature_protection"],
  discharge_otpr: ["discharge_overtemperature_protection_recovery"],
  discharge_utp: ["discharge_undertemperature_protection"],
  discharge_utpr: ["discharge_undertemperature_protection_recovery"],
  mos_otp: ["mosfet_overtemperature_protection", "power_tube_overtemperature_protection"],
  mos_otpr: ["mosfet_overtemperature_protection_recovery", "power_tube_overtemperature_protection_recovery"],
  heating_start_temp: ["heating_start_temperature"],
  heating_stop_temp: ["heating_stop_temperature"],
  max_balance_current: ["max_balance_current"],
  balance_trigger_voltage: ["balance_trigger_voltage"],
  balance_start_voltage: ["balancing_start_voltage"],
  cell_count: ["cell_count"],
  battery_capacity: ["total_battery_capacity"],
  re_bulk_soc: ["re_bulk_soc"],
  precharge_time: ["discharge_precharge_time"],
  smart_sleep_delay: ["smart_sleep_delay"],
  emergency_duration: ["emergency_duration"],
};
// app switch key (MOS_SWITCHES / SYS_SWITCHES) ← syssi switch
export const SWITCHES = {
  charging: ["charging"], discharging: ["discharging"], balancer: ["balancer"],
  heating: ["heating"], disable_temp_sensors: ["disable_temperature_sensors"], display_always_on: ["display_always_on"],
  smart_sleep: ["smart_sleep"], disable_pcl: ["disable_pcl_module"], timed_stored_data: ["timed_stored_data"],
  charging_float_mode: ["charging_float_mode"], emergency_button_trigger: ["emergency_button_trigger"],
  dry_alarm_intermittent: ["dry_contact_alarm_intermittent"], discharge_ocp2: ["discharge_overcurrent_protection_2"],
  discharge_ocp3: ["discharge_overcurrent_protection_3"], gps_locked_charging: ["gps_locked_charging"],
  gps_locked_discharging: ["gps_locked_discharging"], emergency: ["emergency"],
};
// app select key (SELECTS) ← syssi select
export const SELECTS = {
  port_mode: ["multiplexed_port_mode"], uart1_protocol: ["uart1_protocol"], uart2_protocol: ["uart2_protocol"],
  uart3_protocol: ["uart3_protocol"], can_protocol: ["can_protocol"], lcd_buzzer_trigger: ["lcd_buzzer_trigger"],
  dry1_trigger: ["dry1_trigger"], dry2_trigger: ["dry2_trigger"],
};
export const BUTTONS = { settings: ["retrieve_settings"], info: ["retrieve_device_info"] };

// text_sensor entities live in Home Assistant's "sensor" domain
const haDomain = (d) => (d === "text_sensor" ? "sensor" : d);

// ---- finding the BMS -------------------------------------------------------------------------------------------
/**
 * Every JK-BMS in Home Assistant: sensor.<prefix>_total_voltage together with a cell voltage or the SOC.
 * @returns [{ prefix, name, deviceId, cells }] — most complete first
 */
export function findBms(hass) {
  const states = hass?.states || {};
  const out = [];
  for (const id of Object.keys(states)) {
    const m = /^sensor\.(.+)_total_voltage$/.exec(id);
    if (!m) continue;
    const p = m[1];
    const has = (s) => !!states[`sensor.${p}_${s}`];
    if (!has("cell_voltage_1") && !has("state_of_charge") && !has("delta_cell_voltage")) continue;
    // cells that read a voltage (syssi's YAML often lists 24 or 32 sensors; the unused ones show 0 V)
    let cells = 0;
    for (let k = 1; k <= CELLS && has(`cell_voltage_${k}`); k++) if (parseFloat(states[`sensor.${p}_cell_voltage_${k}`].state) > 0.5) cells = k;
    const deviceId = hass.entities?.[id]?.device_id || null;
    const dev = deviceId && hass.devices?.[deviceId];
    const name = dev?.name_by_user || dev?.name || prettify(p);
    out.push({ prefix: p, name, deviceId, cells });
  }
  return out.sort((a, b) => b.cells - a.cells || a.prefix.localeCompare(b.prefix));
}
export const prettify = (p) => String(p || "").replace(/_/g, "-").toUpperCase();

/**
 * entity ids for one BMS: { live: {key: id}, cells: [id], res: [id], temps: [id], numbers, switches, selects, buttons }
 * Only entities that exist in hass.states are listed. cfg.entities: { key: entity_id } overrides any of them.
 */
export function resolve(hass, prefix, overrides = {}) {
  const states = hass?.states || {};
  const pick = (domain, names) => {
    for (const n of names) {
      const id = `${haDomain(domain)}.${prefix}_${n}`;
      if (states[id]) return id;
    }
    return null;
  };
  const map = (tbl, domain) => {
    const o = {};
    for (const [k, names] of Object.entries(tbl)) {
      const id = overrides[k] && states[overrides[k]] ? overrides[k] : pick(domain, names);
      if (id) o[k] = id;
    }
    return o;
  };
  const live = {};
  for (const [k, [domain, ...names]] of Object.entries(LIVE)) {
    const id = overrides[k] && states[overrides[k]] ? overrides[k] : pick(domain, names);
    if (id) live[k] = id;
  }
  const series = (fmt, n) => Array.from({ length: n }, (_, i) => pick("sensor", [fmt(i + 1)]));
  const trimEnd = (a) => { let n = a.length; while (n && !a[n - 1]) n--; return a.slice(0, n); };
  return {
    prefix,
    live,
    cells: trimEnd(series((i) => `cell_voltage_${i}`, CELLS)),
    res: trimEnd(series((i) => `cell_resistance_${i}`, CELLS)),
    temps: trimEnd(series((i) => `temperature_sensor_${i}`, TEMPS)),
    numbers: map(NUMBERS, "number"),
    switches: map(SWITCHES, "switch"),
    selects: map(SELECTS, "select"),
    buttons: map(BUTTONS, "button"),
  };
}

/** every entity id the card reads (to notice when one of them changes) */
export function watchedIds(r) {
  return [...Object.values(r.live), ...r.cells, ...r.res, ...r.temps, ...Object.values(r.numbers),
    ...Object.values(r.switches), ...Object.values(r.selects)].filter(Boolean);
}

// ---- state → values --------------------------------------------------------------------------------------------
const BAD = new Set(["unavailable", "unknown", "", "none", "None", "nan", "NaN"]);
export const usable = (st) => !!st && !BAD.has(String(st.state));
// display units a user may have chosen in Home Assistant → the unit the app works in
const SCALE = { mV: ["V", 0.001], kV: ["V", 1000], mA: ["A", 0.001], kA: ["A", 1000], kW: ["W", 1000], MW: ["W", 1e6], mW: ["W", 0.001],
  "mΩ": ["Ω", 0.001], "µΩ": ["Ω", 1e-6], kAh: ["Ah", 1000], mAh: ["Ah", 0.001], min: ["s", 60], h: ["s", 3600], d: ["s", 86400] };
/** numeric state in the base unit (V, A, W, Ω, Ah, °C, s), NaN when not usable */
export function numOf(st, base) {
  if (!usable(st)) return NaN;
  let v = parseFloat(st.state);
  if (!isFinite(v)) return NaN;
  const u = st.attributes?.unit_of_measurement;
  if (u === "°F" && (base === "°C" || base == null)) return ((v - 32) * 5) / 9;
  // only when the caller says which unit it wants: a number entity in "h" (RCV time) stays in hours
  if (u && base && u !== base && SCALE[u] && SCALE[u][0] === base) v *= SCALE[u][1];
  return v;
}
const onOf = (st) => (usable(st) ? st.state === "on" : null);
const txtOf = (st) => (usable(st) ? String(st.state) : null);
const tsOf = (st) => {
  if (!st) return 0;
  const t = Date.parse(st.last_reported || st.last_updated || st.last_changed || "");
  return isFinite(t) ? t : 0;
};

/** "0x0402" / "0402" / "1026" → number (the JK error bitmask), or null */
export function parseHex(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16) >>> 0;
  if (/^[0-9a-f]+$/i.test(t) && /[a-f]/i.test(t)) return parseInt(t, 16) >>> 0;
  if (/^\d+$/.test(t)) return parseInt(t, /^0\d/.test(t) && t.length >= 4 ? 16 : 10) >>> 0;
  return null;
}

/**
 * The BMS as the cloud gateway would send it: { live, status, info, settings, settingsW, sel, avail, ts }
 *   live      gateway "live" object (mV / mΩ / bit masks) or null when there is no reading
 *   status    { online: ESP32 reachable, bms: "streaming" | "idle", ts }
 *   settings  app setting key → value, settingsW → writable (entity available)
 *   sel       select key → { options, i }
 */
export function snapshot(hass, r, now = Date.now()) {
  const S = hass?.states || {};
  const st = (id) => (id ? S[id] : null);
  const L = (k) => st(r.live[k]);
  const n = (k, base) => numOf(L(k), base);
  let ts = 0, lost = 0, any = false, anyUsable = false;
  for (const id of watchedIds(r)) {
    const s = S[id];
    if (!s) continue;
    any = true;
    if (usable(s)) { anyUsable = true; ts = Math.max(ts, tsOf(s)); }
    else lost = Math.max(lost, Date.parse(s.last_changed || "") || 0);
  }
  // everything unavailable: the moment it became so is when the ESP32 was last heard from
  if (!anyUsable) ts = lost;
  // the ESP32 is reachable while Home Assistant has its entities (an offline ESPHome node turns them all "unavailable")
  const online = anyUsable;
  const bmsOn = r.live.online ? onOf(L("online")) === true : online && now - ts < 180e3;

  // cells: the BMS's cell count (number entity) when known, else every cell above 0.5 V
  const cellV = r.cells.map((id) => numOf(st(id), "V"));
  let count = numOf(st(r.numbers.cell_count));
  if (!(count >= 1 && count <= CELLS)) { count = 0; cellV.forEach((v, i) => { if (v > 0.5) count = i + 1; }); }
  count = Math.min(count, cellV.length);
  const v = n("v", "V");
  let live = null;
  if (isFinite(v) && count > 0 && cellV.slice(0, count).some((x) => x > 0.5)) {
    const mv = (x) => (isFinite(x) ? Math.round(x * 1000) : 0);
    const cells = cellV.slice(0, count).map(mv);
    const res = r.res.slice(0, count).map((id) => { const x = numOf(st(id), "Ω"); return isFinite(x) ? Math.round(x * 1000 * 100) / 100 : 0; });
    const ok = cells.filter((x) => x > 500);
    const temps = r.temps.map((id) => { const x = numOf(st(id), "°C"); return isFinite(x) ? Math.round(x * 10) / 10 : null; })
      .map((x, k) => realTemp(r.temps[k], x, n("mos", "°C")));
    while (temps.length && temps[temps.length - 1] == null) temps.pop();
    const i = n("i", "A");
    let p = n("p", "W");
    if (!isFinite(p) && isFinite(i)) p = v * i;
    // error bitmask: hex text sensor (current syssi) or the older numeric sensor; 32 bits on JK02_32S
    const hex = txtOf(L("errHex"));
    let err = parseHex(hex);
    if (err == null) { const e = n("errNum"); err = isFinite(e) ? e >>> 0 : 0; }
    const eb = hex && hex.replace(/^0x/i, "").length > 4 ? 32 : err > 0xffff ? 32 : 16;
    // balancer action: 0 off · 1 charging cells · 2 discharging cells (balancer status byte); older YAML: on/off only
    let ba = n("ba");
    if (!isFinite(ba)) ba = onOf(L("bal")) ? 1 : 0;
    const idx = (arr, pickMax) => { if (!ok.length) return 1; let k = 0; arr.forEach((x, j) => { if (x > 500 && (pickMax ? x > arr[k] : x < arr[k] || arr[k] <= 500)) k = j; }); return k + 1; };
    const mxc = n("mxc"), mnc = n("mnc");
    const mxV = n("mx", "V"), mnV = n("mn", "V"), avgV = n("avg", "V"), dV = n("d", "V");
    const max = ok.length ? Math.max(...ok) : 0, min = ok.length ? Math.min(...ok) : 0;
    live = {
      ts,
      v, i: isFinite(i) ? i : 0, p: isFinite(p) ? p : 0,
      soc: n("soc"), soh: n("soh"),
      c: cells, r: res.some((x) => x > 0) ? res : [],
      mx: isFinite(mxV) ? mv(mxV) : max,
      mn: isFinite(mnV) ? mv(mnV) : min,
      avg: isFinite(avgV) ? mv(avgV) : ok.length ? Math.round(ok.reduce((a, x) => a + x, 0) / ok.length) : 0,
      d: isFinite(dV) ? mv(dV) : max - min,
      mxc: mxc >= 1 && mxc <= count ? Math.round(mxc) : idx(cells, true),
      mnc: mnc >= 1 && mnc <= count ? Math.round(mnc) : idx(cells, false),
      mos: isFinite(n("mos", "°C")) ? Math.round(n("mos", "°C") * 10) / 10 : null,
      t: temps,
      bi: n("bi", "A"), ba: Math.round(ba) || 0,
      cr: n("cr", "Ah"), cf: n("cf", "Ah"), cy: n("cy"), cc: n("cc", "Ah"), rt: n("rt", "s"),
      chg: !!onOf(L("chg")), dis: !!onOf(L("dis")), pre: !!onOf(L("pre")), heat: !!onOf(L("heat")),
      hi: isFinite(n("hi", "A")) ? n("hi", "A") : null,
      err, eb,
      cs: isFinite(n("cs")) ? n("cs") : null,
      bt: isFinite(n("bt")) ? n("bt") : null,
      em: n("em", "s"),
      dry: (onOf(L("dry1")) ? 1 : 0) | (onOf(L("dry2")) ? 2 : 0),
    };
    // values a JK04 / older YAML does not give are left out (toBms treats them as missing)
    for (const k of ["soc", "soh", "bi", "cr", "cf", "cy", "cc", "rt", "em"]) if (!isFinite(live[k])) delete live[k];
    if (live.cf == null) { const cap = numOf(st(r.numbers.battery_capacity), "Ah"); if (isFinite(cap)) live.cf = cap; }
  }

  const settings = {}, settingsW = {};
  for (const [k, id] of Object.entries(r.numbers)) {
    const x = numOf(st(id));
    if (isFinite(x)) settings[k] = x;
    if (usable(st(id))) settingsW[k] = true;
  }
  for (const [k, id] of Object.entries(r.switches)) {
    const o = onOf(st(id));
    if (o != null) { settings[k] = o; settingsW[k] = true; }
  }
  const sel = {};
  for (const [k, id] of Object.entries(r.selects)) {
    const s = st(id), options = s?.attributes?.options || [];
    if (!usable(s)) continue;
    const i = options.indexOf(s.state);
    sel[k] = { options, i };
    settings[k] = i >= 0 ? i : null;
    settingsW[k] = true;
  }
  const info = {
    model: txtOf(L("model")), hw: txtOf(L("hw")), sw: txtOf(L("sw")), serial: txtOf(L("serial")), mfg: txtOf(L("mfg")),
    bmsName: txtOf(L("bmsName")), powerOn: isFinite(n("pwr")) ? n("pwr") : null,
  };
  const esp = { ble: onOf(L("ble")) };
  return { live, status: { online, bms: !online ? "offline" : bmsOn ? "streaming" : "idle", ts }, info, settings, settingsW, sel, esp, any, ts };
}

// ---- recorder ----------------------------------------------------------------------------------------------------
/**
 * History for the chart: [{ts, v, i, p, soc, d, t}] from Home Assistant's statistics (5-minute means up to ~26 h,
 * hourly beyond) — falls back to the raw history when the sensors have no statistics.
 */
export async function loadHistory(hass, r, from, to) {
  const ids = { v: r.live.v, i: r.live.i, p: r.live.p, soc: r.live.soc, d: r.live.d, t1: r.temps[0], t2: r.temps[1] };
  const list = Object.entries(ids).filter(([, id]) => id);
  if (!list.length) return [];
  const period = to - from <= 26 * 3600e3 ? "5minute" : "hour";
  let rows = [];
  try {
    const res = await hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(from).toISOString(), end_time: new Date(to).toISOString(),
      statistic_ids: list.map(([, id]) => id), period, types: ["mean"] });
    rows = mergeStats(res, list);
  } catch { /* recorder off / no statistics */ }
  if (rows.length < 3) {
    try {
      const res = await hass.callWS({ type: "history/history_during_period", start_time: new Date(from).toISOString(), end_time: new Date(to).toISOString(),
        entity_ids: list.map(([, id]) => id), minimal_response: true, no_attributes: true, significant_changes_only: false });
      const alt = bucketHistory(res, list, period === "5minute" ? 300e3 : 3600e3, from, to);
      if (alt.length > rows.length) rows = alt;
    } catch { /* no history */ }
  }
  return rows.map(finish);
}

const statTs = (x) => (typeof x === "number" ? (x < 1e11 ? x * 1000 : x) : Date.parse(x));
/** recorder/statistics_during_period answer → rows by time */
export function mergeStats(res, list) {
  const byTs = new Map();
  for (const [k, id] of list) {
    for (const s of res?.[id] || []) {
      const ts = statTs(s.start);
      if (!isFinite(ts) || s.mean == null || !isFinite(s.mean)) continue;
      const row = byTs.get(ts) || { ts };
      row[k] = s.mean;
      byTs.set(ts, row);
    }
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}
/** history/history_during_period (minimal, compressed) → mean per bucket */
export function bucketHistory(res, list, step, from, to) {
  const acc = new Map();
  for (const [k, id] of list) {
    for (const s of res?.[id] || []) {
      const v = parseFloat(s.s ?? s.state);
      const t = s.lu != null ? s.lu * 1000 : Date.parse(s.last_updated || s.last_changed || "");
      if (!isFinite(v) || !isFinite(t) || t < from || t > to) continue;
      const b = Math.floor(t / step) * step;
      const row = acc.get(b) || { ts: b, _n: {} };
      row[k] = (row[k] || 0) + v;
      row._n[k] = (row._n[k] || 0) + 1;
      acc.set(b, row);
    }
  }
  return [...acc.values()].sort((a, b) => a.ts - b.ts).map((row) => {
    const o = { ts: row.ts };
    for (const k of Object.keys(row._n)) o[k] = row[k] / row._n[k];
    return o;
  });
}
// chart units as the app's history: Δ in mV, t = the warmer of T1 / T2
function finish(row) {
  const o = { ts: row.ts };
  for (const k of ["v", "i", "p", "soc"]) if (row[k] != null) o[k] = row[k];
  if (row.d != null) o.d = row.d < 2 ? row.d * 1000 : row.d;  // V (syssi) → mV
  const t = [row.t1, row.t2].filter((x) => x != null && isFinite(x));
  if (t.length) o.t = Math.max(...t);
  return o;
}

/**
 * Lowest / highest / mean over [from, to] of the MOSFET temperature and of the battery probes (the first `probes`
 * temperature sensors, the ones on the tile) — from the recorder's 5-minute statistics (min / max of each 5 minutes,
 * in °C), from the raw history for a sensor without statistics. 1.0.8.
 *   → { mos: { min, max, mean, from }, bat: { … } } — null for a group with nothing recorded
 */
export async function loadTempStats(hass, r, from, to, probes = 2) {
  const groups = { mos: r.live.mos ? [r.live.mos] : [], bat: r.temps.slice(0, probes).filter(Boolean) };
  const ids = [...groups.mos, ...groups.bat];
  if (!ids.length) return null;
  const per = {};
  const add = (id, lo, hi, mean, ts) => {
    if (![lo, hi, mean, ts].every(isFinite)) return;
    const a = (per[id] ||= { min: Infinity, max: -Infinity, sum: 0, n: 0, from: Infinity });
    a.min = Math.min(a.min, lo); a.max = Math.max(a.max, hi); a.sum += mean; a.n++; a.from = Math.min(a.from, ts);
  };
  const iso = (t) => new Date(t).toISOString();
  try {
    const res = await hass.callWS({ type: "recorder/statistics_during_period", start_time: iso(from), end_time: iso(to), statistic_ids: ids,
      period: "5minute", types: ["mean", "min", "max"], units: { temperature: "°C" } });
    for (const id of ids) {
      for (const x of res?.[id] || []) {
        const mean = Number(x.mean);
        add(id, x.min != null ? Number(x.min) : mean, x.max != null ? Number(x.max) : mean, mean, statTs(x.start));
      }
    }
  } catch { /* recorder off / no statistics */ }
  const missing = ids.filter((id) => !per[id]);
  if (missing.length) {
    try {
      const res = await hass.callWS({ type: "history/history_during_period", start_time: iso(from), end_time: iso(to),
        entity_ids: missing, minimal_response: true, no_attributes: true, significant_changes_only: false });
      for (const id of missing) {
        for (const x of res?.[id] || []) {
          const v = parseFloat(x.s ?? x.state), t = x.lu != null ? x.lu * 1000 : Date.parse(x.last_updated || x.last_changed || "");
          add(id, v, v, v, Math.max(t, from));
        }
      }
    } catch { /* no history */ }
  }
  const merge = (list) => {
    const xs = list.map((id) => per[id]).filter(Boolean);
    if (!xs.length) return null;
    const n = xs.reduce((k, x) => k + x.n, 0);
    return { min: Math.min(...xs.map((x) => x.min)), max: Math.max(...xs.map((x) => x.max)), mean: xs.reduce((k, x) => k + x.sum, 0) / n, from: Math.min(...xs.map((x) => x.from)) };
  };
  return { mos: merge(groups.mos), bat: merge(groups.bat) };
}

/**
 * The dashboard tiles' sparklines from the recorder (1.0.10): 5-minute means on a fixed 5-minute grid that ends with the
 * last full 5 minutes, `hours` back per line — pack voltage, current, power, cell Δ (mV), MOSFET temperature and the
 * battery (the warmer of the tile's probes, T1 / T2). A sensor without statistics: its raw history in 5-minute means.
 *   → { v: { vals, slots, t0, step }, i, p, d, mos, t } — vals from the first 5 minutes with data (a gap repeats the
 *     5 minutes before it), slots = places for the whole time; a line without any data is left out
 */
export async function loadSparks(hass, r, now, hours = { v: 6, i: 6, p: 6, d: 6, mos: 12, t: 12 }, probes = 2) {
  const step = 300e3, end = Math.floor(now / step) * step;  // start of the 5 minutes running now
  const from = end - Math.max(...Object.values(hours)) * 3600e3;
  const ids = { v: r.live.v, i: r.live.i, p: r.live.p, d: r.live.d, mos: r.live.mos };
  r.temps.slice(0, probes).forEach((id, k) => { ids["t" + (k + 1)] = id; });
  const list = Object.entries(ids).filter(([, id]) => id);
  if (!list.length) return {};
  const iso = (t) => new Date(t).toISOString();
  const byTs = new Map();
  const merge = (rows) => { for (const x of rows) byTs.set(x.ts, Object.assign(byTs.get(x.ts) || {}, x)); };
  try {
    const res = await hass.callWS({ type: "recorder/statistics_during_period", start_time: iso(from), end_time: iso(end), statistic_ids: list.map(([, id]) => id),
      period: "5minute", types: ["mean"], units: { voltage: "V", current: "A", power: "W", temperature: "°C" } });
    merge(mergeStats(res, list));
  } catch { /* recorder off / no statistics */ }
  const have = new Set([...byTs.values()].flatMap((x) => Object.keys(x)));
  const missing = list.filter(([k]) => !have.has(k));
  if (missing.length) {
    try {
      const res = await hass.callWS({ type: "history/history_during_period", start_time: iso(from), end_time: iso(end),
        entity_ids: missing.map(([, id]) => id), minimal_response: true, no_attributes: true, significant_changes_only: false });
      merge(bucketHistory(res, missing, step, from, end));
    } catch { /* no history */ }
  }
  const num = (x) => typeof x === "number" && isFinite(x);
  const out = {};
  const line = (key, h, val) => {
    const slots = Math.round((h * 3600e3) / step), t0 = end - slots * step, vals = [];
    let last = null, first = -1;
    for (let k = 0; k < slots; k++) {
      const row = byTs.get(t0 + k * step), x = row ? val(row) : null;
      if (num(x)) { last = x; if (first < 0) first = k; }
      if (last != null) vals.push(last);
    }
    if (vals.length) out[key] = { vals, slots, t0: t0 + first * step, step };
  };
  line("v", hours.v, (x) => x.v);
  line("i", hours.i, (x) => x.i);
  line("p", hours.p, (x) => x.p);
  line("d", hours.d, (x) => (num(x.d) ? (x.d < 2 ? x.d * 1000 : x.d) : null));  // V (syssi) → mV
  line("mos", hours.mos, (x) => x.mos);
  line("t", hours.t, (x) => { const a = [x.t1, x.t2].filter(num); return a.length ? Math.max(...a) : null; });
  return out;
}

/** today's SOC + pack voltage samples (5-minute means since `from`) for energy.js todayEnergy() */
export async function loadSocSamples(hass, r, from, to) {
  if (!r.live.soc) return [];
  const rows = await loadHistory(hass, { live: { v: r.live.v, soc: r.live.soc }, temps: [] }, from, to);
  return rows.filter((x) => x.soc != null).map((x) => ({ ts: x.ts, soc: x.soc, v: x.v }));
}
