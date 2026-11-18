// AIG-LINK BMS card for Home Assistant — custom:aig-link-bms-card
//
//   type: custom:aig-link-bms-card
//   prefix: jk_bms          # entity prefix of the ESPHome JK-BMS (sensor.jk_bms_total_voltage) — found by itself if left out
//   name: Battery           # title (default: the ESPHome device name)
//   view: full              # full (Dashboard / BMS Info / Settings) · dashboard · info · settings
//   theme: neon             # neon · carbon · solar · synth (default: the one picked in the card, else neon)
//   language: auto          # auto (Home Assistant's language) · th · en
//   background: true        # the app's dark backdrop (false: transparent, takes the dashboard's background)
//   header: true            # the AIG-LINK top bar
//   readonly: false         # true: settings and switches can be looked at, not changed
//   protocol: JK02_32S      # optional: JK04 · JK02_24S · JK02_32S (shown in the header; JK04 has no SOC)
//   entities: { soc: sensor.my_soc }   # optional: any value from another entity (keys: see ha.js LIVE / NUMBERS / SWITCHES)
import { AIG } from "./host.js";
import { applyTheme, currentTheme, THEMES, C } from "../../app/src/ui/theme.js";
import { L, LANGS, LANG_NAME } from "./i18n.js";
import { h, noticeRow, toast } from "../../app/src/ui/dom.js";
import { thaiDay, thaiMidnight } from "../../app/src/data/energy.js";
import { bmsScreen } from "./screen.js";
import { findBms, resolve, watchedIds, snapshot, loadHistory, loadSocSamples, loadTempStats, loadSparks, prettify } from "./ha.js";

/* global __CARD_VERSION__ */
const VERSION = typeof __CARD_VERSION__ === "string" ? __CARD_VERSION__ : "dev";
const VIEWS = ["full", "dashboard", "info", "settings"];
const PROTOS = ["JK04", "JK02_24S", "JK02_32S"];
const mounted = new Set();  // cards on screen — language / theme changes rebuild all of them

