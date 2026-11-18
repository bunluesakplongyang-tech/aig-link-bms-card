// AIG-LINK BMS v1.6.7 palette (Ui.java) + small helpers
//
// Themes (app 2.0.27): the same layout in four colour sets. "neon" — the original look — is the default and is drawn
// exactly as before: nothing is overridden for it. Another theme
//   · replaces the values of C (every canvas card and screen reads C when it draws / is built),
//   · sets the palette CSS variables (--bg, --cyan, … on <html>),
//   · and maps every other colour that style.css or a widget wrote out literally (a darker card shade, a light tint)
//     onto the theme with tone(): style.css writes them as var(--x-rrggbb, #rrggbb), so the fallback is the
//     original colour and only a theme sets the variable.
export const C = {
  BG: "#060A13", BG2: "#0B1220", CARD: "#0E1628", CARD_HI: "#142038", STROKE: "#1B2843",
  TEXT: "#EAF2FF", SUB: "#7F8DAB", DIM: "#46526E",
  CYAN: "#00E5FF", GREEN: "#2BFFA8", AMBER: "#FFB020", RED: "#FF4D6D", PINK: "#FF4FD8", PURPLE: "#8B5CF6", BLUE: "#3D7BFF",
  ICE: "#7FA9FF", TRACK: "#1A2640", ALARM_TX: "#FFB3C1",
  G2: "#8B5CF6",  // second brand colour: logo / button / backdrop gradients with CYAN (= PURPLE in the original look)
};

// CYAN is each theme's main accent (voltage, logo, links); the others keep their meaning (GREEN charging, AMBER
// power / discharging, RED alarms, PURPLE balance, BLUE standby / info) and stay apart from each other and from CYAN.
export const THEMES = [
  { id: "neon", name: "AIG Neon", th: "ค่าเริ่มต้น · ฟ้านีออนบนน้ำเงินเข้ม", en: "Default · neon cyan on deep navy", p: { ...C } },
  { id: "carbon", name: "Carbon Volt", th: "ดำกราไฟต์ · เขียวโวลต์สไตล์รถ EV", en: "Graphite black · EV-style volt green",
    p: { BG: "#060707", BG2: "#0D0F10", CARD: "#111415", CARD_HI: "#191D1F", STROKE: "#272C2F", TEXT: "#F0F4F1", SUB: "#8B958F", DIM: "#4A524E",
      CYAN: "#C6FF3D", GREEN: "#2CF5A3", AMBER: "#FF9F1C", RED: "#FF4B4B", PINK: "#FF5EA8", PURPLE: "#A08CFF", BLUE: "#38B6FF",
      ICE: "#95D5FF", TRACK: "#1C2123", ALARM_TX: "#FFB8B8", G2: "#00D2A0" } },
  { id: "solar", name: "Solar Flare", th: "ดำอุ่น · ทองแสงอาทิตย์และส้มเปลวไฟ", en: "Warm black · sun gold and flare orange",
    p: { BG: "#0B0705", BG2: "#140D08", CARD: "#19110B", CARD_HI: "#24180F", STROKE: "#3A2717", TEXT: "#FFF3E4", SUB: "#B49B86", DIM: "#6B5545",
      CYAN: "#FFC233", GREEN: "#5DF59A", AMBER: "#FF7A2E", RED: "#FF3D5E", PINK: "#FF6AA6", PURPLE: "#C084FC", BLUE: "#58A8FF",
      ICE: "#A6CCFF", TRACK: "#2A1D13", ALARM_TX: "#FFC0C8", G2: "#FF5A36" } },
  { id: "synth", name: "Synthwave", th: "ม่วงยามค่ำ · ชมพูนีออนและฟ้าไซเบอร์", en: "Midnight violet · neon magenta and cyber blue",
    p: { BG: "#08040F", BG2: "#0F0819", CARD: "#150B23", CARD_HI: "#1F1233", STROKE: "#33204F", TEXT: "#F8EEFF", SUB: "#A593C6", DIM: "#5D4C7E",
      CYAN: "#FF3BD4", GREEN: "#3BFFB8", AMBER: "#FFC93C", RED: "#FF4A4A", PINK: "#FF8A5B", PURPLE: "#9E6BFF", BLUE: "#4C7DFF",
      ICE: "#8FD0FF", TRACK: "#241539", ALARM_TX: "#FFB8C6", G2: "#22D9FF" } },
];
export const DEFAULT_THEME = "neon";
const DEF = THEMES[0].p;

const hex2 = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// alpha 0..255 like Ui.alpha
export function alpha(hex, a) {
  const [r, g, b] = hex2(hex);
  return `rgba(${r},${g},${b},${(Math.max(0, Math.min(255, a)) / 255).toFixed(3)})`;
}
export function mix(h1, h2, f) {
  f = clamp01(f);
  const a = hex2(h1), b = hex2(h2);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, "0")).join("");
}
export const clamp01 = (f) => (f < 0 ? 0 : f > 1 ? 1 : f);
export const easeOut = (f) => { const g = 1 - clamp01(f); return 1 - g * g * g; };
export const easeOutBack = (f) => { const g = clamp01(f) - 1; return 2.70158 * g * g * g + 1 + 1.70158 * g * g; };

