// DOM building blocks styled like AIG-LINK RowView / KvCard / AppDialog / ToastView / TopBar / BottomNav
import { svg } from "./icons.js";
import { C, alpha } from "./theme.js";
import { L } from "../i18n.js";

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const acc = (el, color) => { el.style.setProperty("--acc", color); el.style.setProperty("--acc-a", alpha(color, 36)); return el; };

// ---- rows ------------------------------------------------------------------
export function header(title, color = C.CYAN, right) {
  return acc(h("div", { class: "row-h" }, h("span", null, title), right || null), color);
}

export function badge(icon, color, size = 17) {
  return acc(h("span", { class: "badge", html: svg(icon, size, color) }), color);
}

// RowView VALUE: title, sub, value text in accent colour, chevron
export function valueRow({ icon, title, sub, value = "--", color = C.CYAN, onClick, wrapSub = false }) {
  const v = h("span", { class: "row-v" }, value);
  const s = h("span", { class: "row-s" + (wrapSub ? " wrap2" : "") }, sub || "");
  const el = acc(h("button", { class: "card row", type: "button", onclick: onClick },
    icon ? badge(icon, color) : null,
    h("span", { class: "row-t" }, h("b", null, title), s),
    v, h("span", { class: "chev", html: svg("chevron", 16, C.SUB) })), color);
  el.setValue = (x) => { v.textContent = x; };
  el.setSub = (x) => { s.textContent = x; };
  el.setTitle = (x) => { el.querySelector(".row-t b").textContent = x; };
  el.setEnabled = (on) => el.classList.toggle("off", !on);
  return el;
}

// RowView TOGGLE
export function toggleRow({ icon, title, sub, on = false, color = C.CYAN, onClick }) {
  const sw = h("span", { class: "sw" }, h("i"));
  const el = acc(h("button", { class: "card row", type: "button", role: "switch", "aria-checked": String(!!on), onclick: onClick },
    icon ? badge(icon, color) : null,
    h("span", { class: "row-t" }, h("b", null, title), sub ? h("span", { class: "row-s" }, sub) : null),
    sw), color);
  el.setOn = (x) => { el.classList.toggle("on", !!x); el.setAttribute("aria-checked", String(!!x)); el.on = !!x; };
  el.setEnabled = (x) => el.classList.toggle("off", !x);
  el.setBusy = (x) => el.classList.toggle("busy", !!x);
  el.setOn(on);
  return el;
}

// RowView BUTTON (gradient pill-card)
export function buttonRow({ icon, title, color = C.CYAN, onClick, small }) {
  return acc(h("button", { class: "card btnrow" + (small ? " sm" : ""), type: "button", onclick: onClick },
    icon ? h("span", { html: svg(icon, 18, C.TEXT) }) : null, h("b", null, title)), color);
}

// RowView NOTICE
export function noticeRow({ icon = "shield", title, sub, color = C.AMBER }) {
  const el = acc(h("div", { class: "card row notice" }, badge(icon, color),
    h("span", { class: "row-t" }, h("b", null, title), h("span", { class: "row-s wrap" }, sub || ""))), color);
  el.set = (t, s) => { el.querySelector("b").textContent = t; el.querySelector(".row-s").textContent = s; };
  return el;
}

// KvCard
export function kvCard(title, icon, color) {
  const body = h("div", { class: "kv" });
  const el = acc(h("div", { class: "card kvcard" },
    h("div", { class: "kv-h" }, badge(icon, color, 16), h("b", null, title)), body), color);
  // rows: [label, value, colour?, rowClass?] — or { sec: title, icon, color } for a section heading inside the card (2.0.27)
  // 2.0.28: only rows that changed are replaced, so what is unchanged keeps its animation (temperature bars)
  el.set = (rows) => {
    const next = rows.map((r) => (!Array.isArray(r)
      ? h("div", { class: "kv-sec" }, r.icon ? h("span", { class: "kv-sec-ic", html: svg(r.icon, 13, r.color || C.SUB, 2.2) }) : null,
        h("b", { style: r.color ? { color: r.color } : null }, r.sec), r.right ? h("small", null, r.right) : null)
      : h("div", r[3] ? { class: r[3] } : null, h("span", null, r[0]),
        h("b", { style: r[2] ? { color: r[2] } : null }, r[1] == null || r[1] === "" ? "--" : r[1]))));
    const cur = body.children;
    if (cur.length !== next.length) { body.replaceChildren(...next); return; }
    next.forEach((n, i) => { if (!n.isEqualNode(cur[i])) body.replaceChild(n, cur[i]); });
  };
  return el;
}

