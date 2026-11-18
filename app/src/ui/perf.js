// Visual-effects level for this device: "full" | "lite" | "off"
//   full  everything (animated backdrop ~30 fps, card animations at display rate, shimmer, blur, glows)
//   lite  backdrop ~10 fps, card animations ~30 fps, no shimmer sweeps, no backdrop blur, no spinning logo rings
//   off   no continuous animation at all (like "reduce motion"): the backdrop is drawn once, cards repaint on new data
// Preference (localStorage "fxPref", Settings → Visual effects): "auto" (default) | "full" | "lite" | "off".
// Auto = the lower of
//   · device hints at start: reduce-motion, Save-Data, RAM (navigator.deviceMemory), CPU cores, old Android / iOS
//   · the frame rate measured while the backdrop animates: 2 slow windows in a row (median frame > 24 ms → lite,
//     > 40 ms → off) step the level down. A measured result is kept for 7 days so an old phone starts light.
const PREF_KEY = "fxPref", AUTO_KEY = "fxAuto", KEEP_MS = 7 * 86400e3;
export const FX_LEVELS = ["full", "lite", "off"];
const rank = (l) => FX_LEVELS.indexOf(l);
const lower = (a, b) => (rank(a) >= rank(b) ? a : b);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } },
};

/** {level, reason} from what the browser tells about the device */
export function deviceHints() {
  const nav = navigator, ua = nav.userAgent || "";
  if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) return { level: "off", reason: "reduced-motion" };
  // Safari (every iOS browser is WebKit) reports 2–4 cores whatever the chip, and no memory → not used there
  const webkitOnly = /AppleWebKit/.test(ua) && (!/Chrome|Chromium|CriOS|Android|Edg/.test(ua) || /iPhone|iPad|iPod/.test(ua));
  const mem = nav.deviceMemory || 0, cores = webkitOnly ? 0 : nav.hardwareConcurrency || 0;
  const android = +(/Android (\d+)/.exec(ua)?.[1] || 0);   // Chrome ≥ 110 reports "Android 10" on every newer phone
  const ios = +(/(?:iPhone|iPod|iPad).*? OS (\d+)_/.exec(ua)?.[1] || 0);
  if (mem && mem <= 1) return { level: "off", reason: "low-memory" };
  if ((android && android < 8) || (ios && ios < 13)) return { level: "off", reason: "old-os" };
  if (nav.connection?.saveData) return { level: "lite", reason: "save-data" };
  if (mem && mem <= 2) return { level: "lite", reason: "low-memory" };
  if (cores && cores <= 2) return { level: "lite", reason: "few-cores" };
  if ((android && android < 10 && cores <= 4) || (ios && ios < 15)) return { level: "lite", reason: "old-os" };
  return { level: "full", reason: "" };
}

const hint = deviceHints();
let measured = (() => {
  try {
    const m = JSON.parse(store.get(AUTO_KEY) || "null");
    return m && FX_LEVELS.includes(m.level) && Date.now() - m.ts < KEEP_MS ? m : null;
  } catch { return null; }
})();
let pref = (() => { const p = store.get(PREF_KEY); return p && (p === "auto" || FX_LEVELS.includes(p)) ? p : "auto"; })();

const autoInfo = () => {
  if (measured && rank(measured.level) > rank(hint.level)) return { level: measured.level, reason: "slow-frames" };
  return hint;
};
/** live state: fx.level is read by the canvas loops every frame */
export const fx = { level: "full", pref, auto: autoInfo() };
const subs = new Set();
export const onFx = (fn) => { subs.add(fn); return () => subs.delete(fn); };

function update(why) {
  fx.pref = pref;
  fx.auto = autoInfo();
  const level = pref === "auto" ? fx.auto.level : pref;
  const changed = level !== fx.level;
  fx.level = level;
  const root = document.documentElement;
  root.classList.toggle("fx-lite", level === "lite");
  root.classList.toggle("fx-off", level === "off");
  if (changed || why === "pref") subs.forEach((f) => f(level, why));
}
update("start");

/** Settings: "auto" | "full" | "lite" | "off" — choosing "auto" again forgets the measured result (re-detect). */
export function setFxPref(p) {
  pref = p;
  store.set(PREF_KEY, p === "auto" ? null : p);
  if (p === "auto") { measured = null; store.set(AUTO_KEY, null); bad = 0; samples = []; winMs = 0; }
  update("pref");
}

// ---- frame-rate monitor (fed by the backdrop loop, which runs every display frame while the page is visible) ----
const START_GRACE_MS = 3000, WINDOW = 90;
const t0 = performance.now();
let samples = [], last = 0, bad = 0, winMs = 0;
export function frameSample(now) {
  if (document.hidden || now - t0 < START_GRACE_MS) { last = 0; return; }
  if (last) { const dt = now - last; if (dt > 0 && dt < 300) { samples.push(dt); winMs += dt; } }  // longer gaps = paused
  last = now;
  // a window = 90 frames, or 2.5 s once it has 20 (slow phones decide within a few seconds)
  if (samples.length < WINDOW && !(samples.length >= 20 && winMs >= 2500)) return;
  const s = samples.sort((a, b) => a - b), med = s[s.length >> 1];
  samples = []; winMs = 0;
  if (pref !== "auto" || fx.level === "off") { bad = 0; return; }
  const target = med > 40 ? "off" : med > 24 ? "lite" : null;
  if (!target || rank(target) <= rank(fx.level)) { bad = 0; return; }
  if (++bad < 2) return;
  bad = 0;
  // one step at a time (full → lite → off), straight to off only when it is really slow
  const next = med > 55 ? "off" : FX_LEVELS[rank(fx.level) + 1];
  measured = { level: lower(next, measured?.level || "full"), ts: Date.now(), ms: Math.round(med) };
  store.set(AUTO_KEY, JSON.stringify(measured));
  update("measured");
}
export const frameGap = () => { last = 0; };
document.addEventListener("visibilitychange", frameGap);