// ---- tone(): a colour of the original look → the same role in the current theme ----------------------------------
const luma = (h) => { const [r, g, b] = hex2(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function hsl(h) {
  const [r, g, b] = hex2(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
  if (!dl) return { h: 0, s: 0, l };
  const s = dl / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
  return { h: (hh * 60 + 360) % 360, s, l };
}
// dark → light neutrals of a palette (the card shades, borders, text greys)
const anchors = (p) => [p.BG, p.BG2, p.CARD, p.CARD_HI, p.STROKE, mix(p.STROKE, p.SUB, 0.18), p.DIM, p.SUB, p.TEXT];
const ACCENTS = ["CYAN", "GREEN", "AMBER", "RED", "PINK", "PURPLE", "BLUE"];
let themeId = DEFAULT_THEME, cache = new Map();
/** the current theme's version of a colour written for the original look ("#RRGGBB"); unchanged in the original look */
export function tone(hex) {
  if (themeId === DEFAULT_THEME || typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const key = hex.toUpperCase();
  let out = cache.get(key);
  if (out) return out;
  const role = Object.keys(DEF).find((k) => k !== "G2" && DEF[k] === key);
  if (role) out = C[role];
  else {
    const x = hsl(key);
    if (x.s >= 0.6 && x.l >= 0.45) {
      // a tint of an accent (light cyan text, pale amber…): same accent of the theme, lightened / darkened as much
      const k = ACCENTS.reduce((best, a) => { const d = Math.abs(((hsl(DEF[a]).h - x.h + 540) % 360) - 180); return d < best[1] ? [a, d] : best; }, ["CYAN", 1e9])[0];
      const la = hsl(DEF[k]).l;
      out = x.l >= la ? mix(C[k], "#FFFFFF", (x.l - la) / (1 - la)) : mix(C[k], "#000000", (la - x.l) / la);
    } else {
      // a neutral: at the same place between the dark and light anchors of the theme
      const A = anchors(DEF), B = anchors(C), y = luma(key), Y = A.map(luma);
      if (y <= Y[0]) out = mix("#000000", B[0], Y[0] ? y / Y[0] : 1);
      else if (y >= Y[Y.length - 1]) out = mix(B[B.length - 1], "#FFFFFF", (y - Y[Y.length - 1]) / (255 - Y[Y.length - 1]));
      else {
        let i = 0;
        while (y > Y[i + 1]) i++;
        out = mix(B[i], B[i + 1], (y - Y[i]) / (Y[i + 1] - Y[i]));
      }
    }
  }
  cache.set(key, out);
  return out;
}

/** gives an object (a settings group, a manual chapter…) a colour that follows the theme: o.color = tone(original) */
export function themed(o) {
  const c = o.color;
  Object.defineProperty(o, "color", { get: () => tone(c), enumerable: true, configurable: true });
  return o;
}

// ---- applying a theme -------------------------------------------------------------------------------------------
const CSS_VARS = { bg: "BG", bg2: "BG2", card: "CARD", "card-hi": "CARD_HI", stroke: "STROKE", tx: "TEXT", sub: "SUB", dim: "DIM",
  cyan: "CYAN", green: "GREEN", amber: "AMBER", red: "RED", purple: "PURPLE", blue: "BLUE", pink: "PINK", g2: "G2" };
const listeners = new Set();
export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
export const currentTheme = () => themeOf(themeId);
/** called after the theme changed (the backdrop repaints) */
export function onTheme(cb) { listeners.add(cb); return () => listeners.delete(cb); }
let cssKeys = null;
// every var(--x-rrggbb, …) style.css uses — read once from the loaded style sheet
function cssTones() {
  if (cssKeys) return cssKeys;
  const set = new Set();
  try {
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch { continue; }
      for (const r of rules) for (const m of r.cssText.matchAll(/--x-([0-9a-f]{6})/gi)) set.add(m[1].toLowerCase());
    }
  } catch { /* no DOM (tests) */ }
  return (cssKeys = set.size ? [...set] : null) || [];
}
export function applyTheme(id, { save = true } = {}) {
  const t = themeOf(id);
  themeId = t.id;
  cache = new Map();
  Object.assign(C, t.p);
  if (save) { try { localStorage.setItem("theme", t.id); } catch { /* private mode */ } }
  if (typeof document === "undefined") return t;
  const root = document.documentElement, st = root.style;
  // the original look: nothing set — style.css and its fallbacks draw it exactly as before
  for (const n of Object.keys(CSS_VARS)) st.removeProperty("--" + n);
  for (const k of cssTones()) st.removeProperty("--x-" + k);
  root.dataset.theme = t.id;
  if (t.id !== DEFAULT_THEME) {
    for (const [n, k] of Object.entries(CSS_VARS)) st.setProperty("--" + n, C[k]);
    st.setProperty("--acc-a", alpha(C.CYAN, 36));
    for (const k of cssTones()) st.setProperty("--x-" + k, tone("#" + k.toUpperCase()));
  } else st.removeProperty("--acc-a");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", C.BG);
  listeners.forEach((f) => { try { f(t); } catch { /* */ } });
  return t;
}
// before anything is drawn: the theme chosen last time (index.html already painted its background colour)
try { const saved = typeof localStorage !== "undefined" && localStorage.getItem("theme"); if (saved && saved !== DEFAULT_THEME) applyTheme(saved, { save: false }); } catch { /* */ }

export function fmt(v, dec) {
  if (v == null || !isFinite(v)) return "--";
  return Number(v).toFixed(dec);
}
export function duration(s) {
  if (s == null || s < 0 || !isFinite(s)) return "--";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export const font = (weight, sizePx, family) => `${weight} ${sizePx}px "${family}", Kanit, sans-serif`;