// ---- the Home Assistant side of the app's "store" ------------------------------------------------------------
class HaStore {
  constructor(card) { this.card = card; this.hass = null; this.r = null; this.refs = []; this.subs = new Set(); this.t = 0; this.resolvedAt = 0; }
  get cfg() { return this.card._cfg; }
  setHass(hass) {
    this.hass = hass;
    const now = Date.now();
    // entities can appear later (ESPHome node added, YAML changed) — look again every minute
    if (!this.r || this.r.prefix !== this.card._prefix || now - this.resolvedAt > 60e3) {
      this.r = this.card._prefix ? resolve(hass, this.card._prefix, this.cfg.entities || {}) : null;
      this.resolvedAt = now;
      this.ids = this.r ? watchedIds(this.r) : [];
      this.refs = [];
    }
    // nobody listening (the card is not on screen): nothing to compare — watch() reads the states afresh (1.0.6)
    if (!this.r || !this.subs.size) return;
    // only our entities count: a change anywhere else in Home Assistant is ignored
    let changed = this.refs.length !== this.ids.length;
    for (let k = 0; k < this.ids.length; k++) {
      const st = hass.states[this.ids[k]];
      if (st !== this.refs[k]) { this.refs[k] = st; changed = true; }
    }
    // one emit per BMS frame: syssi publishes ~40 entities within a few ms every throttle period
    if (changed && !this.t) this.t = setTimeout(() => { this.t = 0; this.emit(true); }, 250);
  }
  emit(fresh) {
    if (!this.r || !this.hass || !this.subs.size) return;
    this.last = snapshot(this.hass, this.r);
    this.subs.forEach((cb) => { try { cb(this.last, fresh); } catch (e) { console.error("aig-link-bms-card", e); } });
  }
  // --- used by screen.js ---
  now() { return Date.now(); }
  prefix() { return this.r?.prefix || this.card._prefix || ""; }
  watch(cb) {
    this.subs.add(cb);
    if (this.r && this.hass) { this.last = snapshot(this.hass, this.r); cb(this.last, false); }
    const iv = setInterval(() => this.emit(false), 15000);  // "x s ago", stale detection
    return () => { this.subs.delete(cb); clearInterval(iv); };
  }
  history(from, to) { return this.r ? loadHistory(this.hass, this.r, from, to) : Promise.resolve([]); }
  // today's samples for energy.js — 5-minute statistics since 00:00, refreshed every 5 minutes
  watchToday(cb) {
    let closed = false, day = "";
    const load = async () => {
      if (!this.r?.live.soc || !this.hass) { cb({ day: thaiDay(Date.now()), pts: [] }); return; }
      const now = Date.now();
      day = thaiDay(now);
      let pts = [];
      try { pts = await loadSocSamples(this.hass, this.r, thaiMidnight(now), now); } catch { /* recorder off */ }
      if (!closed) cb({ day, pts });
    };
    const first = setTimeout(load, 400);
    const iv = setInterval(() => { if (thaiDay(Date.now()) !== day || Date.now() % 300e3 < 30e3) load(); }, 30e3);
    return () => { closed = true; clearTimeout(first); clearInterval(iv); };
  }
  // fn() soon after the start, then just after each 5-minute statistic is written (the recorder compiles them a few
  // seconds after every 5 minutes) — 1.0.10
  every5min(fn) {
    let closed = false, timer = 0;
    const run = async () => { if (closed) return; try { await fn(() => closed); } catch { /* recorder off */ } next(); };
    const next = () => { if (!closed) timer = setTimeout(run, 300e3 - (Date.now() % 300e3) + 30e3); };
    timer = setTimeout(run, 700);
    return () => { closed = true; clearTimeout(timer); };
  }
  // lowest / highest / mean MOSFET and battery temperature of the last `hours` from the recorder (ha.js loadTempStats)
  watchTemps(cb, hours = 12, probes = 2) {
    return this.every5min(async (closed) => {
      if (!this.r || !this.hass) return;
      const now = Date.now(), st = await loadTempStats(this.hass, this.r, now - hours * 3600e3, now, probes);
      if (!closed()) cb(st);
    });
  }
  // the dashboard tiles' sparklines from the recorder (ha.js loadSparks) — 6 h, MOSFET / battery temperature 12 h
  watchSparks(cb, probes = 2) {
    return this.every5min(async (closed) => {
      if (!this.r || !this.hass) return;
      const sp = await loadSparks(this.hass, this.r, Date.now(), { v: 6, i: 6, p: 6, d: 6, mos: 12, t: 12 }, probes);
      if (!closed()) cb(sp);
    });
  }
  hasSoc() { return !!this.r?.live.soc; }
  proto() { return PROTOS.includes(this.cfg.protocol) ? this.cfg.protocol : "UNKNOWN"; }
  hasButton(k) { return !!this.r?.buttons[k]; }
  entityOf(k) { return this.r?.live[k] || null; }
  deviceId() {
    const id = this.r && (this.r.live.v || this.r.cells[0]);
    return (id && this.hass?.entities?.[id]?.device_id) || null;
  }
  device() { const id = this.deviceId(); return (id && this.hass?.devices?.[id]) || null; }
  numberRange(key) {
    const st = this.hass?.states[this.r?.numbers[key]];
    return st ? { min: +st.attributes?.min, max: +st.attributes?.max, step: +st.attributes?.step } : null;
  }
  async call(domain, service, data) {
    try { await this.hass.callService(domain, service, data); return { ok: true }; }
    catch (e) { return { ok: false, msg: e?.message || e?.code || String(e) }; }
  }
  setNumber(key, value) { const id = this.r?.numbers[key]; return id ? this.call("number", "set_value", { entity_id: id, value }) : Promise.resolve({ ok: false, msg: "no entity" }); }
  setSwitch(key, on) { return this.setSwitchId(this.r?.switches[key], on); }
  setSwitchId(id, on) { return id ? this.call("switch", on ? "turn_on" : "turn_off", { entity_id: id }) : Promise.resolve({ ok: false, msg: "no entity" }); }
  setSelect(key, i) {
    const id = this.r?.selects[key], opts = this.hass?.states[id]?.attributes?.options || [];
    return id && opts[i] != null ? this.call("select", "select_option", { entity_id: id, option: opts[i] }) : Promise.resolve({ ok: false, msg: "no entity" });
  }
  press(key) { const id = this.r?.buttons[key]; return id ? this.call("button", "press", { entity_id: id }) : Promise.resolve({ ok: false, msg: "no entity" }); }
  navigate(path) {
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }
}

