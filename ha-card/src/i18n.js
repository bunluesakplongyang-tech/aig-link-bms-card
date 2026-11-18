// The card's language (replaces the app's TH / EN i18n.js in the card build — see build.mjs).
// Every screen calls L.t(thai, english): Thai and English come from the call itself, the five other languages are
// looked up by the English text in i18n-dict.js (a string missing there is shown in English).
// The choice is kept in this browser (localStorage "aigLang") and shared by every AIG-LINK card on the page.
import { AIG } from "./host.js";
import { COLS, DICT } from "./i18n-dict.js";

export const LANGS = ["th", "en", "zh", "es", "pt", "de", "fr"];
/** the name of each language in itself (language menu, editor) and in English (second line of the menu) */
export const LANG_NAME = { th: "ไทย", en: "English", zh: "中文", es: "Español", pt: "Português", de: "Deutsch", fr: "Français" };
export const LANG_EN = { th: "Thai", en: "English", zh: "Chinese", es: "Spanish", pt: "Portuguese", de: "German", fr: "French" };

let lang = "th";
try { const s = localStorage.getItem("aigLang"); if (LANGS.includes(s)) lang = s; } catch { /* storage blocked */ }
AIG.root.lang = lang;

const col = (l) => COLS.indexOf(l);

export const L = {
  /** true for every language but Thai (number and date formats follow English) */
  get en() { return lang !== "th"; },
  get lang() { return lang; },
  t(th, eng) {
    if (lang === "th") return th;
    if (lang === "en" || typeof eng !== "string") return eng;
    return DICT[eng]?.[col(lang)] || eng;
  },
  /** a language code, or (as the app does) true = English / false = Thai */
  set(v) {
    lang = typeof v === "string" ? (LANGS.includes(v) ? v : "en") : v ? "en" : "th";
    AIG.root.lang = lang;
    try { localStorage.setItem("aigLang", lang); } catch { /* */ }
  },
};
