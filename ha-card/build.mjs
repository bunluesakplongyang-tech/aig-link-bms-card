// Builds the Home Assistant card into dist/aig-link-bms-card.js — one file: code + styles + fonts.
//   node build.mjs
//
// The card draws with the web app's own modules (../app/src: widgets, theme, model, energy …), so it looks exactly
// like AIG-LINK BMS Cloud and picks up every look change of the app on the next build. Those modules were written
// for a whole page (document.body, <html> classes, :root, viewport media queries); the patches below point them at
// the card instead — the app sources themselves are not changed.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../app");
const HOST = join(HERE, "src/host.js");
const VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version;

// ---- source patches for app modules (exact text, so a change in the app shows up here as a build error) ----------
const PATCHES = {
  "src/ui/dom.js": [
    // dialogs and the toast go into the card's overlay layer (styled, above Home Assistant), not into <body>
    ["document.body.appendChild(toastEl);", "__AIG.layer().appendChild(toastEl);"],
    ["document.body.appendChild(root);", "__AIG.layer().appendChild(root);"],
    // the top bar's TH / EN button only when a screen asks for it — the card picks its language in the chip menu (1.0.14)
    ["    lang, pillEl);", "    onLang ? lang : null, pillEl);"],
  ],
  "src/ui/theme.js": [
    // theme variables go onto the card elements, not onto Home Assistant's <html>
    ["const root = document.documentElement, st = root.style;", "const root = __AIG.root, st = root.style;"],
    ["for (const sh of document.styleSheets) {", "for (const sh of __AIG.sheets()) {"],
    [`document.querySelector('meta[name="theme-color"]')?.setAttribute("content", C.BG);`, ""],
    [`localStorage.setItem("theme", t.id)`, `localStorage.setItem("aigTheme", t.id)`],
    [`localStorage.getItem("theme")`, `localStorage.getItem("aigTheme")`],
  ],
  "src/ui/perf.js": [
    ["const root = document.documentElement;", "const root = __AIG.root;"],
    [`const PREF_KEY = "fxPref", AUTO_KEY = "fxAuto"`, `const PREF_KEY = "aigFxPref", AUTO_KEY = "aigFxAuto"`],
  ],
};


const patchPlugin = {
  name: "aig-patch",
  setup(b) {
    // the app's TH / EN i18n.js → the card's own (seven languages, src/i18n.js): one module for app and card code
    b.onResolve({ filter: /(^|\/)i18n\.js$/ }, (args) => {
      const p = resolve(args.resolveDir, args.path);
      return p === join(APP, "src/i18n.js") ? { path: join(HERE, "src/i18n.js") } : undefined;
    });
    b.onLoad({ filter: /\.js$/ }, (args) => {
      const rel = args.path.startsWith(APP + "/") ? args.path.slice(APP.length + 1) : null;
      const list = rel && PATCHES[rel];
      if (!list) return undefined;
      let src = readFileSync(args.path, "utf8");
      for (const [from, to] of list) {
        if (!src.includes(from)) throw new Error(`${rel}: patch target not found — the app changed, update build.mjs:\n  ${from}`);
        src = src.split(from).join(to);
      }
      src = `import { AIG as __AIG } from ${JSON.stringify(HOST)};\n` + src;
      return { contents: src, loader: "js", resolveDir: dirname(args.path) };
    });
  },
};

// ---- styles: the app's style.css made to work inside a shadow root ------------------------------------------------
function cardCss() {
  let css = readFileSync(join(APP, "style.css"), "utf8");
  const must = (re, what) => { if (!re.test(css)) throw new Error("style.css: " + what + " not found"); };
  // fonts are registered on the page (a shadow root cannot declare @font-face)
  css = css.replace(/^@font-face\{[^}]*\}\n?/gm, "");
  must(/:root\{/, ":root");
  css = css.replace(/:root\{/g, ":host{");
  css = css.replace(/^html,body\{/m, ".aig-base{");
  css = css.replace(/^body\{overflow:hidden\}\n?/m, "");
  css = css.replace(/^body\.offline[^\n]*\n?/m, "");
  css = css.replace(/^#bg\{[^\n]*\n?/m, "").replace(/^#app\{[^\n]*\n?/m, "");
  // <html class="fx-lite|fx-off"> → the card host carries the class
  css = css.replace(/(^|[,}\s(])\.fx-(lite|off)(?=[\s,{])/g, "$1:host(.fx-$2)");
  // viewport widths → the card's own width (a card is narrower than the screen)
  css = css.replace(/@media \(((?:min|max)-width:\d+px)\)/g, "@container aig ($1)");
  css += "\n" + readFileSync(join(HERE, "src/card.css"), "utf8");
  return css;
}

// ---- fonts: inlined (one file to copy into Home Assistant); Kanit 300 is not used by the screens ------------------
const FONTS = [["Kanit", 400], ["Kanit", 500], ["Kanit", 600], ["Chakra Petch", 600], ["Chakra Petch", 700], ["Orbitron", 700], ["Orbitron", 900]];
function fontCss() {
  return FONTS.map(([fam, w]) => {
    const file = join(APP, "public/fonts", `${fam.replace(" ", "")}-${w}.woff2`);
    const b64 = readFileSync(file).toString("base64");
    return `@font-face{font-family:${fam.includes(" ") ? `"${fam}"` : fam};font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join("\n");
}

export async function build({ minify = true, out = join(HERE, "dist/aig-link-bms-card.js") } = {}) {
  const css = (await esbuild.transform(cardCss(), { loader: "css", minify, target: ["safari16", "chrome105"] })).code;
  const r = await esbuild.build({
    entryPoints: [join(HERE, "src/card.js")],
    bundle: true, format: "esm", minify, write: false, legalComments: "none", logLevel: "warning",
    target: ["es2020", "safari16"], plugins: [patchPlugin],
    define: { __CARD_CSS__: JSON.stringify(css), __FONT_CSS__: JSON.stringify(fontCss()), __CARD_VERSION__: JSON.stringify(VERSION) },
  });
  mkdirSync(dirname(out), { recursive: true });
  const banner = `/*! AIG-LINK BMS card ${VERSION} — Home Assistant · JK-BMS (ESPHome syssi) · look of AIG-LINK BMS Cloud */\n`;
  const js = banner + r.outputFiles[0].text;
  writeFileSync(out, js);
  return { out, bytes: js.length, css: css.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --dev: readable build for profiling (test/perf.py), not shipped
  const dev = process.argv.includes("--dev");
  const o = process.argv.indexOf("--out"); // --out <file>: where the bundle goes (the public repo builds into its dist/)
  const out = o > 0 ? resolve(process.argv[o + 1]) : undefined;
  const r = await build(dev ? { minify: false, out: join(HERE, "test/build/card.dev.js") } : out ? { out } : {});
  console.log(`built ${r.out.split("/").slice(-2).join("/")} ${(r.bytes / 1024).toFixed(0)} KB (css ${(r.css / 1024).toFixed(0)} KB)`);
}
