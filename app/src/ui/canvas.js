// Canvas card framework — mirrors AIG-LINK CardView (card frame, shimmer, enter animation)
import { C, alpha, easeOut, onTheme } from "./theme.js";
import { fx, frameSample, onFx } from "./perf.js";

const live = new Set();      // mounted cards
const visible = new Set();   // cards on screen
let rafId = 0;
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const REDUCED_MOTION = !!reduceMotion;
// effects level (ui/perf.js): "off" = no continuous animation — entries start finished, eased values jump to target
export const calm = () => fx.level === "off";
// per-paint easing factor: 1 when calm, doubled-up steps at ~30 fps (lite) so values settle as fast as at 60 fps
export const ease = (f) => (fx.level === "off" ? 1 : fx.level === "lite" ? 1 - (1 - f) * (1 - f) : f);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const card = e.target._card;
    if (!card) continue;
    if (e.isIntersecting) visible.add(card);
    else { visible.delete(card); if (!card.el.isConnected) unmount(card); }
  }
  kick();
}, { rootMargin: "80px" });

const ro = new ResizeObserver((entries) => {
  for (const e of entries) e.target._card?.resize();
  kick();
});

let lastPaint = 0, prevNow = 0, frameMs = 16.7, ticks = 0;
function frame(now) {
  rafId = 0;
  let again = false, painted = false;
  const off = fx.level === "off";
  // the screen's refresh interval, smoothed (gaps after a pause are left out)
  if (prevNow) { const d = now - prevNow; if (d > 3 && d < 50) frameMs += (d - frameMs) * 0.1; }
  prevNow = now;
  // never more pictures than needed for 60 fps (2.0.35): every 2nd refresh on a 120–165 Hz screen (a 120 Hz phone drew
  // its cards 120 times a second), every refresh at 60–110 Hz — the same motion, never below 60 fps
  const every = Math.max(1, Math.floor(16.67 / frameMs + 0.1));
  ticks++;
  const skip = fx.level === "lite" ? now - lastPaint < 31 : ticks < every && now - lastPaint < 25;  // lite: ~30 fps
  for (const card of visible) {
    if (!card.el.isConnected) { unmount(card); continue; }
    // "off" still runs the short, purposeful ones (animateUntil: tooltips fading out, chart intro)
    const moving = () => (card.animating && (!off || card.animUntil)) || card.shimmering();
    if (card.dirty || (moving() && !skip)) {
      card.paint(card.dirty);
      painted = true;
      card.dirty = false;
      if (card.animUntil && card.t() >= card.animUntil) { card.animUntil = 0; card.animating = !!card.keepAnimating; }
    }
    if (moving()) again = true;
  }
  if (painted) { lastPaint = now; ticks = 0; }
  if (again && !document.hidden) rafId = requestAnimationFrame(frame);
  else prevNow = 0;
}
onFx(() => { for (const c of visible) c.dirty = true; kick(); });