// ---- the card ------------------------------------------------------------------------------------------------
class AigLinkBmsCard extends HTMLElement {
  constructor() {
    super();
    this._cfg = {};
    this._prefix = "";
    this._store = new HaStore(this);
    this._sh = this.attachShadow({ mode: "open" });
    AIG.style(this._sh);
    this._box = h("div", { class: "aig-base aig" });
    this._sh.appendChild(this._box);
    this._tab = null;
  }
  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    const c = { ...config };
    if (c.view && !VIEWS.includes(c.view)) throw new Error(`view: ${c.view} — use ${VIEWS.join(", ")}`);
    if (c.theme && !THEMES.some((t) => t.id === c.theme)) throw new Error(`theme: ${c.theme} — use ${THEMES.map((t) => t.id).join(", ")}`);
    if (c.entities && typeof c.entities !== "object") throw new Error("entities: must be a map (key: entity_id)");
    const same = JSON.stringify(c) === JSON.stringify(this._cfg);
    this._cfg = c;
    if (!same && this._screen) this._remount();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // no BMS found yet: look again at most every 10 s, not on every state change in Home Assistant (1.0.6)
    if (this._cfg.prefix !== this._prefixFrom || (!this._prefix && Date.now() - (this._pickAt || 0) > 10e3)) this._pickPrefix();
    this._store.setHass(hass);
    if ((first || !this._screen) && this.isConnected) this._mount();
  }
  get hass() { return this._hass; }
  _pickPrefix() {
    this._prefixFrom = this._cfg.prefix;
    this._pickAt = Date.now();
    if (this._cfg.prefix) { this._prefix = String(this._cfg.prefix).replace(/^sensor\./, "").replace(/_total_voltage$/, ""); return; }
    this._prefix = findBms(this._hass)[0]?.prefix || "";
  }
  connectedCallback() {
    AIG.fonts();
    AIG.attach(this);
    this._box.classList.toggle("flat", this._cfg.background === false);
    if (this._hass && !this._screen) this._mount();
  }
  disconnectedCallback() {
    this._unmount();
    AIG.detach(this);
  }
  _mount() {
    if (this._screen || !this._hass) return;
    this._applyPrefs();
    this._box.classList.toggle("flat", this._cfg.background === false);
    const found = this._prefix && this._store.r && Object.keys(this._store.r.live).length > 2;
    if (!found) { this._setup(); return; }
    this._screen = bmsScreen({
      store: this._store, cfg: { ...this._cfg, tab: this._tab != null ? ["dashboard", "info", "settings"][this._tab] : this._cfg.tab }, version: VERSION,
      title: () => this._cfg.name || this._store.device()?.name_by_user || this._store.device()?.name || prettify(this._prefix),
      // a language picked in the chip menu wins over the card config from now on, in this browser (aigLangPicked)
      onLang: (l) => { try { localStorage.setItem("aigLangPicked", "1"); } catch { /* */ } L.set(l === undefined ? !L.en : l); toast(LANG_NAME[L.lang]); [...mounted].forEach((c) => c._remount()); },
      // a theme picked in the card wins over the card config until the page reloads
      setTheme: (id) => { AigLinkBmsCard._themePicked = true; const t = applyTheme(id); [...mounted].forEach((c) => c._remount()); toast(L.t("ธีม: ", "Theme: ") + t.name, C.CYAN); },
      onTab: (i) => { this._tab = i; },
    });
    const bg = this._cfg.background === false ? null : h("div", { class: "aig-bg" });
    this._box.replaceChildren(...[bg, this._screen.el].filter(Boolean));
    mounted.add(this);
  }
  _unmount() {
    mounted.delete(this);
    if (this._screen) { try { this._screen.destroy(); } catch { /* */ } this._screen = null; }
    clearTimeout(this._setupT);
  }
  _remount() { this._unmount(); this._box.replaceChildren(); if (this.isConnected) this._mount(); }
  // language and theme from the card config (once per page — they are shared by every AIG-LINK card)
  _applyPrefs() {
    const lang = this._cfg.language;
    let picked = false;
    try { picked = localStorage.getItem("aigLangPicked") === "1"; } catch { /* */ }
    if (picked) { /* chosen in the chip menu: i18n.js already loaded it (aigLang) */ }
    else if (LANGS.includes(lang)) { if (L.lang !== lang) L.set(lang); }
    else if (!AigLinkBmsCard._langDone) {
      let saved = null;
      try { saved = localStorage.getItem("aigLang"); } catch { /* */ }
      // Home Assistant's language when the card speaks it, else English
      if (!saved) { const hl = String(this._hass?.locale?.language || this._hass?.language || "th").toLowerCase().slice(0, 2); L.set(LANGS.includes(hl) ? hl : "en"); }
    }
    AigLinkBmsCard._langDone = true;
    if (this._cfg.theme && currentTheme().id !== this._cfg.theme && !AigLinkBmsCard._themePicked) applyTheme(this._cfg.theme, { save: false });
  }
  // no BMS found: say what was looked for and list what is there
  _setup() {
    const list = findBms(this._hass);
    const msg = this._prefix
      ? L.t(`ไม่พบ sensor.${this._prefix}_total_voltage ใน Home Assistant`, `sensor.${this._prefix}_total_voltage is not in Home Assistant`)
      : L.t("ไม่พบ JK-BMS (ESPHome syssi) ใน Home Assistant", "No JK-BMS (ESPHome syssi) found in Home Assistant");
    const sub = list.length
      ? L.t("ที่พบ: ", "Found: ") + list.map((b) => `${b.prefix} (${b.cells}S)`).join(", ") + L.t(" — ใส่ใน prefix: ของการ์ด", " — put one in the card's prefix:")
      : L.t("การ์ดหา sensor.<prefix>_total_voltage ที่มี cell_voltage_1 หรือ state_of_charge — ตรวจว่า ESPHome node ถูกเพิ่มใน Home Assistant แล้ว", "The card looks for sensor.<prefix>_total_voltage with cell_voltage_1 or state_of_charge — check the ESPHome node is added to Home Assistant");
    this._box.replaceChildren(h("div", { class: "col aig-setup" }, noticeRow({ icon: "battery", color: C.AMBER, title: msg, sub })));
    // try again when entities show up
    clearTimeout(this._setupT);
    this._setupT = setTimeout(() => { if (!this._screen && this.isConnected) { this._pickPrefix(); this._store.setHass(this._hass); this._mount(); } }, 5000);
  }
  getCardSize() { return this._cfg.view && this._cfg.view !== "full" ? 10 : 16; }
  getGridOptions() { return { columns: "full", rows: "auto", min_columns: 6 }; }
  static getConfigElement() { return document.createElement("aig-link-bms-card-editor"); }
  static getStubConfig(hass) { const b = findBms(hass)[0]; return b ? { prefix: b.prefix } : {}; }
}

