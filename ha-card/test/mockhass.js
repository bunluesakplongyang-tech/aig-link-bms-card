// A pretend Home Assistant for the card: the entities of syssi's esp32-ble-example.yaml (16S, 4 probes), changing
// every couple of seconds, the recorder statistics API and service calls. Used by test/mock.html (browser tests).
export function makeHass({ prefix = "jk_bms", cells = 16, temps = 4, lang = "th", offline = false, alarms = 0, old = false, espDown = false } = {}) {
  const states = {};
  const entities = {};
  const devId = "d0e5f1ab";
  const now = () => new Date().toISOString();
  const set = (id, state, attributes = {}) => {
    states[id] = { entity_id: id, state: String(state), attributes, last_changed: now(), last_updated: now(), context: { id: "x" } };
    entities[id] = { entity_id: id, device_id: devId, platform: "esphome" };
  };
  const sen = (k, v, unit, extra = {}) => set(`sensor.${prefix}_${k}`, v, { unit_of_measurement: unit, state_class: "measurement", friendly_name: `${prefix} ${k.replace(/_/g, " ")}`, ...extra });
  const t = Date.now() / 1000;
  let soc = 76;
  const cur = () => (offline ? NaN : 18.4 * Math.sin(t / 40) + 6.2);
  function fill() {
    const tt = Date.now() / 1000;
    const i = offline ? NaN : 24 * Math.sin(tt / 50) + 9.5;
    const cv = Array.from({ length: cells }, (_, k) => 3.318 + 0.012 * Math.sin(k * 1.7 + tt / 9) + (k === 6 ? 0.019 : 0) - (k === 11 ? 0.014 : 0));
    const total = cv.reduce((a, x) => a + x, 0);
    const u = (x) => (offline ? "unknown" : x);
    cv.forEach((x, k) => sen(`cell_voltage_${k + 1}`, u(x.toFixed(3)), "V"));
    for (let k = cells; k < 24; k++) sen(`cell_voltage_${k + 1}`, u("0.000"), "V");
    cv.forEach((_, k) => sen(`cell_resistance_${k + 1}`, u((0.061 + 0.0013 * ((k * 7) % 11)).toFixed(3)), "Ω"));
    const mx = Math.max(...cv), mn = Math.min(...cv);
    sen("total_voltage", u(total.toFixed(2)), "V", { device_class: "voltage" });
    sen("current", u(i.toFixed(2)), "A", { device_class: "current" });
    sen("power", u((total * i).toFixed(1)), "W", { device_class: "power" });
    sen("charging_power", u(Math.max(0, total * i).toFixed(1)), "W");
    sen("discharging_power", u(Math.max(0, -total * i).toFixed(1)), "W");
    sen("state_of_charge", u(soc.toFixed(0)), "%", { device_class: "battery" });
    if (!old) sen("state_of_health", u(100), "%");
    sen("capacity_remaining", u((280 * soc / 100).toFixed(1)), "Ah");
    sen(old ? "total_battery_capacity_setting" : "full_charge_capacity", u("280.0"), "Ah");
    sen("charging_cycles", u(37), "");
    sen("total_charging_cycle_capacity", u("10532.4"), "Ah");
    sen("total_runtime", u(4123456), "s");
    sen("power_on_count", u(12), "");
    sen("min_cell_voltage", u(mn.toFixed(3)), "V");
    sen("max_cell_voltage", u(mx.toFixed(3)), "V");
    sen("min_voltage_cell", u(cv.indexOf(mn) + 1), "");
    sen("max_voltage_cell", u(cv.indexOf(mx) + 1), "");
    sen("delta_cell_voltage", u((mx - mn).toFixed(3)), "V");
    sen("average_cell_voltage", u((total / cells).toFixed(3)), "V");
    for (let k = 1; k <= temps; k++) sen(`temperature_sensor_${k}`, u((29.4 + k * 0.7 + Math.sin(tt / 60 + k)).toFixed(1)), "°C");
    sen(old ? "power_tube_temperature" : "mosfet_temperature", u((33.1 + Math.sin(tt / 70)).toFixed(1)), "°C");
    sen("balancing_current", u((Math.abs(Math.sin(tt / 20)) * 0.6).toFixed(3)), "A");
    sen(old ? "balancing" : "balancer_status_bitmask", u(Math.sin(tt / 20) > 0.2 ? 1 : 0), "");
    sen("heating_current", u("0.00"), "A");
    if (!old) {
      sen("charge_status_id", u(i > 0 ? 0 : 2), "");
      sen("battery_type_id", u(0), "");
      sen("emergency_time_countdown", u(0), "s");
      set(`sensor.${prefix}_errors_bitmask_hex`, u("0x" + (alarms >>> 0).toString(16).toUpperCase().padStart(8, "0")));
    } else sen("errors_bitmask", u(alarms), "");
    set(`sensor.${prefix}_errors`, offline ? "Offline" : alarms ? "Cell undervoltage" : "");
    set(`sensor.${prefix}_device_model`, "BD6A20S10P");
    set(`sensor.${prefix}_hardware_version`, "11.XW");
    set(`sensor.${prefix}_software_version`, "11.26");
    set(`sensor.${prefix}_serial_number`, "4011234567");
    set(`sensor.${prefix}_manufacturing_date`, "240315");
    set(`sensor.${prefix}_device_name`, "JK_BD6A20S10P");
    set(`sensor.${prefix}_wifi_signal`, -61, { unit_of_measurement: "dBm" });
    set(`sensor.${prefix}_uptime`, 93784, { unit_of_measurement: "s" });
    set(`sensor.${prefix}_ip_address`, "192.168.1.57");
    const bin = (k, on) => set(`binary_sensor.${prefix}_${k}`, offline ? "unavailable" : on ? "on" : "off");
    bin("charging", true); bin("discharging", true); bin("balancing", Math.sin(tt / 20) > 0.2); bin("heating", false);
    set(`binary_sensor.${prefix}_online_status`, offline ? "off" : "on");
  }
  // numbers (syssi), switches, selects, buttons
  const num = (k, v, min, max, step, unit) => set(`number.${prefix}_${k}`, v, { min, max, step, unit_of_measurement: unit, mode: "box" });
  num("cell_voltage_overvoltage_protection", 3.65, 1.2, 4.35, 0.001, "V");
  num("cell_voltage_overvoltage_recovery", 3.6, 1.2, 4.35, 0.001, "V");
  num("cell_voltage_undervoltage_protection", 2.8, 1.2, 4.35, 0.001, "V");
  num("cell_voltage_undervoltage_recovery", 2.9, 1.2, 4.35, 0.001, "V");
  num("balance_trigger_voltage", 0.005, 0.003, 1, 0.001, "V");
  num("balancing_start_voltage", 3.4, 1.2, 4.25, 0.001, "V");
  num("cell_count", cells, 2, 24, 1, "");
  num("total_battery_capacity", 280, 5, 2000, 1, "Ah");
  num("power_off_voltage", 2.6, 1.2, 4.35, 0.001, "V");
  num("max_balance_current", 2, 0.3, 10, 0.1, "A");
  num("max_charge_current", 150, 1, 300, 0.1, "A");
  num("max_discharge_current", 200, 1, 300, 0.1, "A");
  num("charge_overcurrent_protection_delay", 30, 2, 600, 1, "s");
  num("discharge_overcurrent_protection_delay", 300, 2, 600, 1, "s");
  num("short_circuit_protection_delay", 1500, 0, 10000000, 1, "μs");
  num("charge_overtemperature_protection", 70, 0, 100, 0.1, "°C");
  num("charge_overtemperature_protection_recovery", 60, 0, 100, 0.1, "°C");
  num("discharge_overtemperature_protection", 70, 0, 100, 0.1, "°C");
  num("discharge_overtemperature_protection_recovery", 60, 0, 100, 0.1, "°C");
  num("charge_undertemperature_protection", -5, -40, 100, 0.1, "°C");
  num("charge_undertemperature_protection_recovery", 0, -40, 100, 0.1, "°C");
  num("mosfet_overtemperature_protection", 100, 0, 120, 0.1, "°C");
  num("mosfet_overtemperature_protection_recovery", 80, 0, 120, 0.1, "°C");
  const sw = (k, on) => set(`switch.${prefix}_${k}`, on ? "on" : "off");
  sw("charging", true); sw("discharging", true); sw("balancer", true); sw("enable_bluetooth_connection", true);
  sw("heating", false); sw("display_always_on", false); sw("smart_sleep", true);
  set(`select.${prefix}_lcd_buzzer_trigger`, "Low SoC", { options: ["Off", "Low SoC", "Battery Over Voltage", "Battery Under Voltage", "Battery Cell Over Voltage", "Battery Cell Under Voltage", "Charge Over Current", "Discharge Over Current", "Battery Over Temperature", "MOSFET Over Temperature", "System Alarm", "Battery Low Temperature", "Remote Control", "Above SoC", "MOSFET Abnormal"] });
  set(`button.${prefix}_retrieve_settings`, "unknown");
  set(`button.${prefix}_retrieve_device_info`, "unknown");
  set("sensor.other_thing_temperature", 22, { unit_of_measurement: "°C" });
  fill();
  // ESPHome node unreachable: Home Assistant marks every entity of it "unavailable"
  const down = () => { for (const id of Object.keys(states)) if (id.includes(prefix)) states[id] = { ...states[id], state: "unavailable" }; };
  if (espDown) down();

  const calls = [];
  const series = (id, from, to, step) => {
    const out = [];
    for (let s = Math.ceil(from / step) * step; s < to - step; s += step) {
      const h = s / 3600e3;
      let v;
      if (id.endsWith("total_voltage")) v = 52.6 + 1.4 * Math.sin(h / 4);
      else if (id.endsWith("_current")) v = 30 * Math.sin(h / 3) + 4;
      else if (id.endsWith("_power")) v = (30 * Math.sin(h / 3) + 4) * 53;
      else if (id.endsWith("state_of_charge")) v = 62 + 26 * Math.sin(h / 5);
      else if (id.endsWith("delta_cell_voltage")) v = 0.008 + 0.006 * Math.abs(Math.sin(h / 2));
      else if (id.includes("temperature_sensor")) v = 29 + 3 * Math.sin(h / 6);
      else if (id.includes("mosfet_temperature") || id.includes("power_tube_temperature")) v = 33 + 4 * Math.sin(h / 5);
      else v = 0;
      out.push({ start: s, end: s + step, mean: v, min: v - 0.3, max: v + 0.3 });
    }
    return out;
  };
  const hass = {
    states, entities,
    devices: { [devId]: { id: devId, name: prefix.replace(/_/g, "-"), name_by_user: null, model: "esp32dev", manufacturer: "Espressif", sw_version: "2026.10.1 (ESPHome)" } },
    locale: { language: lang }, language: lang,
    user: { is_admin: true },
    calls,
    async callWS(msg) {
      calls.push(msg);
      if (msg.type === "recorder/statistics_during_period") {
        const from = Date.parse(msg.start_time), to = Date.parse(msg.end_time), step = msg.period === "hour" ? 3600e3 : 300e3;
        const r = {};
        for (const id of msg.statistic_ids) r[id] = series(id, from, to, step);
        return r;
      }
      return {};
    },
    async callService(domain, service, data) {
      calls.push({ domain, service, data });
      const st = states[data.entity_id];
      if (!st) throw new Error("Entity not found");
      if (domain === "number") set(data.entity_id, data.value, st.attributes);
      if (domain === "switch") set(data.entity_id, service === "turn_on" ? "on" : "off", st.attributes);
      if (domain === "select") set(data.entity_id, data.option, st.attributes);
      return {};
    },
    tick() { soc = Math.max(5, Math.min(100, soc + (cur() > 0 ? 0.2 : -0.2))); fill(); if (this.espDown) down(); },
    espDown: false,
  };
  return hass;
}