// ---- toast -----------------------------------------------------------------
let toastEl, toastTimer;
export function toast(msg, color = C.CYAN) {
  if (!toastEl) {
    toastEl = h("div", { class: "card toast", role: "status" }, h("i"), h("span"));
    document.body.appendChild(toastEl);
  }
  acc(toastEl, color);
  toastEl.querySelector("span").textContent = msg;
  toastEl.classList.remove("show");
  void toastEl.offsetWidth;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

// ---- dialog (AppDialog) ----------------------------------------------------
const stack = [];
export function dialog({ title, msg, icon = "info", color = C.CYAN, cancelable = true }) {
  const body = h("div", { class: "dlg-b" });
  const err = h("div", { class: "dlg-err" });
  const panel = acc(h("div", { class: "dlg", role: "dialog", "aria-modal": "true" },
    h("div", { class: "dlg-h" }, badge(icon, color, 20),
      h("div", null, h("b", null, title), msg ? h("p", null, msg) : null)),
    body, err), color);
  const root = h("div", { class: "scrim" }, panel);
  const d = {
    root, body, panel,
    close() {
      root.classList.remove("show");
      setTimeout(() => root.remove(), 200);
      const i = stack.indexOf(d);
      if (i >= 0) stack.splice(i, 1);
    },
    error(m) { err.textContent = m || ""; err.classList.toggle("show", !!m); },
    input({ value = "", type = "text", placeholder = "", inputmode, unit, step, autocomplete } = {}) {
      const inp = h("input", { class: "dlg-in", value, type, placeholder, inputmode, step, autocomplete: autocomplete || "off", spellcheck: "false" });
      body.appendChild(h("label", { class: "dlg-field" }, inp, unit ? h("span", null, unit) : null));
      setTimeout(() => { inp.focus(); inp.select?.(); }, 60);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") panel.querySelector(".dlg-ok")?.click(); });
      return inp;
    },
    toggle(title, sub, on) {
      const t = toggleRow({ icon: "key", title, sub, on, color, onClick: () => t.setOn(!t.on) });
      body.appendChild(t);
      return t;
    },
    choice(label, sub, selected, onPick, chColor) {
      const r = valueRow({ icon: selected ? "check" : "layers", title: label, sub, value: selected ? "●" : "", color: selected ? C.GREEN : chColor || color, onClick: () => { d.close(); onPick(); } });
      body.appendChild(r);
      return r;
    },
    add(el) { body.appendChild(el); return el; },
    buttons(cancel, ok, okColor, onOk) {
      const bar = h("div", { class: "dlg-btns" });
      if (cancel) bar.appendChild(h("button", { class: "btn ghost", type: "button", onclick: () => d.close() }, cancel));
      if (ok) {
        const b = acc(h("button", { class: "btn dlg-ok", type: "button", onclick: async () => {
          if (b.disabled) return;
          b.disabled = true;
          try { await onOk(d); } finally { b.disabled = false; }
        } }, ok), okColor || color);
        bar.appendChild(b);
      }
      panel.appendChild(bar);
      return d;
    },
    show() {
      document.body.appendChild(root);
      requestAnimationFrame(() => root.classList.add("show"));
      stack.push(d);
      return d;
    },
  };
  root.addEventListener("click", (e) => { if (e.target === root && cancelable) d.close(); });
  d.cancelable = cancelable;
  return d;
}
export function closeTopDialog() {
  const d = stack[stack.length - 1];
  if (d && d.cancelable) { d.close(); return true; }
  return false;
}
export function confirmDialog({ title, msg, icon = "shield", color = C.AMBER, ok, okColor = C.RED, cancel = L.t("ยกเลิก", "Cancel") }) {
  return new Promise((resolve) => {
    const d = dialog({ title, msg, icon, color });
    let done = false;
    d.buttons(cancel, ok, okColor, () => { done = true; d.close(); resolve(true); });
    const orig = d.close; d.close = () => { orig(); if (!done) resolve(false); };
    d.show();
  });
}
export function promptDialog({ title, msg, value = "", icon = "edit", color = C.CYAN, ok = L.t("บันทึก", "Save"), placeholder = "", maxLength = 40 }) {
  return new Promise((resolve) => {
    const d = dialog({ title, msg, icon, color });
    const inp = d.input({ value, placeholder });
    inp.maxLength = maxLength;
    inp.classList.add("txt");
    let done = false;
    d.buttons(L.t("ยกเลิก", "Cancel"), ok, C.GREEN, () => {
      const v = inp.value.trim();
      if (!v) return d.error(L.t("กรุณากรอกชื่อ", "Please enter a name"));
      done = true; d.close(); resolve(v);
    });
    const orig = d.close; d.close = () => { orig(); if (!done) resolve(null); };
    d.show();
  });
}

// ---- top bar (TopBar.java) -------------------------------------------------
export function topBar({ title1 = "AIG-LINK", title2 = " BMS", sub = "", back, onLang, pill }) {
  const subEl = h("span", { class: "tb-sub" }, sub);
  const logo = back
    ? h("button", { class: "tb-back", type: "button", "aria-label": L.t("กลับ", "Back"), onclick: back, html: svg("back", 22, C.TEXT, 2.2) })
    : h("div", { class: "tb-logo", html: svg("bolt", 22, C.TEXT) });
  const lang = h("button", { class: "tb-lang" + (L.en ? " en" : ""), type: "button", "aria-label": "Language", onclick: onLang },
    h("i"), h("span", null, "TH"), h("span", null, "EN"));
  const pillEl = h("button", { class: "tb-pill", type: "button" });
  const el = h("header", { class: "topbar" }, logo,
    h("div", { class: "tb-title" }, h("b", null, title1, h("em", null, title2)), subEl),
    lang, pillEl);
  // 2.0.35: left alone when nothing changed — they are called every few seconds and each change means a new layout
  el.setSub = (s, color) => { if (subEl.textContent !== s) subEl.textContent = s; if (subEl.style.color !== (color || "")) subEl.style.color = color || ""; };
  el.setTitle = (a, b2, plain) => {
    const k = `${a}\u0000${b2 || ""}\u0000${!!plain}`;
    if (el._tk === k) return;
    el._tk = k;
    const b = el.querySelector(".tb-title b"); b.replaceChildren(a, h("em", null, b2 || "")); b.classList.toggle("plain", !!plain);
  };
  // fx: "gw" — the Gateway button of a BMS screen, with its own effects (2.0.29, style.css .tb-pill.gw)
  el.setPill = ({ icon = "bt", label, color = C.CYAN, onClick, pulse, fx } = {}) => {
    if (!label) { pillEl.style.display = "none"; return; }
    pillEl.style.display = "";
    acc(pillEl, color);
    pillEl.classList.toggle("pulse", !!pulse);
    pillEl.classList.toggle("gw", fx === "gw");
    // the same content again (refreshed every few seconds) is left alone, so its animations do not restart
    const html = (fx === "gw" ? '<i class="gw-shine"></i>' : "") + svg(icon, 16, color, 2) + `<span>${esc(label)}</span>` + (fx === "gw" ? '<i class="gw-led"></i>' : "");
    if (pillEl._html !== html) { pillEl.innerHTML = html; pillEl._html = html; }
    pillEl.setAttribute("aria-label", label);
    pillEl.onclick = onClick || null;
  };
  el.setPill(pill || {});
  return el;
}

// ---- bottom nav (BottomNav.java) --------------------------------------------
export function bottomNav(items, onTab) {
  const ind = h("i", { class: "bn-ind" });
  const btns = items.map(([icon, label], i) => h("button", { type: "button", class: "bn-b", onclick: () => onTab(i) },
    h("span", { html: svg(icon, 22, "currentColor", 2) }), h("small", null, label)));
  const el = h("nav", { class: "bottomnav" }, h("div", { class: "bn-in" }, ind, btns));
  el.style.setProperty("--n", items.length);
  el.select = (i) => {
    el.style.setProperty("--i", i);
    btns.forEach((b, k) => b.classList.toggle("on", k === i));
  };
  return el;
}

export function enterAnim(container) {
  if (!container) return;
  const kids = [...container.children];
  kids.forEach((k, i) => {
    k.style.animation = "none";
    void k.offsetWidth;
    k.style.animation = `enter .52s cubic-bezier(.2,.8,.3,1) ${Math.min(i, 12) * 55}ms both`;
    k._card?.markEnter();
    k.querySelectorAll?.(".cv").forEach((c) => c._card?.markEnter());
  });
}