// ---- visual editor ------------------------------------------------------------------------------------------
const LABELS = {
  prefix: ["BMS (prefix ของ entity)", "BMS (entity prefix)"],
  name: ["ชื่อที่แสดง", "Title"],
  view: ["หน้าที่แสดง", "View"],
  theme: ["ธีม", "Theme"],
  language: ["ภาษา", "Language"],
  protocol: ["โปรโตคอล BMS (ไม่บังคับ)", "BMS protocol (optional)"],
  background: ["พื้นหลังแบบแอป", "App background"],
  header: ["แถบหัว AIG-LINK", "AIG-LINK top bar"],
  readonly: ["อ่านอย่างเดียว", "Read-only"],
};
class AigLinkBmsCardEditor extends HTMLElement {
  setConfig(config) { this._cfg = { ...config }; this._render(); }
  set hass(hass) { this._hass = hass; this._render(); }
  _th() { return String(this._hass?.locale?.language || this._hass?.language || "").toLowerCase().startsWith("th"); }
  _render() {
    if (!this._hass || !this._cfg) return;
    const th = this._th(), t = (k) => LABELS[k][th ? 0 : 1];
    // the BMS list is looked up at most every 10 s, and the form is given a new schema / data only when they change —
    // Home Assistant hands the editor a new hass on every state change (1.0.6: it rebuilt the whole form each time)
    if (!this._bms || Date.now() - this._bmsAt > 10e3) { this._bms = findBms(this._hass); this._bmsAt = Date.now(); }
    const bms = this._bms;
    const schema = [
      { name: "prefix", selector: { select: { mode: "dropdown", custom_value: true, options: bms.map((b) => ({ value: b.prefix, label: `${b.name} · ${b.prefix} · ${b.cells}S` })) } } },
      { name: "name", selector: { text: {} } },
      { type: "grid", name: "", schema: [
        { name: "view", selector: { select: { mode: "dropdown", options: [
          { value: "full", label: th ? "ครบ 3 แท็บ" : "All 3 tabs" }, { value: "dashboard", label: "Dashboard" },
          { value: "info", label: th ? "ข้อมูล BMS" : "BMS Info" }, { value: "settings", label: th ? "ตั้งค่า" : "Settings" }] } } },
        { name: "theme", selector: { select: { mode: "dropdown", options: THEMES.map((x) => ({ value: x.id, label: x.name })) } } },
        { name: "language", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: th ? "ตาม Home Assistant" : "Home Assistant's" }, ...LANGS.map((l) => ({ value: l, label: LANG_NAME[l] }))] } } },
        { name: "protocol", selector: { select: { mode: "dropdown", options: PROTOS.map((p) => ({ value: p, label: p })) } } },
      ] },
      { type: "grid", name: "", schema: [
        { name: "background", selector: { boolean: {} } }, { name: "header", selector: { boolean: {} } }, { name: "readonly", selector: { boolean: {} } },
      ] },
    ];
    const data = { view: "full", language: "auto", background: true, header: true, readonly: false, ...this._cfg };
    if (!customElements.get("ha-form")) {
      this.innerHTML = `<p style="padding:8px">${th ? "แก้ไขด้วย YAML: prefix, name, view, theme, language" : "Edit in YAML: prefix, name, view, theme, language"}</p>`;
      return;
    }
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => (LABELS[s.name] ? t(s.name) : s.name);
      this._form.addEventListener("value-changed", (e) => {
        const v = { ...e.detail.value };
        // keep the YAML short: defaults are left out
        for (const [k, def] of Object.entries({ view: "full", language: "auto", background: true, header: true, readonly: false })) if (v[k] === def) delete v[k];
        for (const k of Object.keys(v)) if (v[k] === "" || v[k] == null) delete v[k];
        this._cfg = { type: this._cfg.type, ...v };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._cfg }, bubbles: true, composed: true }));
      });
      this.replaceChildren(this._form);
    }
    this._form.hass = this._hass;
    const sig = JSON.stringify([schema, data]);
    if (sig !== this._sig) { this._sig = sig; this._form.schema = schema; this._form.data = data; }
  }
}

if (!customElements.get("aig-link-bms-card")) {
  customElements.define("aig-link-bms-card", AigLinkBmsCard);
  customElements.define("aig-link-bms-card-editor", AigLinkBmsCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "aig-link-bms-card",
    name: "AIG-LINK BMS",
    description: "JK-BMS (ESPHome syssi) — Dashboard / BMS Info / Settings in the AIG-LINK BMS look",
    preview: true,
    documentationURL: "https://github.com/bunluesakplongyang-tech/aig-link-bms-card",
  });
  console.info(`%c AIG-LINK BMS card %c ${VERSION} `, "background:#00E5FF;color:#060A13;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px", "background:#8B5CF6;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px");
}
