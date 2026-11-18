// What the app modules see as "the page" when they run inside Home Assistant (build.mjs points them here):
//   AIG.root     stands in for <html>: theme variables, the effects classes (fx-lite / fx-off), data-theme and lang
//                go to every mounted card and to the overlay layer instead of Home Assistant's own <html>
//   AIG.layer()  where dialogs and toasts are appended — a styled shadow root on <body>, above Home Assistant
//   AIG.sheets() the card style sheet (theme.js reads which var(--x-rrggbb) colours it uses)
// No imports from the app here: this module must be evaluated before them.

const hosts = new Set();
const vars = new Map();   // CSS custom property → value
const classes = new Map(); // class → on
const data = {};

const fanOut = (fn) => hosts.forEach((el) => { try { fn(el); } catch { /* element gone */ } });

const root = {
  lang: "th",
  style: {
    setProperty(k, v) { vars.set(k, v); fanOut((el) => el.style.setProperty(k, v)); },
    removeProperty(k) { vars.delete(k); fanOut((el) => el.style.removeProperty(k)); },
  },
  classList: {
    toggle(c, on) { const v = on === undefined ? !classes.get(c) : !!on; classes.set(c, v); fanOut((el) => el.classList.toggle(c, v)); return v; },
    add(c) { this.toggle(c, true); },
    remove(c) { this.toggle(c, false); },
    contains: (c) => !!classes.get(c),
  },
  dataset: new Proxy(data, { set(t, k, v) { t[k] = v; fanOut((el) => { el.dataset[k] = v; }); return true; } }),
};

// styles and fonts come from build.mjs (esbuild define) — ready before any app module asks for them
/* global __CARD_CSS__, __FONT_CSS__ */
const cssText = typeof __CARD_CSS__ === "string" ? __CARD_CSS__ : "";
const FONT_CSS = typeof __FONT_CSS__ === "string" ? __FONT_CSS__ : "";
let sheet = null, fontsDone = false, layerHost = null, layerBox = null;
try { sheet = new CSSStyleSheet(); sheet.replaceSync(cssText); } catch { sheet = false; }

/** the shared style sheet (constructable where supported, else a <style> per shadow root) */
function styleFor(shadow) {
  if (sheet && "adoptedStyleSheets" in shadow) shadow.adoptedStyleSheets = [sheet];
  else { const s = document.createElement("style"); s.textContent = cssText; shadow.appendChild(s); }
}

function fonts() {
  if (fontsDone || document.getElementById("aig-link-bms-fonts")) { fontsDone = true; return; }
  const s = document.createElement("style");
  s.id = "aig-link-bms-fonts";
  s.textContent = FONT_CSS;
  document.head.appendChild(s);
  fontsDone = true;
}

export const AIG = {
  root,
  /** registers the fonts on the page (once) */
  fonts,
  /** a shadow root of ours gets the card styles */
  style: styleFor,
  /** an element that shows app content: it receives the theme variables and effects classes */
  attach(el) {
    hosts.add(el);
    for (const [k, v] of vars) el.style.setProperty(k, v);
    for (const [c, on] of classes) el.classList.toggle(c, on);
    for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
  },
  detach(el) { if (el !== layerHost) hosts.delete(el); },
  sheets: () => {
    if (sheet) return [sheet];
    const s = layerHost?.shadowRoot?.querySelector("style");
    return s?.sheet ? [s.sheet] : [];
  },
  /** dialogs / toasts: one overlay for the page, created on first use */
  layer() {
    if (layerBox && layerHost?.isConnected) return layerBox;
    if (!customElements.get("aig-link-bms-layer")) customElements.define("aig-link-bms-layer", class extends HTMLElement {});
    layerHost = document.createElement("aig-link-bms-layer");
    const sh = layerHost.attachShadow({ mode: "open" });
    styleFor(sh);
    layerBox = document.createElement("div");
    layerBox.className = "aig-base aig-layer";
    sh.appendChild(layerBox);
    // typing in a dialog must not reach Home Assistant's keyboard shortcuts
    for (const t of ["keydown", "keyup", "keypress"]) layerBox.addEventListener(t, (e) => e.stopPropagation());
    document.body.appendChild(layerHost);
    this.attach(layerHost);
    return layerBox;
  },
};