export function kick() {
  if (!rafId) rafId = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", kick);

function unmount(card) {
  live.delete(card);
  visible.delete(card);
  io.unobserve(card.el);
  ro.unobserve(card.el);
}

export class CanvasCard {
  constructor(heightPx, { cls = "", accent = C.CYAN, card = true } = {}) {
    this.el = document.createElement("div");
    this.el.className = "cv " + cls;
    this.el.style.height = heightPx + "px";
    this.canvas = document.createElement("canvas");
    this.el.appendChild(this.canvas);
    this.el._card = this;
    this.ctx = this.canvas.getContext("2d");
    this.h = heightPx;
    this.accent = accent;
    this.drawCard = card;
    this.animating = true;  // continuous animation wanted — the frame loop skips it when effects are "off"
    this.shimmer = false;
    this.born = performance.now();
    this.enterT = calm() ? -1e6 : 0;
    this.phase = Math.random() * 6;
    this.dirty = true;
    this.w = 0;
    live.add(this);
    io.observe(this.el);
    ro.observe(this.el);
  }
  t() { return (performance.now() - this.born) / 1000; }
  // the screen that owns this card is gone: stop observing it and drop it from the frame loop (2.0.35 — cards of
  // closed screens used to stay in the observers until they happened to scroll in and out of view)
  destroy() { unmount(this); this.io?.disconnect(); this._frame = null; }
  markEnter() { this.enterT = calm() ? -1e6 : this.t(); this.dirty = true; kick(); }
  setHeight(px) {
    if (px === this.h) return;
    this.h = px;
    this.el.style.height = px + "px";
  }
  invalidate() { this.dirty = true; kick(); }
  // keeps repainting until t() reaches `until` (fades, tooltips) — cards that animate anyway ignore it
  animateUntil(until) {
    if (!this.animUntil) this.keepAnimating = this.animating;  // restored when the extra frames end
    this.animUntil = Math.max(this.animUntil || 0, until);
    this.animating = true;
    this.invalidate();
  }
  // Tap / drag / hover inside the card: cb(x, y, phase) in card px, phase = down | move | up | leave.
  // touch-action pan-y keeps vertical page scrolling; a horizontal drag scrubs.
  onPointer(cb) {
    const c = this.canvas;
    c.style.touchAction = "pan-y";
    let down = false;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) * (this.w || r.width)) / (r.width || 1), ((e.clientY - r.top) * this.h) / (r.height || 1)];
    };
    c.addEventListener("pointerdown", (e) => { down = true; cb(...pos(e), "down"); });
    c.addEventListener("pointermove", (e) => { if (down || e.pointerType === "mouse") cb(...pos(e), "move"); });
    c.addEventListener("pointerup", (e) => { if (down) { down = false; cb(...pos(e), "up"); } });
    c.addEventListener("pointercancel", (e) => { down = false; cb(...pos(e), "up"); });
    c.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { down = false; cb(...pos(e), "leave"); } });
  }
  shimmering() { return this.shimmer && this.drawCard && fx.level === "full"; }
  resize() {
    // clientWidth ignores CSS transforms (dialogs scale in), so the canvas never ends up too small
    const w = this.el.clientWidth || this.el.getBoundingClientRect().width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = w;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = this.h + "px";
    this.dpr = dpr;
    this.dirty = true;
  }
  // full: new data / size / theme → the whole card is drawn. Otherwise (an animation frame) only the parts the widget
  // says are moving (liveRects) are redrawn over the cached background — the rest of the canvas keeps its pixels (2.0.35)
  paint(full = true) {
    const ctx = this.ctx;
    if (!this.w || this.canvas.height !== Math.round(this.h * this.dpr)) { this.resize(); full = true; }
    if (!this.w) return;
    const b = { left: 4, top: 4, right: this.w - 4, bottom: this.h - 4 };
    b.width = b.right - b.left;
    b.height = b.bottom - b.top;
    b.cx = (b.left + b.right) / 2;
    b.cy = (b.top + b.bottom) / 2;
    // the border shine runs round the whole card: while it shows (and one frame after, to wipe it) frames are whole
    const sh = this.shimmerNow(), wipe = this._shim && !sh;
    this._shim = sh;
    if (!full && !sh && !wipe && !globalThis.__aigWholeFrames && this.drawCard && this._frame?.c && this._frame.key === this.frameKey(b)) {
      const rs = this.liveRects(b);
      if (rs && rs.length) {
        // one rectangle round them all: a clip made of several rectangles costs more than it saves (measured)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y, w, h] of rs) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.w, x1); y1 = Math.min(this.h, y1);
        if ((x1 - x0) * (y1 - y0) < 0.97 * this.w * this.h) { this.paintRects(ctx, b, [[x0, y0, x1 - x0, y1 - y0]]); return; }
      }
    }
    // the cached background replaces every pixel ("copy"), so the canvas needs no clearing first (2.0.35)
    if (this.drawCard) this.frame(ctx, b);
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw(ctx, b);
    this.drawShimmer(ctx, b);
  }
  // a light running once round the card's border every 6 s
  drawShimmer(ctx, b) {
    if (!this.shimmering()) return;
    const f = ((this.t() + this.phase) % 6) / 1.4;
    if (f >= 1) return;
    const x = b.left - b.height + (b.width + b.height) * easeOut(f);
    const g = ctx.createLinearGradient(x - 60, b.top, x + 60, b.bottom);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.45, alpha(C.TEXT, 120));
    g.addColorStop(0.55, alpha(this.accent, 160));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    roundRect(ctx, b.left, b.top, b.width, b.height, 18);
    ctx.stroke();
  }
  draw() {}
  /**
   * Animation frames between data updates: [[x, y, w, h], …] (card px) that cover everything that moves now, or null
   * while anything else changes (values easing, entry animation, a tooltip) — then the whole card is drawn. Only the
   * rectangle round them is redrawn, and only when it is clearly smaller than the card. test/rectcheck.py (HA card)
   * compares such frames with whole ones.
   */
  liveRects() { return null; }
  shimmerNow() { return this.shimmering() && ((this.t() + this.phase) % 6) / 1.4 < 1; }
  // restore the background under the rects, then draw the card clipped to them
  paintRects(ctx, b, rs) {
    const dpr = this.dpr, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath();
    for (const [x, y, w, h] of rs) {
      const x0 = Math.max(0, Math.floor(x * dpr)), y0 = Math.max(0, Math.floor(y * dpr));
      const x1 = Math.min(W, Math.ceil((x + w) * dpr)), y1 = Math.min(H, Math.ceil((y + h) * dpr));
      if (x1 > x0 && y1 > y0) ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.clip();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(this._frame.c, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(ctx, b);
    ctx.restore();
  }
  /** a Sprite kept by this card under `id` */
  sprite(id) { const m = (this._sp ||= new Map()); let s = m.get(id); if (!s) m.set(id, (s = new Sprite())); return s; }
  /**
   * Text with a glow (what shadowBlur did on every frame): the glow is a cached sprite of this text, at opacity a,
   * and the text itself is drawn as usual on top. 2.0.35.
   */
  glowText(ctx, id, str, x, y, o, color, blur, a = 1) {
    str = String(str);
    if (blur > 0 && a > 0.003) {
      const size = o.size || 14, w = measure(ctx, str, size, o.weight || 400, o.family || "Kanit");
      const x0 = o.align === "center" ? x - w / 2 : o.align === "right" || o.align === "end" ? x - w : x;
      this.sprite(id).glow(`${str}|${x},${y}|${size}|${o.weight}|${o.family}|${o.color}|${o.align}`, [x0, y - size, w, size * 1.45], blur + 2, this.dpr, color, blur,
        (c) => text(c, str, x, y, o)).put(ctx, a);
    }
    text(ctx, str, x, y, o);
  }
  /** a glow around a shape that stays put (rings, bars, tile borders); paint(ctx) draws the shape in card px */
  glowShape(ctx, id, key, box, color, blur, paint, a = 1) {
    if (blur > 0 && a > 0.003) this.sprite(id).glow(key, box, blur + 2, this.dpr, color, blur, paint).put(ctx, a);
  }
  // What a card shows that does not move between frames (2.0.35): the card background + border (cardFrame — a gradient
  // fill of the whole card, the most expensive thing most cards drew on every frame) and whatever drawStatic() adds,
  // drawn once into one layer and copied over the whole canvas each frame. A widget with static content returns a
  // key from staticKey() that changes whenever that content changes.
  staticKey() { return ""; }
  drawStatic() {}
  frameKey(b) { return `${this.canvas.width}x${this.canvas.height}|${this.accent}|${C.CARD_HI}|${C.CARD}|${C.STROKE}|${this.staticKey(b)}`; }
  frame(ctx, b) {
    const c = (this._frame ||= new Layer()).draw(this.frameKey(b), this.w, this.h, this.dpr, (x) => { cardFrame(x, b, this.accent); this.drawStatic(x, b); }, this.canvas.width, this.canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---- cached layers (2.0.35) -----------------------------------------------------------------------------------------
// An offscreen canvas that is redrawn only when its key changes; widgets use it for what does not move from one frame
// to the next (card frames, glows, gradients). Same pixel density as the card, so copying it changes nothing on screen.
export class Layer {
  constructor() { this.c = null; this.key = null; }
  /** the layer for `key` (redrawn with draw(ctx) in CSS px when the key changed); W, H: device px (default w·dpr) */
  draw(key, w, h, dpr, paint, W = Math.max(1, Math.ceil(w * dpr)), H = Math.max(1, Math.ceil(h * dpr))) {
    if (this.key === key && this.c && this.c.width === W && this.c.height === H) return this.c;
    if (!this.c) this.c = document.createElement("canvas");
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    const x = this.c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, H);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(x);
    this.key = key;
    return this.c;
  }
}
/**
 * A piece of a card in its own layer, placed on whole device pixels so copying it is exact (2.0.35).
 *   box: [x, y, w, h] in card px around the shape · pad: extra room (for a blur)
 *   glow(…)  the layer holds only the blurred shadow that shadowBlur would paint around the shape
 *   plain(…) the layer holds the shape itself
 * put(ctx, alpha) copies it — a breathing glow is the same layer at a changing opacity.
 */
export class Sprite {
  constructor() { this.layer = new Layer(); this.ox = 0; this.oy = 0; this.w = 0; this.h = 0; }
  place(box, pad, dpr) {
    this.ox = Math.floor((box[0] - pad) * dpr) / dpr; this.oy = Math.floor((box[1] - pad) * dpr) / dpr;
    this.w = Math.ceil((box[2] + 2 * pad + 1) * dpr) / dpr; this.h = Math.ceil((box[3] + 2 * pad + 1) * dpr) / dpr;
    return `${this.ox},${this.oy},${this.w},${this.h}|${dpr}`;
  }
  glow(key, box, pad, dpr, color, blur, paint) {
    const at = this.place(box, pad, dpr);
    this.layer.draw(`g|${key}|${at}|${color}|${blur}`, this.w, this.h, dpr, (x) => {
      // the shape far off to the left, its shadow offset back into the layer: only the glow lands here
      const OFF = 4096;
      x.translate(-this.ox - OFF, -this.oy);
      x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetX = OFF * dpr;
      paint(x);
    });
    return this;
  }
  plain(key, box, pad, dpr, paint) {
    const at = this.place(box, pad, dpr);
    this.layer.draw(`p|${key}|${at}`, this.w, this.h, dpr, (x) => { x.translate(-this.ox, -this.oy); paint(x); });
    return this;
  }
  /** a sprite not tied to a place (moving dots): shape drawn around (0, 0); putAt() copies it centred on x, y */
  free(key, r, pad, dpr, color, blur, paint) {
    const s = r + pad;
    this.layer.draw(`f|${key}|${r}|${pad}|${dpr}|${color}|${blur}`, 2 * s, 2 * s, dpr, (x) => {
      x.translate(s, s);
      if (blur > 0) { x.translate(-4096, 0); x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetX = 4096 * dpr; }
      paint(x);
    });
    this.fs = s;
    return this;
  }
  putAt(ctx, x, y, a = 1) {
    if (a <= 0.003 || !this.layer.c) return;
    if (a < 1) { ctx.save(); ctx.globalAlpha *= a; }
    ctx.drawImage(this.layer.c, x - this.fs, y - this.fs, 2 * this.fs, 2 * this.fs);
    if (a < 1) ctx.restore();
  }
  put(ctx, a = 1) {
    if (a <= 0.003 || !this.layer.c) return;
    if (a < 1) { ctx.save(); ctx.globalAlpha *= a; }
    ctx.drawImage(this.layer.c, this.ox, this.oy, this.w, this.h);
    if (a < 1) ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Ui.card(): vertical CARD_HI→CARD fill + diagonal accent/stroke/accent border
export function cardFrame(ctx, b, accent) {
  const g = ctx.createLinearGradient(0, b.top, 0, b.bottom);
  g.addColorStop(0, C.CARD_HI);
  g.addColorStop(1, C.CARD);
  ctx.fillStyle = g;
  roundRect(ctx, b.left, b.top, b.width, b.height, 18);
  ctx.fill();
  const s = ctx.createLinearGradient(b.left, b.top, b.right, b.bottom);
  s.addColorStop(0, alpha(accent, 140));
  s.addColorStop(0.45, C.STROKE);
  s.addColorStop(1, alpha(accent, 40));
  ctx.strokeStyle = s;
  ctx.lineWidth = 1;
  roundRect(ctx, b.left + 0.5, b.top + 0.5, b.width - 1, b.height - 1, 18);
  ctx.stroke();
}

// Safari (iPad / iPhone) ignores ctx.textAlign for Thai and other complex scripts: centred or right-aligned
// Thai text started at x and ran out of its box / card (2.0.13). measureText is right there, so every text is
// drawn left-aligned at a position worked out here — never with textAlign "center" / "right".
export function fillAligned(ctx, str, x, y, align = "left") {
  ctx.textAlign = "left";
  if (align === "center" || align === "right" || align === "end") {
    const w = ctx.measureText(str).width;
    x -= align === "center" ? w / 2 : w;
  }
  ctx.fillText(str, x, y);
}
export function text(ctx, str, x, y, { size = 14, weight = 400, family = "Kanit", color = C.TEXT, align = "left", spacing = 0 } = {}) {
  str = String(str);
  const spaced = spacing && "letterSpacing" in ctx;
  if (!spaced && align !== "left") { x -= align === "center" ? measure(ctx, str, size, weight, family) / 2 : measure(ctx, str, size, weight, family); align = "left"; }
  ctx.font = `${weight} ${size}px "${family}", Kanit, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  if (spaced) ctx.letterSpacing = spacing + "px";
  fillAligned(ctx, str, x, y, align);
  if (spaced) ctx.letterSpacing = "0px";
}
// text widths are asked for many times on every frame (fit / centre / right-align) — remembered per font + string
// (2.0.35); forgotten when a web font finishes loading, since the width changes then
const widths = new Map();
document.fonts?.addEventListener?.("loadingdone", () => widths.clear());
export function measure(ctx, str, size, weight = 400, family = "Kanit") {
  const font = `${weight} ${size}px "${family}", Kanit, sans-serif`, key = font + "\u0001" + str;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(str).width;
    if (widths.size > 6000) widths.clear();
    widths.set(key, w);
  }
  return w;
}
export function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// Backdrop.java: gradient, two drifting glows, scrolling grid and rising motes — ~30 fps (full), ~10 fps (lite),
// drawn once (off). Its loop runs every display frame while visible, so it also feeds the frame-rate monitor.
export function startBackdrop(canvas) {
  const ctx = canvas.getContext("2d");
  const born = performance.now();
  let w = 0, h = 0, dpr = 1, last = 0, loop = 0, frozenT = 0;
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, fx.level === "full" ? 2 : 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    if (fx.level === "off") paint(frozenT);
  };
  const tick = (now) => {
    loop = 0;
    if (fx.level === "off") return;  // static picture, no loop
    loop = requestAnimationFrame(tick);
    frameSample(now);
    if (document.hidden || now - last < (fx.level === "lite" ? 100 : 33)) return;
    last = now;
    paint((frozenT = (now - born) / 1000));
  };
  onFx(() => { size(); if (fx.level !== "off" && !loop) loop = requestAnimationFrame(tick); });
  const paint = (t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, C.BG2); g.addColorStop(1, C.BG);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const R = Math.max(w, 420) * 0.95;
    ctx.fillStyle = radial(ctx, w * (Math.sin(0.21 * t) * 0.08 + 0.12), h * (Math.cos(0.17 * t) * 0.05 + 0.08), R, [[0, alpha(C.CYAN, 36)], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = radial(ctx, w * (Math.cos(0.15 * t) * 0.07 + 0.92), h * (Math.sin(0.12 * t) * 0.08 + 0.68), R, [[0, alpha(C.G2, 32)], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(0, 0, w, h);
    const step = 28, off = (4 * t) % step;
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = off - step; y < h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const x = ((i * 0.618 + 0.11) % 1) * w;
      const f = (((i % 5) * 0.006 + 0.02) * t + 0.137 * i) % 1;
      ctx.fillStyle = alpha(i % 3 === 0 ? C.CYAN : C.TEXT, Math.sin(f * Math.PI) * 60);
      ctx.beginPath();
      ctx.arc(x + Math.sin(i + t) * 6, (1 - f) * h, i % 4 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  addEventListener("resize", size);
  onTheme(() => paint(frozenT));  // theme picked in Settings: new colours right away (also when effects are off)
  size();
  paint(0);
  if (fx.level !== "off") loop = requestAnimationFrame(tick);
}
