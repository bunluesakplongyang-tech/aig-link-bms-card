# app/ — shared UI modules

The card draws with the same modules as the AIG-LINK BMS Cloud web app, so it looks exactly like it.
This folder holds only the files the card uses (nothing else of the app is needed to build it):

| Path | What it is |
|---|---|
| `src/ui/widgets.js`, `canvas.js` | gauge, energy flow, cell grid, status tiles, history charts |
| `src/ui/dom.js`, `icons.js` | element helper, dialogs, toast, top bar, SVG icons |
| `src/ui/theme.js`, `perf.js` | colours / themes, visual-effects level |
| `src/data/model.js` | BMS data model, setting definitions, alarm texts |
| `src/data/energy.js`, `alarms.js`, `util.js` | today's energy, alarm list, small helpers |
| `src/i18n.js` | the app's TH / EN switch — the card build replaces it with `ha-card/src/i18n.js` (7 languages) |
| `style.css` | the app's styles (turned into shadow-DOM styles by `ha-card/build.mjs`) |
| `public/fonts/` | Kanit, Chakra Petch, Orbitron (woff2), inlined into the bundle |

`ha-card/build.mjs` applies a few exact-text patches to these modules at build time (dialogs go into the card's
overlay instead of `<body>`, theme variables onto the card instead of `<html>` …) — the files here are unchanged copies.

## Fonts

Kanit (Cadson Demak), Chakra Petch (Cadson Demak) and Orbitron (Matt McInerney) are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org) and come from [Google Fonts](https://fonts.google.com).
