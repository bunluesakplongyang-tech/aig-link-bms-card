// The BMS screen of AIG-LINK BMS Cloud (app/src/screens/device.js) for Home Assistant: same three tabs, same cards,
// fed by the ESPHome JK-BMS entities (ha.js) instead of Firebase.
//   Dashboard · BMS info (history from the recorder) · Settings (written through Home Assistant number / switch / select)
// The ESP32 button opens the ESPHome node sheet (Bluetooth link, re-read, theme, effects, the device page in HA).
import { h, topBar, bottomNav, header, valueRow, toggleRow, buttonRow, noticeRow, kvCard, dialog, confirmDialog, toast, enterAnim } from "../../app/src/ui/dom.js";
import { SocGauge, FlowView, MetricTile, CellsView, StatusView, HistoryChart, todayWhy } from "../../app/src/ui/widgets.js";
import { svg } from "../../app/src/ui/icons.js";
import { C, fmt, duration, THEMES, currentTheme } from "../../app/src/ui/theme.js";
import { fx, setFxPref } from "../../app/src/ui/perf.js";
import { L, LANGS, LANG_NAME, LANG_EN } from "./i18n.js";
import { toBms, isCharging, isDischarging, etaSeconds, typeName, chargeStage, DEFS, GROUP, MOS_SWITCHES, SYS_SWITCHES, SELECTS, selLabel, PROTO_NAME } from "../../app/src/data/model.js";
import { ago } from "../../app/src/data/util.js";

/** BMS runtime as years / days / hours, e.g. 1Y 32D 2H (a year = 365 days); minutes only while under a day (1.0.11) */
function runtimeYDH(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return "--";
  const y = Math.floor(sec / 31536e3), dd = Math.floor((sec % 31536e3) / 86400), hh = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60);
  const out = [];
  if (y > 0) out.push(y + "Y");
  if (y > 0 || dd > 0) out.push(dd + "D");
  out.push(hh + "H");
  if (y === 0 && dd === 0) out.push(mm + "M");
  return out.join(" ");
}
import { todayEnergy, fmtE, fmtAh } from "../../app/src/data/energy.js";

const STATE_TXT = {
  offline: ["ESP32 ออฟไลน์", "ESP32 offline"],
  idle: ["รอข้อมูลจาก BMS", "Waiting for the BMS"],
  streaming: ["รับข้อมูลปกติ", "Streaming"],
};
const stateTxt = (k) => (STATE_TXT[k] ? L.t(...STATE_TXT[k]) : k || "--");

// protection pairs: [higher, lower] — the first must stay above the second (same as the app)
const PAIRS = [["cell_ovp", "cell_ovpr"], ["cell_uvpr", "cell_uvp"], ["cell_uvp", "power_off_voltage"], ["cell_ovp", "cell_uvp"],
  ["charge_otp", "charge_otpr"], ["discharge_otp", "discharge_otpr"], ["mos_otp", "mos_otpr"], ["charge_utpr", "charge_utp"],
  ["discharge_utpr", "discharge_utp"], ["heating_stop_temp", "heating_start_temp"]];
const defOf = (k) => DEFS.find((x) => x.key === k);
const TABS = { dashboard: 0, info: 1, settings: 2 };

/**
 * @param ctx { store, cfg, title(), onLang(), setTheme(id), version }
 *   store: see card.js (watch, history, todaySamples, setNumber, setSwitch, setSelect, press, device, entityOf …)
 */
export function bmsScreen(ctx) {
  const store = ctx.store, cfg = ctx.cfg;
  const only = TABS[cfg.view];                 // a single tab, no bottom bar
  let tab = only ?? TABS[cfg.tab] ?? 0;
  let s = {}, d = toBms(null, null, null, null), lastLive = null;
  const destroyers = [];

  // no TH / EN button in the top bar: the language is picked in the chip menu (1.0.14)
  const tb = topBar({ title1: "AIG-LINK", title2: " BMS" });
  const nav = only == null ? bottomNav([["gauge", "Dashboard"], ["chart", L.t("ข้อมูล BMS", "BMS Info")], ["gear", L.t("ตั้งค่า", "Settings")]], (i) => showTab(i)) : null;
  const banner = h("div", { class: "banner", style: { display: "none" } });
  const panes = [0, 1, 2].map(() => h("div", { class: "col pane", style: { display: "none" } }));
  const scroll = h("div", { class: "scroll" + (nav ? " pad-nav" : "") }, h("div", { class: "col banner-wrap" }, banner), panes);
  const el = h("div", { class: "screen" }, cfg.header === false ? null : tb, scroll, nav);
  const built = [false, false, false];

  const gwOnline = () => !!s.status?.online;
  const streaming = () => s.status?.bms === "streaming";

  // ---- charged / discharged today (data/energy.js): 5-minute SOC means from the recorder + the live reading ----
  let todayHist = null, tempHist = null, sparkHist = null;
  function applySparks() {
    if (!sparkHist || !W.tV) return;
    for (const [k, w] of [["v", W.tV], ["i", W.tA], ["p", W.tP], ["d", W.tD], ["mos", W.tM], ["t", W.tT]]) {
      const x = sparkHist[k];
      if (x && w) w.history(x.vals, x.slots, x.t0, x.step);
    }
  }
  const capAh = () => (d.valid && d.nominalAh > 0 ? d.nominalAh : +s.settings?.battery_capacity || 0);
  const energy = () => todayEnergy(todayHist,
    gwOnline() && streaming() && d.valid && !d.jk04 ? { soc: d.soc, v: d.voltage, ts: d.ts || store.now() } : null,
    capAh(), store.now(), { noSoc: !store.hasSoc() });

  function refreshHeader() {
    // title: the card's name: (or a name given to the device in Home Assistant), else the ESPHome device name + what the
    // BMS reports, e.g. "jk-bms 16S LFP" — "Smart BMS 16S LFP" when Home Assistant has no device for the entities (1.0.13)
    tb.setTitle(cfg.name || store.device()?.name_by_user || [store.device()?.name || "Smart BMS", d.valid && d.cellCount ? d.cellCount + "S" : null, d.valid ? ["LFP", "NMC", "LTO"][d.battType] : null].filter(Boolean).join(" "), "", true);
    const on = gwOnline(), st = streaming();
    const parts = [on ? (st ? L.t("ออนไลน์", "Online") : stateTxt("idle")) : L.t("ออฟไลน์", "Offline")];
    // the BMS model (device_model text sensor, e.g. JK-PB2A16S20P); the protocol only when the model is not known
    if (s.info?.model) parts.push(s.info.model);
    else if (d.proto && d.proto !== "UNKNOWN") parts.push(PROTO_NAME[d.proto] || d.proto);
    if (d.cellCount && (cfg.name || store.device()?.name_by_user)) parts.push(d.cellCount + "S");  // else already in the title
    if (seenTs) parts.push(ago(seenTs, store.now()));
    tb.setSub(parts.join(" · "), on ? (st ? "" : C.AMBER) : C.RED);
    tb.setPill({ icon: "chip", label: "ESP32", color: on ? (st ? C.GREEN : C.AMBER) : C.RED, pulse: !on || !st, onClick: espSheet, fx: "gw" });
    let b = null;
    if (!s.any) b = [C.RED, "shield", L.t("ไม่พบเซ็นเซอร์ของ BMS นี้", "No sensors found for this BMS"), L.t("ตรวจ prefix ในการตั้งค่าการ์ด", "Check the prefix in the card settings")];
    else if (!on) b = [C.RED, "wifi", L.t("ESP32 ออฟไลน์", "ESP32 offline"), (d.valid ? L.t("แสดงค่าล่าสุดเมื่อ ", "Showing the last values from ") : L.t("ติดต่อล่าสุด ", "Last seen ")) + ago(seenTs, store.now())];
    else if (!st) b = [C.AMBER, "bt", stateTxt("idle"), s.esp?.ble === false ? L.t("การเชื่อมต่อ Bluetooth ถูกปิดอยู่ · แตะเพื่อเปิด", "The Bluetooth connection is switched off · tap to turn it on") : L.t("ESP32 ออนไลน์ กำลังรอข้อมูลจาก BMS ทาง Bluetooth", "The ESP32 is online and waiting for Bluetooth data")];
    banner.style.display = b ? "" : "none";
    // rebuilt only when it says something else (1.0.6: it was rebuilt every 3 s)
    const bk = b && b.join("|") + (on && !st && s.esp?.ble === false);
    if (b && bk !== banner._k) {
      banner._k = bk;
      banner.style.setProperty("--acc", b[0]);
      banner.replaceChildren(h("span", { html: svg(b[1], 22, b[0]) }), h("div", null, h("b", null, b[2]), h("span", null, b[3])));
      const bleOff = on && !st && s.esp?.ble === false;
      banner.style.cursor = bleOff ? "pointer" : "";
      banner.onclick = bleOff ? () => store.setSwitchId(store.entityOf("ble"), true).then((r) => r.ok || toast(errText(r.msg), C.RED)) : null;
    }
  }

  // ---- tab 0: dashboard ---------------------------------------------------------
  const W = {};
  function buildDash(p) {
    W.gauge = new SocGauge();
    W.tV = new MetricTile("bolt", L.t("แรงดัน", "Voltage"), C.CYAN);
    W.tA = new MetricTile("current", L.t("กระแส", "Current"), C.GREEN);
    W.tP = new MetricTile("power", L.t("กำลังไฟ", "Power"), C.AMBER);
    W.flow = new FlowView();
    W.tD = new MetricTile("balance", L.t("ส่วนต่างเซลล์", "Cell Delta"), C.PURPLE);
    W.tM = new MetricTile("chip", "MOSFET", C.AMBER);
    W.tT = new MetricTile("temp", L.t("อุณหภูมิแบต", "Battery Temp"), C.AMBER);
    W.tC = new MetricTile("cycle", L.t("รอบชาร์จ", "Cycles"), C.BLUE);
    W.status = new StatusView(false);
    W.cells = new CellsView(0);
    W.cells.sweep = false;  // no light running across the cell bars in Home Assistant (1.0.6)
    W.cells.chemScale = true;  // bar height and colour from the chemistry's cell range (LFP 2.40–3.65 V …) (1.0.15)
    p.classList.add("dash");
    p.append(
      h("div", null, W.gauge.el, h("div", { class: "row3" }, W.tV.el, W.tA.el, W.tP.el), W.flow.el, W.status.el),
      h("div", null, h("div", { class: "row2" }, W.tD.el, W.tM.el), h("div", { class: "row2" }, W.tT.el, W.tC.el), W.cells.el));
    applySparks();
  }
  // the battery-temperature tile: T1 and T2 (app 2.0.29) — BMS info lists every probe
  const TEMP_TILE_MAX = 2;
  function updDash(fresh) {
    if (!W.gauge) return;
    const z = d.valid;
    W.gauge.offlineLabel = gwOnline() ? stateTxt(s.status?.bms) : L.t("ออฟไลน์", "Offline");
    W.gauge.set(d);
    W.flow.set(d);
    if (!z) { [W.tV, W.tA, W.tP, W.tD, W.tM, W.tT, W.tC].forEach((t) => t.set("--", t.unit, "")); W.tD.side = W.tC.side = W.tM.stats = W.tT.stats = null; }
    else {
      W.tV.setNum(d.voltage, 2, "V", `${d.cellCount}S · ${L.t("เฉลี่ย", "avg")} ${fmt(d.avgV, 3)} V`, C.CYAN);
      const ch = isCharging(d), dc = isDischarging(d);
      const stg = ch ? chargeStage(d) : null;
      W.tA.setNum(d.current, 2, "A", ch ? L.t("กำลังชาร์จ", "Charging") + (stg ? " · " + stg.name : "") : dc ? L.t("กำลังจ่ายไฟ", "Discharging") : L.t("พัก", "Idle"), ch ? C.GREEN : dc ? C.AMBER : C.CYAN);
      const eta = etaSeconds(d);
      W.tP.setNum(d.power, 0, "W", eta > 0 ? (ch ? L.t("เต็มใน ", "Full in ") : L.t("หมดใน ", "Empty in ")) + duration(eta) : "", C.AMBER);
      const dmv = d.deltaV * 1000;
      W.tD.setNum(dmv, 0, "mV", `▲${d.maxCell + 1} ▼${d.minCell + 1}`, dmv >= 30 ? C.RED : dmv >= 15 ? C.AMBER : C.PURPLE);
      const bs = balState();
      W.tD.side = { top: bs.tile, val: isFinite(d.balanceCurrent) ? fmt(d.balanceCurrent, 3) + " A" : "--", color: bs.on ? C.PURPLE : C.SUB, live: bs.on };
      const probes = d.temps.slice(0, TEMP_TILE_MAX).map((v, i) => [i, v]).filter(([, v]) => isFinite(v));
      const ts = probes.map(([, v]) => v);
      if (fresh) {
        W.tV.push(d.voltage); W.tA.push(d.current); W.tP.push(d.power); W.tD.push(dmv);
        if (isFinite(d.mosTemp)) W.tM.push(d.mosTemp);
        if (ts.length) W.tT.push(Math.max(...ts));
      }
      // 1.0.9: the big figure is the latest reading ("ล่าสุด"); beside it the highest / lowest of the last 12 hours from
      // the Home Assistant recorder (with the latest reading, which the 5-minute statistics have not caught up with) under
      // a "12 ชม. ล่าสุด" heading — before that has loaded, the samples on the sparkline (MOSFET) / the probes now (battery)
      const deg = (v) => fmt(v, 1) + "°", latest = L.t("ล่าสุด", "latest");
      const rangeRows = (head, max, min) => [[head, ""], [L.t("สูงสุด", "max"), deg(max), C.AMBER], [L.t("ต่ำสุด", "min"), deg(min), C.ICE]];
      const hm = tempHist?.mos, hb = tempHist?.bat;
      if (isFinite(d.mosTemp)) {
        const st = W.tM.sparkStats(), span = W.tM.sparkSpan();
        W.tM.setNum(d.mosTemp, 1, "°C", latest, d.mosTemp >= 70 ? C.RED : d.mosTemp >= 55 ? C.AMBER : C.GREEN);
        W.tM.stats = hm ? rangeRows(spanText(store.now() - hm.from), Math.max(hm.max, d.mosTemp), Math.min(hm.min, d.mosTemp))
          : st && st.n > 1 ? rangeRows(spanText(span * 1000), st.max, st.min) : null;
      } else { W.tM.set(d.chg || d.dsg ? "ON" : "OFF", "", L.t("สถานะ MOS", "MOS state"), C.GREEN); W.tM.stats = null; }
      if (ts.length) {
        const mx = Math.max(...ts), mn = Math.min(...ts);
        W.tT.setNum(mx, 1, "°C", latest, mx >= 50 ? C.RED : mx <= 0 ? C.ICE : C.AMBER);
        W.tT.stats = hb ? rangeRows(spanText(store.now() - hb.from), Math.max(hb.max, mx), Math.min(hb.min, mn)) : rangeRows(L.t("ตอนนี้", "now"), mx, mn);
      } else { W.tT.set("--", "°C", L.t("ไม่มีเซ็นเซอร์", "No sensor"), C.AMBER); W.tT.stats = null; }
      if (d.cycles >= 0) W.tC.setNum(d.cycles, 0, L.t("รอบ", "cyc"), `${fmt(d.remainAh, 1)} / ${fmt(d.nominalAh, 0)} Ah`, C.BLUE);
      else W.tC.set("--", "", `${fmt(d.nominalAh, 0)} Ah`, C.BLUE);
      W.tC.side = isFinite(d.cycleCapAh) && d.cycleCapAh > 0 ? { top: "Cycle cap", val: Math.round(d.cycleCapAh).toLocaleString("en-US") + " Ah", color: C.BLUE } : null;
    }
    W.status.set(d);
    W.cells.waitText = gwOnline() ? null : L.t("ESP32 ออฟไลน์", "ESP32 offline");
    W.cells.set(d);
    updToday();
  }
  // "12 ชม. ล่าสุด" — less while Home Assistant has recorded less than that
  function spanText(ms) {
    const h = ms / 3600e3;
    if (h >= 11.5) return L.t(`${Math.round(h)} ชม. ล่าสุด`, `last ${Math.round(h)} h`);
    if (h >= 1) return L.t(`${Math.floor(h)} ชม. ล่าสุด`, `last ${Math.floor(h)} h`);
    const m = Math.max(1, Math.ceil(ms / 60e3));
    return L.t(`${m} นาทีล่าสุด`, `last ${m} min`);
  }
  function updToday() {
    if (!W.gauge) return;
    W.gauge.today = energy();
    W.gauge.invalidate();
  }

  // ---- tab 1: info ---------------------------------------------------------------
  const I = {};
  let histRange = 24, histKey = "p";
  const histCache = {};
  const HK = { v: ["V", "V", 2, C.CYAN, false], i: ["A", "A", 2, C.GREEN, true], p: ["W", "W", 0, C.AMBER, true], soc: ["SOC", "%", 0, C.BLUE, false], d: ["Δ", "mV", 0, C.PURPLE, false], t: ["T", "°C", 1, C.PINK, false] };
  function buildInfo(p) {
    p.classList.add("info-grid");
    I.kvCells = kvCard(L.t("ข้อมูลเซลล์", "Cells"), "cell", C.CYAN);
    I.grid = new CellsView(1);
    I.kvBatt = kvCard(L.t("แบตเตอรี่", "Battery"), "battery", C.BLUE);
    I.hist = new HistoryChart();
    I.status = new StatusView(true);
    I.kvDev = kvCard(L.t("ข้อมูลอุปกรณ์ BMS", "BMS device"), "chip", C.BLUE);
    I.kvGw = kvCard("ESP32 · ESPHome", "wifi", C.GREEN);
    const seg = (items, cur, onPick, color) => {
      const el = h("div", { class: "seg" });
      el.style.setProperty("--acc", color);
      items.forEach(([k, label]) => el.append(h("button", { type: "button", class: k === cur ? "on" : "", onclick: (e) => { el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === e.currentTarget)); onPick(k); } }, label)));
      return el;
    };
    const histNote = h("span", { class: "link" }, L.t("จาก Home Assistant Recorder", "From the Home Assistant recorder"));
    const histBox = h("div", { class: "d-full" },
      header(L.t("ประวัติย้อนหลัง", "History"), C.PINK, histNote),
      h("div", { class: "seg-row" },
        seg([[24, L.t("24 ชม.", "24 h")], [168, L.t("7 วัน", "7 days")], [360, L.t("15 วัน", "15 days")], [720, L.t("30 วัน", "30 days")]], histRange, (k) => { histRange = k; loadHistory(); }, C.PINK),
        seg(Object.entries(HK).map(([k, v]) => [k, v[0]]), histKey, (k) => { histKey = k; drawHistory(); }, C.CYAN)),
      I.hist.el);
    p.append(
      h("div", { class: "d-full" }, I.status.el),
      h("div", { class: "d-full" }, I.grid.el),
      histBox,
      h("div", null, I.kvBatt), h("div", null, I.kvCells),
      h("div", null, I.kvDev), h("div", null, I.kvGw));
    loadHistory();
  }
  async function loadHistory() {
    const key = histRange, to = store.now(), from = to - key * 3600e3;
    I.hist.loading = true; I.hist.title = L.t("ประวัติ", "History"); I.hist.invalidate();
    if (!histCache[key] || to - histCache[key].at > 5 * 60e3) {
      let pts = [];
      try { pts = await store.history(from, to); } catch { /* recorder off */ }
      histCache[key] = { at: to, from, to, pts };
    }
    if (key !== histRange || !I.hist) return;
    I.hist.loading = false;
    drawHistory();
  }
  function drawHistory() {
    const c = histCache[histRange]; if (!c) return;
    const [, unit, dec, color, sym] = HK[histKey];
    let pts = c.pts.filter((p) => p[histKey] != null && isFinite(p[histKey])).map((p) => ({ ts: p.ts, v: +p[histKey], src: p }));
    // recorder statistics: 5-minute means up to a day, hourly beyond (ha.js) — the chart joins samples that far apart
    let stepMs = histRange <= 26 ? 300e3 : 3600e3;
    if (pts.length > 600) { const k = Math.ceil(pts.length / 600); pts = pts.filter((_, i) => i % k === 0); stepMs *= k; }
    const titles = { v: L.t("แรงดัน", "Voltage"), i: L.t("กระแส", "Current"), p: L.t("กำลังไฟ", "Power"), soc: "SOC", d: L.t("ส่วนต่างเซลล์", "Cell delta"), t: L.t("อุณหภูมิ", "Temperature") };
    const detail = (pt) => Object.entries(HK).filter(([k]) => k !== histKey && pt.src?.[k] != null && isFinite(pt.src[k]))
      .map(([k, [, u, dc]]) => `${fmt(+pt.src[k], dc)}${u === "%" || u === "°C" ? "" : " "}${u}`).join(" · ");
    I.hist.set(pts, { color, unit, dec, title: titles[histKey], from: c.from, to: c.to, symmetric: sym, detail, stepMs });
  }
  function chargeRow() {
    const stg = chargeStage(d);
    if (!stg) return [L.t("โหมดชาร์จ", "Charge stage"), L.t("BMS รุ่นนี้ไม่รายงาน", "Not reported by this BMS"), C.SUB];
    const note = isCharging(d) ? "" : isDischarging(d) ? L.t(" (ขณะจ่ายไฟ)", " (discharging)") : L.t(" (พัก)", " (idle)");
    return [L.t("โหมดชาร์จ", "Charge stage"), `${stg.name} · ${L.t(stg.th, stg.en)}${note}`, stg.color];
  }
  function updInfo() {
    if (!I.kvCells) return;
    const z = d.valid, mv = (v) => (z ? fmt(v, 3) + " V" : "--"), bs = balState();
    I.kvCells.set([
      [L.t("จำนวนเซลล์", "Cell count"), z ? d.cellCount + " S" : "--"],
      [L.t("สูงสุด", "Highest"), z ? `${mv(d.maxV)}  (#${d.maxCell + 1})` : "--", C.AMBER],
      [L.t("ต่ำสุด", "Lowest"), z ? `${mv(d.minV)}  (#${d.minCell + 1})` : "--", C.ICE],
      [L.t("เฉลี่ย", "Average"), mv(d.avgV)],
      [L.t("ส่วนต่าง", "Delta"), z ? fmt(d.deltaV * 1000, 0) + " mV" : "--", z && d.deltaV >= 0.03 ? C.RED : C.PURPLE],
      [L.t("ผลรวม", "Sum"), z ? fmt(d.cellV.reduce((a, v) => a + v, 0), 3) + " V" : "--"],
      { sec: L.t("ระบบบาลานซ์", "Balancer"), icon: "balance", color: C.PURPLE },
      [L.t("สถานะ", "State"), bs.txt, bs.on ? C.PURPLE : null],
      [L.t("กระแสบาลานซ์", "Balance current"), z && isFinite(d.balanceCurrent) ? fmt(d.balanceCurrent, 3) + " A" : "--", bs.on ? C.PURPLE : null],
      [L.t("สวิตช์บาลานซ์", "Balancer switch"), z ? (d.bal ? "ON" : "OFF") : "--", d.bal ? C.GREEN : C.SUB],
      [L.t("เริ่มเมื่อส่วนต่าง ≥", "Trigger delta ≥"), s.settings?.balance_trigger_voltage != null ? fmt(s.settings.balance_trigger_voltage * 1000, 0) + " mV" : "--"],
      ...tempRows(),
    ]);
    updBattInfo();
    I.grid.waitText = gwOnline() ? null : L.t("ESP32 ออฟไลน์", "ESP32 offline");
    I.grid.set(d); I.status.set(d);
    const inf = s.info || {}, dev = store.device() || {}, esp = s.esp || {};
    I.kvDev.set([
      [L.t("รุ่น", "Model"), inf.model || inf.bmsName], ["Hardware", inf.hw], ["Software", inf.sw],
      [L.t("หมายเลขเครื่อง", "Serial"), inf.serial], [L.t("วันผลิต", "Manufactured"), inf.mfg],
      [L.t("เปิดเครื่อง", "Power-on count"), inf.powerOn != null ? inf.powerOn + L.t(" ครั้ง", " times") : null],
    ]);
    const on = gwOnline();
    I.kvGw.set([
      [L.t("อุปกรณ์", "Device"), dev.name || store.prefix(), C.CYAN],
      [L.t("สถานะ", "State"), on ? L.t("ออนไลน์", "Online") : L.t("ออฟไลน์", "Offline"), on ? C.GREEN : C.RED],
      ["BMS", stateTxt(s.status?.bms)],
      ["Bluetooth", esp.ble == null ? null : esp.ble ? L.t("เปิด", "On") : L.t("ปิด", "Off"), esp.ble === false ? C.AMBER : null],
      ["ESPHome", dev.sw_version], [L.t("บอร์ด", "Board"), dev.model],
      ["Prefix", store.prefix()],
    ]);
  }

  function tempRows() {
    const sec = { sec: L.t("อุณหภูมิ", "Temperatures"), icon: "temp", color: C.AMBER };
    if (!d.valid) return [sec, [L.t("เซ็นเซอร์", "Sensors"), "--"]];
    const list = [];
    if (isFinite(d.mosTemp)) list.push(["MOSFET", d.mosTemp]);
    d.temps.forEach((v, i) => { if (isFinite(v)) list.push([L.t("เซ็นเซอร์ T", "Sensor T") + (i + 1), v]); });
    if (!list.length) return [sec, [L.t("เซ็นเซอร์", "Sensors"), L.t("ไม่มีข้อมูลเซ็นเซอร์", "No sensor data"), C.SUB]];
    const tc = (v) => (v >= 60 ? C.RED : v >= 45 ? C.AMBER : v <= 0 ? C.ICE : null);
    const bar = (v) => h("span", { class: "kv-t" },
      h("i", { style: { "--f": Math.max(0.03, Math.min(1, (v + 20) / 110)).toFixed(3) } }, h("i")),
      h("em", { style: tc(v) ? { color: tc(v) } : null }, fmt(v, 1) + " °C"));
    return [sec, ...list.map(([name, v]) => [name, bar(v), null, "kv-w"])];
  }

  function balState() {
    if (!d.valid) return { txt: "--", tile: "--", on: false };
    if (d.balanceAction === 1) return { txt: L.t("กำลังชาร์จบาลานซ์", "Charging cells"), tile: L.t("ชาร์จบาลานซ์", "BAL charge"), on: true };
    if (d.balanceAction === 2) return { txt: L.t("กำลังคายบาลานซ์", "Discharging cells"), tile: L.t("คายบาลานซ์", "BAL discharge"), on: true };
    if (d.balanceAction) return { txt: L.t("กำลังบาลานซ์", "Balancing"), tile: L.t("บาลานซ์", "Balancing"), on: true };
    if (!d.bal) return { txt: L.t("ปิดสวิตช์บาลานซ์", "Balancer off"), tile: L.t("บาลานซ์ปิด", "BAL off"), on: false };
    return { txt: L.t("ไม่ทำงาน", "Idle"), tile: L.t("บาลานซ์พัก", "BAL idle"), on: false };
  }

  function updBattInfo() {
    if (!I.kvBatt) return;
    const z = d.valid, eta = etaSeconds(d);
    I.kvBatt.set([
      [L.t("ชนิดแบต", "Chemistry"), z ? typeName(d) : "--"],
      [L.t("แรงดัน / กระแส", "Voltage / Current"), z ? `${fmt(d.voltage, 2)} V · ${fmt(d.current, 2)} A` : "--", C.CYAN],
      [L.t("กำลังไฟ", "Power"), z ? fmt(d.power, 0) + " W" : "--", C.AMBER],
      ...(z ? [chargeRow()] : []),
      ["SOC / SOH", z ? `${d.soc >= 0 ? d.soc + " %" : "--"} · ${d.soh ? d.soh + " %" : "--"}` : "--", C.BLUE],
      [L.t("ความจุคงเหลือ", "Remaining"), z && !d.jk04 ? `${fmt(d.remainAh, 1)} / ${fmt(d.nominalAh, 1)} Ah` : "--"],
      [isCharging(d) ? L.t("เต็มในอีก", "Full in") : L.t("ใช้ได้อีก", "Runtime left"), eta > 0 ? duration(eta) : "--"],
      [L.t("รอบชาร์จ", "Cycles"), z && d.cycles >= 0 ? `${d.cycles} · ${fmt(d.cycleCapAh, 0)} Ah` : "--"],
      [L.t("เวลาทำงาน BMS", "BMS runtime"), z && d.runtimeSec ? runtimeYDH(d.runtimeSec) : "--"],
      [L.t("ฮีตเตอร์", "Heater"), z ? (d.heating ? L.t("ทำงาน", "ON") + (isFinite(d.heatCurrent) ? ` · ${fmt(d.heatCurrent, 2)} A` : "") : L.t("ปิด", "OFF")) : "--", d.heating ? C.AMBER : null],
      ...(d.emergency ? [[L.t("โหมดฉุกเฉิน", "Emergency"), duration(d.emergency), C.RED]] : []),
      ...todayRows(),
    ]);
  }
  function todayRows() {
    const e = energy();
    if (e.why === "nosoc") return [];
    const why = todayWhy(e);
    const sign = (x) => (x > 0.004 ? "+" : "");
    const val = (kwh, ah, col, signed) => h("span", { class: "kv-e" },
      h("em", { style: { color: col || C.TEXT } }, `${signed ? sign(kwh) : ""}${fmtE(kwh)} kWh`),
      h("small", null, `${signed ? sign(ah) : ""}${fmtAh(ah)} Ah`));
    const sec = { sec: L.t("พลังงานวันนี้", "Energy today"), icon: "bolt", color: C.GREEN, right: L.t("ตั้งแต่ 00:00 น.", "since 00:00") };
    return e.ok ? [sec,
      [L.t("▲ ชาร์จเข้า", "▲ Charged in"), val(e.chgKwh, e.chgAh, C.GREEN)],
      [L.t("▼ จ่ายออก", "▼ Discharged"), val(e.dsgKwh, e.dsgAh, C.AMBER)],
      [L.t("สุทธิ", "Net"), val(e.netKwh, e.netAh, e.netAh > 0.004 ? C.GREEN : e.netAh < -0.004 ? C.AMBER : null, true)],
    ] : [sec,
      [L.t("▲ ชาร์จเข้า", "▲ Charged in"), why, C.SUB],
      [L.t("▼ จ่ายออก", "▼ Discharged"), why, C.SUB],
      [L.t("สุทธิ", "Net"), "--", C.SUB],
    ];
  }

  // ---- tab 2: settings — Home Assistant number / switch / select entities of syssi ----------------------------
  const rows = new Map();
  const busy = new Set();
  const sigOf = () => Object.keys(s.settings || {}).sort().join(",") + "|" + Object.keys(s.settingsW || {}).sort().join(",") + "|" + (cfg.readonly ? 1 : 0);
  let setSig = "";
  function buildSettings(p) {
    p.classList.add("set-grid");
    rows.clear();
    const st = s.settings || {};
    setSig = sigOf();
    const full = (...x) => h("div", { class: "d-full" }, ...x);
    p.replaceChildren();
    p.append(full(noticeRow({ icon: "shield", color: C.AMBER, title: L.t("ตั้งค่า BMS ผ่าน Home Assistant", "BMS settings through Home Assistant"),
      sub: cfg.readonly ? L.t("การ์ดนี้ตั้งเป็นอ่านอย่างเดียว (readonly: true)", "This card is read-only (readonly: true)")
        : L.t("ค่าจะส่งผ่าน Home Assistant ไปที่ ESP32 แล้วเขียนลง BMS ทาง Bluetooth · ค่าป้องกันที่ผิดอาจทำให้แบตเตอรี่เสียหาย โปรดตรวจสอบสเปคเซลล์ก่อนบันทึก", "Values go through Home Assistant to the ESP32, which writes them to the BMS over Bluetooth. Wrong protection values can damage the battery, check your cell specs first.") })));
    if (!Object.keys(st).length) {
      p.append(full(noticeRow({ icon: "info", color: C.BLUE, title: L.t("ยังไม่มีค่าตั้งจาก BMS", "No settings from the BMS yet"),
        sub: L.t("ใน YAML ของ ESPHome ต้องมี number: / switch: ของ jk_bms_ble และ ESP32 ต้องอ่านค่าจาก BMS แล้ว (กด \"อ่านค่าจาก BMS ใหม่\")", "Your ESPHome YAML needs the jk_bms_ble number: / switch: platforms, and the ESP32 must have read them (tap \"Re-read from BMS\")") })));
    }
    const mos = MOS_SWITCHES.filter((x) => x.key in st);
    if (mos.length) {
      const g = h("div", null, header(L.t("สวิตช์ควบคุม", "Control switches"), C.GREEN));
      mos.forEach((x) => g.append(switchRow(x, C.GREEN)));
      p.append(g);
    }
    for (const [gk, G] of Object.entries(GROUP)) {
      const defs = DEFS.filter((x) => x.group === gk && x.key in st);
      const sws = gk === "sys" ? SYS_SWITCHES.filter((x) => x.key in st) : [];
      if (!defs.length && !sws.length) continue;
      const g = h("div", null, header(L.t(G.th, G.en), G.color));
      defs.forEach((df) => {
        const sub = L.en && df.full === df.en ? "" : df.full;
        const r = valueRow({ icon: G.icon, title: L.t(df.th, df.en), sub, wrapSub: true, value: fmtVal(df, st[df.key]), color: G.color, onClick: () => editNumber(df, G) });
        markWritable(r, df.key);
        rows.set(df.key, r); g.append(r);
      });
      sws.forEach((x) => g.append(switchRow(x, G.color)));
      p.append(g);
    }
    for (const [gk, title, color] of [["proto", L.t("พอร์ตและโปรโตคอลสื่อสาร", "Ports & protocols"), C.BLUE], ["alarm", L.t("การแจ้งเตือน & Dry Contact", "Alarms & dry contacts"), C.PINK]]) {
      const sels = SELECTS.filter((x) => x.group === gk && x.key in st);
      if (!sels.length) continue;
      const g = h("div", null, header(title, color));
      sels.forEach((sel) => {
        const r = valueRow({ icon: sel.icon, title: L.t(sel.th, sel.en), sub: selText(sel), value: "", color, onClick: () => editSelect(sel, color) });
        markWritable(r, sel.key);
        rows.set(sel.key, r); g.append(r);
      });
      p.append(g);
    }
    if (store.hasButton("settings")) {
      p.append(full(h("div", { style: { height: "6px" } })),
        full(buttonRow({ icon: "refresh", title: L.t("อ่านค่าจาก BMS ใหม่", "Re-read from BMS"), color: C.CYAN, onClick: async (e) => {
          const b = e.currentTarget; b.classList.add("off");
          await reread();
          b.classList.remove("off");
        } })));
    }
    updSettings();
  }
  // the option list of the entity itself (syssi's) — the app's Thai names when the lists match
  const selText = (sel) => {
    const x = s.sel?.[sel.key];
    if (!x) return "--";
    if (x.i < 0) return "--";
    return x.options.length === sel.opts.length ? selLabel(sel, x.i) : x.options[x.i];
  };
  const fmtVal = (df, v) => (v == null ? "--" : `${fmt(v, df.dec)} ${df.unit}`);
  function markWritable(r, key) {
    if (cfg.readonly || !(s.settingsW || {})[key]) { r.setEnabled(false); r.dataset.ro = "1"; }
  }
  function switchRow(x, color) {
    const r = toggleRow({ icon: x.icon, title: L.t(x.th, x.en), sub: L.t(x.subTh, x.subEn), on: !!s.settings?.[x.key], color, onClick: () => flip(x, r) });
    markWritable(r, x.key);
    rows.set(x.key, r);
    return r;
  }
  function updSettings() {
    const st = s.settings || {};
    for (const [k, r] of rows) {
      if (busy.has(k)) continue;
      const df = defOf(k);
      if (df) r.setValue(fmtVal(df, st[k]));
      else if (r.setOn) r.setOn(!!st[k]);
      else { const sel = SELECTS.find((x) => x.key === k); if (sel) r.setSub(selText(sel)); }
    }
  }
  function guard(key) {
    if (cfg.readonly) { toast(L.t("การ์ดนี้ตั้งเป็นอ่านอย่างเดียว", "This card is read-only"), C.AMBER); return false; }
    if (!(s.settingsW || {})[key]) { toast(L.t("ไม่มี entity นี้ใน Home Assistant", "This entity is not in Home Assistant"), C.AMBER); return false; }
    if (!gwOnline()) { toast(L.t("ESP32 ออฟไลน์ — ตั้งค่าไม่ได้", "ESP32 offline — cannot write"), C.RED); return false; }
    if (!streaming()) { toast(L.t("ESP32 ยังไม่ได้เชื่อมต่อ BMS", "The ESP32 is not connected to the BMS"), C.AMBER); return false; }
    return true;
  }
  const errText = (m) => (/permission|unauthorized/i.test(m || "") ? L.t("บัญชี Home Assistant นี้ไม่มีสิทธิ์สั่งงาน", "This Home Assistant user may not do that")
    : /range|between|minimum|maximum/i.test(m || "") ? L.t("Home Assistant ไม่รับค่านี้: ", "Rejected by Home Assistant: ") + m
      : L.t("ไม่สำเร็จ: ", "Failed: ") + (m || "error"));
  async function reread() {
    const r = await store.press("settings");
    if (store.hasButton("info")) store.press("info");
    if (r.ok) toast(L.t("สั่ง ESP32 อ่านค่าจาก BMS ใหม่แล้ว", "Asked the ESP32 to re-read the BMS"), C.GREEN);
    else toast(errText(r.msg), C.RED);
  }

  function crossCheck(key, v) {
    const st = s.settings || {};
    for (const [hi, lo] of PAIRS) {
      const dl = defOf(lo), dh = defOf(hi);
      if (key === hi && st[lo] != null && v <= st[lo]) return L.t(`ต้องมากกว่า ${dl.th} (${fmt(st[lo], dl.dec)} ${dl.unit})`, `Must be above ${dl.en} (${fmt(st[lo], dl.dec)} ${dl.unit})`);
      if (key === lo && st[hi] != null && v >= st[hi]) return L.t(`ต้องน้อยกว่า ${dh.th} (${fmt(st[hi], dh.dec)} ${dh.unit})`, `Must be below ${dh.en} (${fmt(st[hi], dh.dec)} ${dh.unit})`);
    }
    return null;
  }
  function editNumber(df, G) {
    if (!guard(df.key)) return;
    const cur = s.settings?.[df.key];
    // the range: the entity's own (syssi knows this BMS) inside the app's limits
    const lim = store.numberRange(df.key) || {};
    const min = isFinite(lim.min) ? Math.max(df.min, lim.min) : df.min, max = isFinite(lim.max) ? Math.min(df.max, lim.max) : df.max;
    const dlg = dialog({ title: L.t(df.th, df.en), msg: L.t(`ช่วงที่ตั้งได้ ${fmt(min, df.dec)} – ${fmt(max, df.dec)} ${df.unit}\nค่าปัจจุบัน ${fmtVal(df, cur)}`, `Range ${fmt(min, df.dec)} – ${fmt(max, df.dec)} ${df.unit}\nCurrent ${fmtVal(df, cur)}`), icon: G.icon, color: G.color });
    const inp = dlg.input({ value: cur != null ? fmt(cur, df.dec) : "", inputmode: min < 0 ? "text" : "decimal", unit: df.unit });
    dlg.buttons(L.t("ยกเลิก", "Cancel"), L.t("บันทึกลง BMS", "Write to BMS"), G.color, async () => {
      const v = parseFloat(String(inp.value).replace(",", "."));
      if (!isFinite(v)) return dlg.error(L.t("กรุณากรอกตัวเลข", "Please enter a number"));
      if (v < min || v > max) return dlg.error(L.t(`ค่าต้องอยู่ระหว่าง ${fmt(min, df.dec)} – ${fmt(max, df.dec)} ${df.unit}`, `Must be between ${fmt(min, df.dec)} and ${fmt(max, df.dec)} ${df.unit}`));
      const x = crossCheck(df.key, v);
      if (x) return dlg.error(x);
      const val = +v.toFixed(df.dec);
      dlg.error(""); inp.disabled = true;
      const okBtn = dlg.panel.querySelector(".dlg-ok"), old = okBtn.textContent;
      okBtn.textContent = L.t("กำลังส่ง…", "Sending…");
      busy.add(df.key);
      const r = await store.setNumber(df.key, val);
      busy.delete(df.key);
      okBtn.textContent = old; inp.disabled = false;
      if (r.ok) { dlg.close(); toast(L.t("ส่งแล้ว: ", "Sent: ") + `${L.t(df.th, df.en)} = ${fmt(val, df.dec)} ${df.unit}`, C.GREEN); rows.get(df.key)?.setValue(fmtVal(df, val)); }
      else dlg.error(errText(r.msg));
    }).show();
  }
  function editSelect(sel, color) {
    if (!guard(sel.key)) return;
    const x = s.sel?.[sel.key];
    if (!x) return;
    const same = x.options.length === sel.opts.length;
    const label = (i) => (same ? selLabel(sel, i) : x.options[i]);
    const dlg = dialog({ title: L.t(sel.th, sel.en), msg: L.t("ค่าปัจจุบัน: ", "Current: ") + (x.i >= 0 ? label(x.i) : "--"), icon: sel.icon, color });
    const list = dlg.add(h("div", { class: "list-scroll" }));
    x.options.forEach((_, i) => {
      list.append(valueRow({ icon: i === x.i ? "check" : sel.icon, title: label(i), sub: "#" + i, value: i === x.i ? "●" : "", color: i === x.i ? C.GREEN : color, onClick: async () => {
        dlg.close();
        if (i === x.i) return;
        const row = rows.get(sel.key); row?.classList.add("busy"); busy.add(sel.key);
        const res = await store.setSelect(sel.key, i);
        busy.delete(sel.key); row?.classList.remove("busy");
        if (res.ok) { toast(L.t("ส่งแล้ว: ", "Sent: ") + label(i), C.GREEN); row?.setSub(label(i)); } else toast(errText(res.msg), C.RED);
      } }));
    });
    setTimeout(() => list.children[x.i]?.scrollIntoView({ block: "center" }), 80);
    dlg.buttons(L.t("ปิด", "Close")).show();
  }
  async function flip(x, r) {
    if (r.classList.contains("busy")) return;
    if (!guard(x.key)) return;
    const next = !r.on;
    if (x.key === "discharging" && !next && !(await confirmDialog({ title: L.t("ปิดการจ่ายไฟ?", "Turn discharging off?"), msg: L.t("โหลดทั้งหมดที่ต่อกับแบตเตอรี่นี้จะถูกตัดไฟทันที รวมถึงอินเวอร์เตอร์ และอาจรวมถึง ESP32 ถ้าใช้ไฟจากแบตชุดนี้", "Every load on this battery loses power immediately, including inverters and possibly this ESP32 if it runs from the same pack."), icon: "power", ok: L.t("ปิดการจ่ายไฟ", "Turn off") }))) return;
    if (x.key === "charging" && !next && !(await confirmDialog({ title: L.t("ปิดการชาร์จ?", "Turn charging off?"), msg: L.t("แบตเตอรี่จะไม่รับไฟชาร์จจนกว่าจะเปิดอีกครั้ง", "The battery will not accept charge until you turn it back on."), icon: "plug", ok: L.t("ปิดการชาร์จ", "Turn off") }))) return;
    if (x.warnTh && next && !(await confirmDialog({ title: L.t(x.th, x.en), msg: L.t(x.warnTh, x.warnEn), ok: L.t("เปิดใช้งาน", "Enable") }))) return;
    r.setOn(next); r.setBusy(true); busy.add(x.key);
    const res = await store.setSwitch(x.key, next);
    busy.delete(x.key); r.setBusy(false);
    if (res.ok) toast(`${L.t(x.th, x.en)}: ${next ? "ON" : "OFF"}`, C.GREEN);
    else { r.setOn(!next); toast(errText(res.msg), C.RED); }
  }
  function rebuildSettings() { if (built[2]) { buildSettings(panes[2]); if (tab === 2) enterAnim(panes[2]); } }

  // ---- ESP32 sheet (the app's gateway sheet) ------------------------------------------------------------------
  function espSheet() {
    const on = gwOnline(), dev = store.device() || {}, esp = s.esp || {};
    const msg = `${on ? L.t("ออนไลน์", "Online") : L.t("ออฟไลน์", "Offline") + (seenTs ? " · " + ago(seenTs, store.now()) : "")} · ${stateTxt(s.status?.bms)}${dev.sw_version ? " · ESPHome " + dev.sw_version : ""}`;
    const dlg = dialog({ title: dev.name || "ESP32 · ESPHome", msg, icon: "chip", color: on ? C.GREEN : C.RED });
    const add = (o) => dlg.add(valueRow({ value: "", ...o }));
    const bleId = store.entityOf("ble");
    if (bleId && !cfg.readonly) {
      const t = toggleRow({ icon: "bt", title: L.t("การเชื่อมต่อ Bluetooth", "Bluetooth connection"), sub: L.t("ESP32 ↔ BMS · ปิดเพื่อให้มือถือต่อ BMS ได้", "ESP32 ↔ BMS · turn off to let a phone connect"), on: esp.ble !== false, color: C.CYAN,
        onClick: async () => {
          const next = !t.on;
          t.setOn(next); t.setBusy(true);
          const r = await store.setSwitchId(bleId, next);
          t.setBusy(false);
          if (!r.ok) { t.setOn(!next); toast(errText(r.msg), C.RED); }
        } });
      dlg.add(t);
    }
    if (store.hasButton("settings") && !cfg.readonly) add({ icon: "refresh", title: L.t("อ่านค่าจาก BMS ใหม่", "Re-read from BMS"), sub: L.t("ข้อมูลอุปกรณ์และค่าตั้งทั้งหมด", "Device info and all settings"), color: C.BLUE, onClick: () => { dlg.close(); reread(); } });
    if (store.deviceId()) add({ icon: "ext", title: L.t("เปิดหน้าอุปกรณ์ใน Home Assistant", "Open the device in Home Assistant"), sub: dev.name || store.prefix(), color: C.PURPLE, onClick: () => { dlg.close(); store.navigate(`/config/devices/device/${store.deviceId()}`); } });
    add({ icon: "globe", title: L.t("ภาษา", "Language"), sub: LANG_NAME[L.lang], color: C.BLUE, onClick: () => { dlg.close(); langDialog(); } });
    add({ icon: "palette", title: L.t("ธีมหน้าจอ", "Theme"), sub: currentTheme().name, color: C.CYAN, onClick: () => { dlg.close(); themeDialog(); } });
    add({ icon: "sun", title: L.t("เอฟเฟกต์ภาพ", "Visual effects"), sub: fxName(fx.pref === "auto" ? "auto" : fx.pref) + (fx.pref === "auto" ? ` · ${fxName(fx.auto.level)}` : ""), color: C.PURPLE, onClick: () => { dlg.close(); fxDialog(); } });
    dlg.add(h("div", { class: "aig-ver" }, `AIG-LINK BMS card ${ctx.version} · ${store.prefix()}`));
    dlg.buttons(L.t("ปิด", "Close")).show();
  }
  // language of every AIG-LINK card on the page, remembered in this browser (1.0.14)
  function langDialog() {
    const d2 = dialog({ title: L.t("ภาษา", "Language"), icon: "globe", color: C.BLUE });
    for (const l of LANGS) d2.choice(LANG_NAME[l], LANG_EN[l], L.lang === l, () => { d2.close(); ctx.onLang(l); }, C.BLUE);
    d2.buttons(L.t("ปิด", "Close")).show();
  }
  const FX_NAME = { auto: ["อัตโนมัติ", "Automatic"], full: ["เต็ม", "Full"], lite: ["ลดลง", "Reduced"], off: ["ปิด", "Off"] };
  const fxName = (k) => L.t(...(FX_NAME[k] || FX_NAME.auto));
  function fxDialog() {
    const d2 = dialog({ title: L.t("เอฟเฟกต์ภาพ", "Visual effects"), msg: L.t("แท็บเล็ตติดผนังหรือเครื่องเก่าควรเลือก \"ลดลง\" หรือ \"ปิด\"", "Wall tablets and older devices: pick \"Reduced\" or \"Off\""), icon: "sun", color: C.PURPLE });
    const pick = (p) => { setFxPref(p); toast(L.t("เอฟเฟกต์ภาพ: ", "Visual effects: ") + fxName(p), C.PURPLE); };
    d2.choice(fxName("auto") + L.t(" (แนะนำ)", " (recommended)"), L.t(`ตรวจจากเครื่อง · ตอนนี้: ${fxName(fx.auto.level)}`, `Detected from this device · now: ${fxName(fx.auto.level)}`), fx.pref === "auto", () => pick("auto"), C.PURPLE);
    d2.choice(fxName("full"), L.t("แอนิเมชันและแสงเรืองครบ", "All animations and glows"), fx.pref === "full", () => pick("full"), C.CYAN);
    d2.choice(fxName("lite"), L.t("แอนิเมชันช้าลง ไม่มีเบลอ", "Slower animations, no blur"), fx.pref === "lite", () => pick("lite"), C.AMBER);
    d2.choice(fxName("off"), L.t("ไม่มีแอนิเมชัน — เบาที่สุด", "No animation — lightest"), fx.pref === "off", () => pick("off"), C.SUB);
    d2.buttons(L.t("ปิด", "Close")).show();
  }
  function themeDialog() {
    const d2 = dialog({ title: L.t("ธีมหน้าจอ", "Theme"), msg: cfg.theme ? L.t(`การ์ดตั้งธีมไว้ (theme: ${cfg.theme}) · เลือกที่นี่ใช้ชั่วคราวในเครื่องนี้`, `The card config sets a theme (theme: ${cfg.theme}) · a pick here is temporary`) : L.t("เปลี่ยนสีทั้งการ์ด · จำไว้ในเครื่องนี้", "Recolours the card · remembered on this device"), icon: "palette", color: C.CYAN });
    const cur = currentTheme().id;
    d2.add(h("div", { class: "th-grid" }, THEMES.map((t) => {
      const p = t.p;
      const b = h("button", { type: "button", class: "th-card" + (t.id === cur ? " on" : ""), "aria-pressed": String(t.id === cur), onclick: () => { d2.close(); if (t.id !== cur) ctx.setTheme(t.id); } },
        h("span", { class: "th-prev" },
          h("i", { class: "th-ring" }),
          h("span", { class: "th-bars" }, h("b"), h("b"), h("b")),
          h("span", { class: "th-dots" }, [p.GREEN, p.AMBER, p.RED, p.PURPLE, p.BLUE].map((c) => h("i", { style: { background: c } })))),
        h("span", { class: "th-name" }, t.name, t.id === "neon" ? h("small", null, L.t("ค่าเริ่มต้น", "Default")) : null),
        h("span", { class: "th-sub" }, L.t(t.th, t.en).replace(/^ค่าเริ่มต้น · |^Default · /, "")),
        t.id === cur ? h("span", { class: "th-ok", html: svg("check", 14, p.BG, 3) }) : null);
      for (const [k, v] of Object.entries({ bg: p.BG, bg2: p.BG2, card: p.CARD, hi: p.CARD_HI, st: p.STROKE, tx: p.TEXT, sub: p.SUB, a: p.CYAN, g2: p.G2, gr: p.GREEN, am: p.AMBER })) b.style.setProperty("--t-" + k, v);
      return b;
    })));
    d2.buttons(L.t("ปิด", "Close")).show();
  }

  // ---- data ---------------------------------------------------------------------------
  // when the ESP32 drops off every entity turns "unavailable" — the time of the last reading is kept here
  let seenTs = 0;
  function onData(snap, fresh) {
    s = snap || {};
    if (s.ts) seenTs = Math.max(seenTs, s.ts);
    // the last reading stays on screen (dimmed as "stale") while the BMS or the ESP32 is away
    let live = s.live;
    if (live) lastLive = live; else if (lastLive) live = lastLive;
    d = toBms(live, { proto: store.proto() }, null, s.settings);
    d.stale = d.valid && (!gwOnline() || !streaming());
    refreshHeader();
    // the dashboard always (its sparklines keep their samples); BMS info and Settings only while they show — they are
    // lists of HTML rows, refreshed when their tab is opened (1.0.6: hidden tabs were rebuilt on every reading)
    updDash(fresh && !!s.live);
    if (tab === 1) updInfo();
    if (tab === 2 && built[2]) { if (sigOf() !== setSig) rebuildSettings(); else updSettings(); }
  }

  function showTab(i) {
    tab = i;
    nav?.select(i);
    if (!built[i]) { [buildDash, buildInfo, buildSettings][i](panes[i]); built[i] = true; }
    onData(s, false);
    panes.forEach((p, k) => { p.style.display = k === i ? "" : "none"; });
    enterAnim(panes[i]);
    if (i === 0) W.gauge?.replay();
    ctx.onTab?.(i);
  }

  showTab(Math.min(2, Math.max(0, tab)));
  destroyers.push(store.watch(onData));
  destroyers.push(store.watchToday((t) => { todayHist = t; updToday(); if (tab === 1) updBattInfo(); }));
  destroyers.push(store.watchTemps((t) => { tempHist = t; updDash(false); }, 12, TEMP_TILE_MAX));
  // 1.0.10: the tiles' sparklines are Home Assistant's recorder — 6 h, MOSFET / battery temperature 12 h — with the
  // reading of right now as their newest point (updDash's push() moves it); a tile without history keeps its own samples
  destroyers.push(store.watchSparks((sp) => { sparkHist = sp; applySparks(); }, TEMP_TILE_MAX));
  // the canvases leave the frame loop and their observers with the screen (1.0.6: the ones on hidden tabs stayed —
  // one more set each time the language or the theme was changed)
  destroyers.push(() => [...Object.values(W), ...Object.values(I)].forEach((w) => w?.destroy?.()));
  const tick = setInterval(() => { refreshHeader(); if (tab === 1) updInfo(); }, 3000);
  destroyers.push(() => clearInterval(tick));

  return { el, destroy() { destroyers.forEach((f) => { try { f(); } catch { /* */ } }); } };
}
