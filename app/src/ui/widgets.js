// Animated canvas widgets ported from AIG-LINK BMS v1.6.7 (SocGaugeView, FlowView, MetricTile, CellsView,
// StatusView, ChartView, ScanViews; TempView became a section of the Cells card in 2.0.28) + cloud-only cards (history chart, device card, summary card)
import { C, alpha, mix, tone, clamp01, easeOut, easeOutBack, fmt, duration } from "./theme.js";
import { CanvasCard, roundRect, text, measure, radial, cardFrame, calm, ease, Layer, Sprite } from "./canvas.js";
import { fx } from "./perf.js";
import { drawIcon } from "./icons.js";
import { L } from "../i18n.js";
import { isCharging, isDischarging, etaSeconds, cellVmin, cellVmax, alarmList, flowRatio, flowSpeed } from "../data/model.js";
import { fmtE, fmtAh } from "../data/energy.js";

const rad = (deg) => (deg * Math.PI) / 180;
function arc(ctx, cx, cy, r, startDeg, sweepDeg) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, rad(startDeg), rad(startDeg + sweepDeg), sweepDeg < 0);
}
function dot(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2);
  ctx.fill();
}
function strokeCircle(ctx, x, y, r, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function line(ctx, x1, y1, x2, y2, col, w, cap = "round") {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = cap;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
const fit = (ctx, s, maxW, size, weight = 400, family = "Kanit") => {
  if (measure(ctx, s, size, weight, family) <= maxW) return s;
  while (s.length > 2 && measure(ctx, s + "…", size, weight, family) > maxW) s = s.slice(0, -1);
  return s + "…";
};

// ---------------------------------------------------------------------------
export class SocGauge extends CanvasCard {
  constructor() {
    super(336, { cls: "w-gauge" });
    this.shimmer = true;
    this.shownSoc = 0;
    this.waveLevel = 0;
    this.d = null;
    this.today = null;  // data/energy.js todayEnergy() — charged / discharged today
  }
  set(d) { this.d = d; this.invalidate(); }
  replay() { this.shownSoc = 0; this.waveLevel = 0; this.invalidate(); }
  // static part (2.0.35): the dark liquid well and the empty track — in the card's cached background
  staticKey(b) { return `${b.cx}|${tone("#0E1A31")}|${tone("#0A1222")}|${tone("#16213A")}`; }
  drawStatic(ctx, b) {
    const cx = b.cx, cy = b.top + 150, R = 106, r = R - 30;
    dot(ctx, cx, cy, r, radial(ctx, cx, cy, r, [[0, tone("#0E1A31")], [1, tone("#0A1222")]]));
    arc(ctx, cx, cy, R, 135, 270); ctx.strokeStyle = tone("#16213A"); ctx.lineWidth = 16; ctx.lineCap = "round"; ctx.stroke();
  }
  draw(ctx, b) {
    const t = this.t(), d = this.d;
    const z = !!(d && d.valid), z2 = z && d.soc >= 0;
    const target = z2 ? d.soc : z ? clamp01((d.avgV - 3) / 0.4) * 100 : 0;
    this.shownSoc += (target - this.shownSoc) * ease(0.05);
    this.waveLevel += (target - this.waveLevel) * ease(0.03);
    let label, c1, c2, c3;
    if (z) {
      if (!z2) { label = d.balanceAction ? L.t("กำลังบาลานซ์", "Balancing") : L.t("บาลานเซอร์", "Balancer"); c1 = C.PURPLE; c2 = C.PURPLE; c3 = C.CYAN; }
      else if (isCharging(d)) { label = L.t("กำลังชาร์จ", "Charging"); c1 = C.CYAN; c2 = C.GREEN; c3 = C.GREEN; }
      else if (isDischarging(d)) { label = L.t("กำลังจ่ายไฟ", "Discharging"); c1 = C.AMBER; c2 = C.AMBER; c3 = C.PINK; }
      else { label = L.t("สแตนด์บาย", "Standby"); c1 = C.BLUE; c2 = C.CYAN; c3 = C.CYAN; }
    } else { label = this.offlineLabel || L.t("ยังไม่เชื่อมต่อ", "Not connected"); c1 = C.DIM; c2 = C.SUB; c3 = C.SUB; }
    // gateway offline: keep the last values but grey everything out
    if (z && d.stale) { label = this.offlineLabel || L.t("ออฟไลน์", "Offline"); c1 = C.DIM; c2 = C.SUB; c3 = C.SUB; }
    let acc = c3;
    if (z2 && target < 15) { c1 = C.RED; acc = C.AMBER; }
    this.accent = acc;
    const cx = b.cx, cy = b.top + 150, R = 106;
    const r = R - 30, bottom = cy + r;
    // halo (2.0.35): one cached gradient at its mean size, breathing in opacity — was a new gradient of a changing radius
    // every frame; the liquid well (in the static background) is cut out of it, as the halo used to lie under the well
    const HR = 1.5 * R * 0.925;
    (this._halo ||= new Sprite()).plain(`${acc}|${c1}`, [cx - HR, cy - HR, 2 * HR, 2 * HR], 1, this.dpr, (x) => {
      dot(x, cx, cy, HR, radial(x, cx, cy, HR, [[0, alpha(acc, 64)], [0.55, alpha(c1, 18)], [1, "rgba(0,0,0,0)"]]));
      x.globalCompositeOperation = "destination-out"; dot(x, cx, cy, r + 0.5, "#000");
    }).put(ctx, 0.82 + 0.18 * Math.sin(1.6 * t));
    // liquid core (its dark well is in the static background)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const level = bottom - (this.waveLevel / 100) * 2 * r;
    const amp = !z || Math.abs(d.current) <= 0.15 ? 3.5 : 6;
    for (let k = 0; k < 2; k++) {
      const ph = (k === 0 ? 2.2 : -1.6) * t + k * 1.7;
      ctx.beginPath(); ctx.moveTo(cx - r, bottom);
      for (let i = 0; i <= 40; i++) {
        const f = i / 40;
        ctx.lineTo(cx - r + 2 * r * f, level + Math.sin(ph + f * Math.PI * 2 * (k === 0 ? 1.2 : 1.7)) * amp * (k === 0 ? 1 : 0.7));
      }
      ctx.lineTo(cx + r, bottom); ctx.closePath();
      const g = ctx.createLinearGradient(0, level - amp, 0, bottom);
      g.addColorStop(0, alpha(k === 0 ? acc : c1, k === 0 ? 120 : 90)); g.addColorStop(1, alpha(c1, 25));
      ctx.fillStyle = g; ctx.fill();
    }
    if (z && !d.stale && isCharging(d)) {
      for (let i = 0; i < 7; i++) {
        const f = (0.35 * t + i * 0.143) % 1;
        dot(ctx, cx + Math.sin(i * 2.4 + t) * r * 0.6, bottom - (bottom - level) * f, (i % 3) + 1.5, alpha(C.TEXT, (1 - f) * 90));
      }
    }
    ctx.restore();
    // HUD arcs
    ctx.lineCap = "butt";
    for (let i = 0; i < 3; i++) { arc(ctx, cx, cy, r + 8, t * 40 + i * 120, 70); ctx.strokeStyle = alpha(acc, 110); ctx.lineWidth = 1.4; ctx.stroke(); }
    for (let i = 0; i < 6; i++) { arc(ctx, cx, cy, r + 14, -t * 25 + i * 60, 18); ctx.strokeStyle = alpha(c1, 70); ctx.lineWidth = 1.4; ctx.stroke(); }
    // ticks
    for (let i = 0; i <= 60; i++) {
      const a = rad((270 * i) / 60 + 135), r0 = R + (i % 5 === 0 ? 15 : 18), r1 = R + 23;
      const lit = i <= this.shownSoc * 0.6;
      line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
        lit ? alpha(acc, (Math.sin(6 * t - i * 0.35) * 0.3 + 0.7) * 220) : alpha(C.DIM, 150), 1.5);
    }
    // value arc (the empty track is in the static background)
    ctx.lineCap = "round";
    const sweep = (this.shownSoc * 270) / 100;
    if (sweep > 0.5) {
      const breathe = Math.sin(t * 2.2) * 0.5 + 0.5;
      // 2.0.35: the wide soft arc, its glow and the arc itself change only with the charge level — each is drawn once
      // into a layer (to the nearest 0.25°) and copied; the breathing is the layers' opacity, not a new blur per frame
      const sq = Math.round(sweep * 4) / 4, key = `${sq}|${acc}|${c1}|${cx}|${cy}`, box = [cx - R - 17, cy - R - 17, 2 * R + 34, 2 * R + 34];
      const conic = (x) => {
        if (!x.createConicGradient) return acc;
        const g = x.createConicGradient(rad(135), cx, cy);
        g.addColorStop(0, c1); g.addColorStop(0.75, acc); g.addColorStop(1, c1);
        return g;
      };
      const stroke = (x, w) => { x.lineCap = "round"; arc(x, cx, cy, R, 135, sq); x.strokeStyle = conic(x); x.lineWidth = w; x.stroke(); };
      // the wide soft arc and (at "full") the arc's glow share one layer and breathe together
      // 2.0.28: the arc glows (a real blur at "full", breathing) and a shine runs along it from the start to the head
      const full = fx.level === "full";
      (this._aura ||= new Sprite()).plain(key + "|" + full, box, full ? 26 : 2, this.dpr, (x) => {
        x.globalAlpha = 70 / 255; stroke(x, 34); x.globalAlpha = 1;
        if (full) {
          const OFF = 4096;
          x.save(); x.translate(-OFF, 0); x.shadowColor = alpha(acc, 230); x.shadowBlur = 17; x.shadowOffsetX = OFF * this.dpr; stroke(x, 16); x.restore();
        }
      }).put(ctx, 0.57 + 0.43 * breathe);
      (this._arc ||= new Sprite()).plain(key, box, 2, this.dpr, (x) => stroke(x, 16)).put(ctx);
      if (!calm() && sweep > 12) {
        const f = ((t + this.phase) % 2.6) / 1.9;  // 1.9 s along the arc, then a short pause
        if (f < 1) {
          const head = sweep * easeInOut(f), len = Math.min(42, sweep * 0.4);
          ctx.lineCap = "butt";
          for (let k = 0; k < 7; k++) {
            const a0 = head - len * ((k + 1) / 7), a1 = head - len * (k / 7);
            if (a1 <= 0) break;
            arc(ctx, cx, cy, R, 135 + Math.max(0, a0), a1 - Math.max(0, a0));
            ctx.strokeStyle = alpha(C.TEXT, (1 - k / 7) * 150 * Math.sin(Math.PI * Math.min(1, f * 1.15)));
            ctx.lineWidth = 7 - k * 0.5; ctx.stroke();
          }
          ctx.lineCap = "round";
        }
      }
      for (let i = 6; i >= 0; i--) {
        const a = rad(Math.max(0, sweep - 2.2 * i) + 135), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        dot(ctx, x, y, i === 0 ? 5 : 4.5 - i * 0.4, i === 0 ? C.TEXT : alpha(acc, 150 - i * 20));
        if (i === 0) {
          dot(ctx, x, y, 24, radial(ctx, x, y, 24, [[0, alpha(C.TEXT, (Math.sin(t * 5) * 0.4 + 0.6) * 180)], [0.4, alpha(acc, 70)], [1, "rgba(0,0,0,0)"]]));
          if (!calm()) { const r = (t * 0.8) % 1; strokeCircle(ctx, x, y, 6 + 16 * r, alpha(acc, (1 - r) * 200), 1.4); }  // ripple at the head
        }
      }
    }
    // orbiting particles show current direction
    if (z && !d.stale && Math.abs(d.current) > 0.15) {
      const sp = Math.min(3, Math.abs(d.current) / 25 + 0.6) * (isCharging(d) ? 1 : -1);
      for (let i = 0; i < 12; i++) {
        let a = (t * sp * 40 + i * 30) % 360; if (a < 0) a += 360;
        const rr = R + 32 + Math.sin(t * 2 + i) * 3;
        dot(ctx, cx + Math.cos(rad(a)) * rr, cy + Math.sin(rad(a)) * rr, i % 3 === 0 ? 2.4 : 1.4, alpha(acc, ((i * 18) % 140) + 80));
      }
    }
    // centre text
    let big = z ? String(Math.round(this.shownSoc)) : "--";
    if (z && !z2) big = fmt(d.avgV, 2);
    let bs = 58;
    while (bs > 30 && measure(ctx, big, bs, 700, "Orbitron") > 2 * r - 34) bs -= 2;
    const bw = measure(ctx, big, bs, 700, "Orbitron");
    const bo = { size: bs, weight: 700, family: "Orbitron", align: "center", color: z && d.stale ? mix(C.SUB, C.TEXT, 0.5) : C.TEXT };
    // the glow breathes: one cached glow at changing opacity (2.0.35, was a 16 px blur of the number every frame)
    if (fx.level === "full" && z && !d.stale) this.glowText(ctx, "big", big, cx - 8, cy + 20, bo, alpha(acc, 220), 16, (150 + 70 * (Math.sin(t * 2.2) * 0.5 + 0.5)) / 220);
    else text(ctx, big, cx - 8, cy + 20, bo);
    text(ctx, !z || z2 ? "%" : "V", cx - 8 + bw / 2 + 4, cy + 20, { size: 20, weight: 700, family: "Chakra Petch", color: C.SUB });
    text(ctx, !z || z2 ? L.t("ระดับประจุ", "STATE OF CHARGE") : L.t("แรงดันเซลล์เฉลี่ย", "AVG CELL VOLTAGE"), cx, cy - 40, { size: 11.5, weight: 500, color: mix(C.SUB, C.TEXT, 0.3), align: "center", spacing: 0.9 });
    if (z && !d.stale && isCharging(d)) drawIcon(ctx, "bolt", cx, cy - 60, 16, alpha(C.GREEN, (Math.sin(4 * t) * 0.5 + 0.5) * 115 + 140));
    // state chip
    const cw = (measure(ctx, label, 12, 600) + 28) / 2, ct = cy + 36;
    ctx.fillStyle = alpha(c2, 44); roundRect(ctx, cx - cw, ct, cw * 2, 26, 13); ctx.fill();
    const p = Math.sin(t * 4) * 0.5 + 0.5;
    dot(ctx, cx - cw + 11, ct + 13, 3.2, alpha(c2, p * 135 + 120));
    dot(ctx, cx - cw + 11, ct + 13, p * 5 + 3.2, alpha(c2, 60 * (1 - p)));
    text(ctx, label, cx + 5, ct + 17.3, { size: 12, weight: 600, color: c2, align: "center" });
    // bottom stats
    const y = b.bottom - 40, cwid = b.width / 3;
    let labs, vals;
    if (z && !z2) {
      labs = [L.t("แรงดันรวม", "Pack"), L.t("ส่วนต่าง", "Delta"), L.t("กระแสบาลานซ์", "Balance")];
      vals = [fmt(d.voltage, 2) + " V", Math.round(d.deltaV * 1000) + " mV", fmt(d.balanceCurrent, 2) + " A"];
    } else {
      labs = [L.t("คงเหลือ", "Remaining"), L.t("สุขภาพแบต", "Health"), z && isCharging(d) ? L.t("เต็มใน", "Full in") : L.t("ใช้ได้อีก", "Time left")];
      vals = z ? [`${fmt(d.remainAh, 1)} / ${fmt(d.nominalAh, 0)} Ah`, (d.soh || "--") + " %", duration(etaSeconds(d))] : ["--", "--", "--"];
    }
    // 2.0.28: each stat rises in (one after another), its value glows, and a small bar underneath fills up with a glint
    //   remaining ÷ full capacity · health · charge level (towards full / what is left)
    const live = z && !d.stale;
    const fr = z && z2 ? [d.nominalAh > 0 ? d.remainAh / d.nominalAh : NaN, d.soh > 0 ? d.soh / 100 : NaN, this.shownSoc / 100] : null;
    const bc = [C.CYAN, z && d.soh > 0 && d.soh < 80 ? C.AMBER : C.GREEN, acc];
    for (let i = 0; i < 3; i++) {
      const x = b.left + i * cwid + cwid / 2, e = easeOut((t - this.enterT - 0.25 - i * 0.12) / 0.7);
      if (e <= 0) continue;
      const dy = (1 - e) * 8;
      ctx.save();
      ctx.globalAlpha = e;
      text(ctx, labs[i], x, y + dy, { size: 11.5, weight: 500, color: C.SUB, align: "center", spacing: 0.9 });
      const vo = { size: 15, weight: 600, family: "Chakra Petch", align: "center" }, vs = fit(ctx, vals[i], cwid - 6, 15, 600, "Chakra Petch");
      if (fx.level === "full" && live) this.glowText(ctx, "sv" + i, vs, x, y + 21 + dy, vo, alpha(bc[i], 170), 9);
      else text(ctx, vs, x, y + 21 + dy, vo);
      ctx.restore();
      if (fr && isFinite(fr[i])) this.statBar(ctx, x, b.bottom - 8, Math.min(cwid - 34, 78), clamp01(fr[i]) * e, bc[i], t, i, live);
    }
    // charged / discharged today: top left / top right, above the arc (2.0.25) — hidden for a BMS without SOC (JK04)
    if (this.today && this.today.why !== "nosoc") this.drawToday(ctx, b, cx, cy, R);
  }
  statBar(ctx, x, y, w, f, col, t, i, live) {
    const x0 = x - w / 2;
    ctx.fillStyle = alpha(C.TRACK, 230); roundRect(ctx, x0, y - 1.5, w, 3, 1.5); ctx.fill();
    if (f <= 0.005) return;
    const fw = Math.max(3, w * f), g = ctx.createLinearGradient(x0, 0, x0 + fw, 0);
    g.addColorStop(0, alpha(col, 110)); g.addColorStop(1, col);
    if (fx.level === "full" && live) {
      this.glowShape(ctx, "bar" + i, `${x0},${y},${fw.toFixed(2)},${col}`, [x0, y - 1.5, fw, 3], col, 6, (c) => {
        const g2 = c.createLinearGradient(x0, 0, x0 + fw, 0); g2.addColorStop(0, alpha(col, 110)); g2.addColorStop(1, col);
        c.fillStyle = g2; roundRect(c, x0, y - 1.5, fw, 3, 1.5); c.fill();
      });
    }
    ctx.fillStyle = g; roundRect(ctx, x0, y - 1.5, fw, 3, 1.5); ctx.fill();
    if (live && !calm()) {  // a glint running along the filled part
      const p = (((t * 0.5 + i * 0.33) % 1.4) / 1.4) * 1.3 - 0.15, gx = x0 + fw * p;
      if (p > 0 && p < 1.05) {
        const gg = ctx.createLinearGradient(gx - 12, 0, gx + 12, 0);
        gg.addColorStop(0, alpha(C.TEXT, 0)); gg.addColorStop(0.5, alpha(C.TEXT, 200)); gg.addColorStop(1, alpha(C.TEXT, 0));
        ctx.save(); roundRect(ctx, x0, y - 1.5, fw, 3, 1.5); ctx.clip();
        ctx.fillStyle = gg; ctx.fillRect(gx - 12, y - 2, 24, 4);
        ctx.restore();
      }
    }
    dot(ctx, x0 + fw, y, 2.2, mix(col, C.TEXT, 0.5));
  }
  drawToday(ctx, b, cx, cy, R) {
    const e = this.today, ok = !!e.ok, outer = R + 27;  // clear of the tick ring (R + 23)
    const t = this.t(), full = fx.level === "full";
    // 2.0.28: the kWh count up to their value, glow in their colour, and the ▲ / ▼ drift up / down
    const tgt = [ok ? e.chgKwh : 0, ok ? e.dsgKwh : 0];
    if (!this.shownE || !ok || calm()) this.shownE = tgt.slice();
    if (this.countFrom == null && ok) { this.countFrom = true; this.shownE = [0, 0]; }  // count up once, when the screen opens
    this.shownE = this.shownE.map((v, k) => (isFinite(tgt[k]) && isFinite(v) && Math.abs(tgt[k] - v) >= 0.005 ? v + (tgt[k] - v) * ease(0.08) : tgt[k]));
    // width free between the card edge (+16) and the gauge circle at height y — the circle narrows towards the top
    const room = (y) => { const dy = cy - y; return (dy >= outer ? 1e9 : cx - Math.sqrt(outer * outer - dy * dy)) - (b.left + 16) - 6; };
    const y1 = b.top + 22, y2 = b.top + 44, y3 = b.top + 61;
    [[true, C.GREEN, [L.t("ชาร์จวันนี้", "Charged today"), L.t("ชาร์จ", "Charged")], e.chgKwh, e.chgAh],
      [false, C.AMBER, [L.t("จ่ายวันนี้", "Discharged today"), L.t("จ่าย", "Out")], e.dsgKwh, e.dsgAh]].forEach(([up, col, lbls, kwh, ah], k) => {
      const right = k === 1, x = right ? b.right - 16 : b.left + 16, al = right ? "right" : "left";
      // ▲ label / label ▼
      const r1 = Math.min(room(y1 - 9), 150) - 12;
      const lbl = measure(ctx, lbls[0], 11, 500) <= r1 ? lbls[0] : lbls[1], lw = measure(ctx, lbl, 11, 500);
      const bob = calm() ? 0 : (Math.sin(t * 3 + k) * 0.5 + 0.5) * 2 * (up ? -1 : 1);
      if (full) this.sprite("tri" + k).free(`${up}|${col}`, 9, 8, this.dpr, col, 6, (c) => tri(c, -4, 4.5, up, col)).putAt(ctx, (right ? x - 8 : x) + 4, y1 + bob - 4.5);
      tri(ctx, right ? x - 8 : x, y1 + bob, up, col);
      text(ctx, lbl, right ? x - 12 - lw : x + 12, y1, { size: 11, weight: 500, color: C.SUB });
      // kWh (big)
      const v = ok ? fmtE(this.shownE[k]) : "--", us = 10.5;
      const uw = measure(ctx, "kWh", us, 700, "Chakra Petch"), r2 = room(y2 - 14);
      let size = 20;
      while (size > 12 && measure(ctx, v, size, 600, "Chakra Petch") + 4 + uw > r2) size--;
      const vw = measure(ctx, v, size, 600, "Chakra Petch"), vx = right ? x - uw - 4 - vw : x;
      const ko = { size, weight: 600, family: "Chakra Petch", color: ok ? C.TEXT : C.SUB }, uo = { size: us, weight: 700, family: "Chakra Petch", color: col };
      if (full && ok) { this.glowText(ctx, "kv" + k, v, vx, y2, ko, alpha(col, 190), 10); this.glowText(ctx, "ku" + k, "kWh", vx + vw + 4, y2, uo, alpha(col, 190), 10); }
      else { text(ctx, v, vx, y2, ko); text(ctx, "kWh", vx + vw + 4, y2, uo); }
      // Ah
      if (!ok) return;
      const a = fmtAh(ah) + " Ah", r3 = room(y3 - 9);
      let as = 12;
      while (as > 9.5 && measure(ctx, a, as, 500, "Chakra Petch") > r3) as -= 0.5;
      text(ctx, a, x, y3, { size: as, weight: 500, family: "Chakra Petch", color: C.SUB, align: al });
    });
  }
}

// ---------------------------------------------------------------------------
// Energy flow. 2.0.27: glowing beams, and a flow speed that follows the current as a share of the BMS's own limit
// (max charge / discharge current setting) — flowRatio / flowSpeed in data/model.js. 2.0.28: no "%" / "of 100 A"
// labels on the beam, and the power figure back to a modest size.

export class FlowView extends CanvasCard {
  constructor() { super(176, { cls: "w-flow" }); this.shimmer = true; this.d = null; this.shownP = 0; }
  set(d) { this.d = d; this.invalidate(); }
  // moving: the band with the nodes, beams and the battery; the header only while the power figure counts (2.0.35)
  liveRects(b) {
    const d = this.d, target = d && d.valid ? Math.abs(d.power) : 0;
    if (this.shownP !== target) return null;  // until the figure has snapped to its value
    const y = b.top + 94;
    return [[b.left, y - 68, b.width, 136]];
  }
  draw(ctx, b) {
    const t = this.t(), d = this.d, z = !!(d && d.valid), ch = z && !d.stale && isCharging(d), dc = z && !d.stale && isDischarging(d);
    const glow = fx.level === "full";
    this.accent = ch ? C.GREEN : dc ? C.AMBER : C.BLUE;
    // header: title · power (big, glowing while energy flows)
    const title = L.t("การไหลของพลังงาน", "Energy Flow"), tw = measure(ctx, title, 14, 600);
    text(ctx, title, b.left + 16, b.top + 28, { size: 14, weight: 600 });
    const target = z ? Math.abs(d.power) : 0;
    this.shownP += (target - this.shownP) * (Math.abs(target - this.shownP) < 0.5 ? 1 : ease(0.12));
    const pw = z ? fmt(this.shownP, 0) : "--", pc = z && !d.stale ? (ch || dc ? this.accent : C.TEXT) : C.SUB;
    // 2.0.28: 40 % smaller than 2.0.27 (27 → 16 px), on the title's baseline
    const uw = measure(ctx, "W", 11, 700, "Chakra Petch"), room = b.width - 32 - tw - 14 - uw - 4;
    let ps = 16;
    while (ps > 11 && measure(ctx, pw, ps, 700, "Chakra Petch") > room) ps--;
    const pX = b.right - 16 - uw - 4 - measure(ctx, pw, ps, 700, "Chakra Petch");
    const po = { size: ps, weight: 700, family: "Chakra Petch", color: pc };
    if (glow && (ch || dc)) this.glowText(ctx, "pw", pw, pX, b.top + 28, po, alpha(pc, 200), 10);
    else text(ctx, pw, pX, b.top + 28, po);
    text(ctx, "W", b.right - 16 - uw, b.top + 28, { size: 11, weight: 700, family: "Chakra Petch", color: z && (ch || dc) ? alpha(pc, 200) : C.SUB });
    // rails and beams
    const y = b.top + 94, xl = b.left + 52, cx = b.cx, xr = b.right - 52, nr = 25, R = 33;
    const la = xl + nr + 4, lb = cx - R - 7, ra = cx + R + 7, rb = xr - nr - 4;
    line(ctx, la, y, lb, y, tone("#1A2742"), 4);
    line(ctx, ra, y, rb, y, tone("#1A2742"), 4);
    const rc = ch ? flowRatio(d.current, d.maxChgA) : 0, rd = dc ? flowRatio(d.current, d.maxDsgA) : 0;
    if (ch) this.beam(ctx, la, lb, y, t, C.GREEN, rc, glow);
    if (dc) this.beam(ctx, ra, rb, y, t, C.AMBER, rd, glow);
    this.node(ctx, xl, y, nr, "plug", ch ? C.GREEN : C.DIM, L.t("ชาร์จเจอร์/โซลาร์", "Charger / Solar"), ch ? fmt(d.current, 1) + " A" : "0 A", ch, t, glow);
    this.node(ctx, xr, y, nr, "home", dc ? C.AMBER : C.DIM, L.t("โหลด", "Load"), dc ? fmt(-d.current, 1) + " A" : "0 A", dc, t, glow);
    // battery
    const col = ch ? C.GREEN : dc ? C.AMBER : C.CYAN;
    dot(ctx, cx, y, R * 1.9, radial(ctx, cx, y, R * 1.9, [[0, alpha(col, (Math.sin(t * 3) * 0.5 + 0.5) * 50 + 40)], [1, "rgba(0,0,0,0)"]]));
    if (ch || dc) for (let i = 0; i < 3; i++) { const f = (0.6 * t + i / 3) % 1; strokeCircle(ctx, cx, y, 4 + R + f * 26, alpha(col, (1 - f) * 150), 1.5); }
    const g = ctx.createLinearGradient(0, y - R, 0, y + R); g.addColorStop(0, tone("#17243F")); g.addColorStop(1, tone("#0C1426"));
    dot(ctx, cx, y, R, g);
    if (glow && (ch || dc)) this.glowShape(ctx, "bat", `${cx},${y},${R},${col}`, [cx - R - 1, y - R - 1, 2 * R + 2, 2 * R + 2], col, 16, (c) => strokeCircle(c, cx, y, R, col, 2));
    strokeCircle(ctx, cx, y, R, col, 2);
    // battery glyph
    const bw = 10, bh = 16, top = y - bh + 2, bot = y + bh + 2;
    ctx.strokeStyle = C.TEXT; ctx.lineWidth = 2; roundRect(ctx, cx - bw, top, bw * 2, bot - top, 3); ctx.stroke();
    line(ctx, cx - 4, top - 3, cx + 4, top - 3, C.TEXT, 2);
    let lv = !z ? 0 : d.soc >= 0 ? d.soc / 100 : 0.5;
    if (ch) lv = Math.min(1, lv * (((0.8 * t) % 1) * 0.15 + 0.85));
    ctx.fillStyle = col; ctx.fillRect(cx - bw + 3, bot - 3 - (bot - top - 6) * lv, bw * 2 - 6, (bot - top - 6) * lv);
    text(ctx, L.t("แบตเตอรี่", "Battery"), cx, y + R + 20, { size: 11, weight: 500, color: C.SUB, align: "center" });
    text(ctx, z ? fmt(d.voltage, 2) + " V" : "--", cx, y + R + 36, { size: 13.5, weight: 600, family: "Chakra Petch", align: "center" });
  }
  node(ctx, x, y, r, icon, col, label, val, on, t, glow) {
    if (on) {
      dot(ctx, x, y, r * 1.75, radial(ctx, x, y, r * 1.75, [[0, alpha(col, (Math.sin(t * 3) * 0.5 + 0.5) * 30 + 34)], [1, "rgba(0,0,0,0)"]]));
      // HUD segments turning around the ring
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) { arc(ctx, x, y, r + 6, t * 80 + i * 120, 46); ctx.strokeStyle = alpha(col, 150); ctx.lineWidth = 1.6; ctx.stroke(); }
    }
    const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, tone("#141F37")); g.addColorStop(1, tone("#0B1324"));
    dot(ctx, x, y, r, g);
    if (on && glow) this.glowShape(ctx, "node" + icon, `${x},${y},${r},${col}`, [x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2], col, 12, (c) => strokeCircle(c, x, y, r, col, 2));
    strokeCircle(ctx, x, y, r, on ? col : alpha(col, 200), on ? 2 : 1.5);
    drawIcon(ctx, icon, x, y, 22, col === C.DIM ? C.SUB : col, 2);
    text(ctx, label, x, y + r + 20, { size: 11, weight: 500, color: C.SUB, align: "center" });
    text(ctx, val, x, y + r + 36, { size: 13.5, weight: 600, family: "Chakra Petch", align: "center", color: on ? mix(col, C.TEXT, 0.35) : C.TEXT });
  }
  // a glowing beam from xa to xb: light body, an energy stream of dashes and comets with tails, a flash where they arrive
  beam(ctx, xa, xb, y, t, col, ratio, glow) {
    const len = xb - xa, sp = flowSpeed(ratio), w = 2.2 + 2.4 * ratio;
    if (len < 6) return;
    ctx.save();
    ctx.lineCap = "round";
    if (!glow) line(ctx, xa, y, xb, y, alpha(col, 30), w + 8);  // soft halo without blur
    const g = ctx.createLinearGradient(xa, y, xb, y);
    g.addColorStop(0, alpha(col, 60)); g.addColorStop(1, alpha(col, 220));
    if (glow) {
      const bl = Math.round(8 + 12 * ratio);
      this.glowShape(ctx, "beam" + col, `${xa},${xb},${y},${w.toFixed(1)},${col}`, [xa - w, y - w, len + 2 * w, 2 * w], col, bl, (c) => {
        const g2 = c.createLinearGradient(xa, y, xb, y); g2.addColorStop(0, alpha(col, 60)); g2.addColorStop(1, alpha(col, 220));
        c.lineCap = "round"; line(c, xa, y, xb, y, g2, w);
      });
    }
    line(ctx, xa, y, xb, y, g, w);
    // the stream: dashes running with the current, one lap in 1 / sp seconds
    ctx.setLineDash([7, 11]);
    ctx.lineDashOffset = -((t * sp * len) % 18);
    line(ctx, xa, y, xb, y, alpha(mix(col, C.TEXT, 0.5), 190), 1.6, "butt");
    ctx.setLineDash([]);
    // comets: more and longer when more of the limit flows
    const n = 2 + Math.round(2 * ratio), tail = Math.min(len * 0.6, 16 + 26 * ratio);
    for (let i = 0; i < n; i++) {
      const f = (t * sp + i / n) % 1, x = xa + len * f;
      const fade = Math.min(1, f * 8) * (f > 0.9 ? (1 - f) / 0.1 : 1);
      const tx = Math.max(xa, x - tail);
      if (x - tx > 1) {
        const tg = ctx.createLinearGradient(tx, y, x, y); tg.addColorStop(0, alpha(col, 0)); tg.addColorStop(1, alpha(col, 235 * fade));
        line(ctx, tx, y, x, y, tg, 3 + 1.6 * ratio);
      }
      dot(ctx, x, y, 9 + 5 * ratio, radial(ctx, x, y, 9 + 5 * ratio, [[0, alpha(col, 170 * fade)], [1, "rgba(0,0,0,0)"]]));
      if (glow) this.sprite("comet" + col).free(`${(2.3 + ratio).toFixed(2)}|${col}`, 2.3 + ratio, 12, this.dpr, col, 10, (c) => dot(c, 0, 0, 2.3 + ratio, C.TEXT)).putAt(ctx, x, y, fade);
      dot(ctx, x, y, 2.3 + ratio, alpha(C.TEXT, 255 * fade));
    }
    // arrival flash at the far end, each time a comet gets there
    const a = (t * sp * n) % 1, k = (1 - a) * (1 - a);
    dot(ctx, xb, y, 6 + 10 * (1 - k), radial(ctx, xb, y, 6 + 10 * (1 - k), [[0, alpha(col, 200 * k)], [1, "rgba(0,0,0,0)"]]));
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class MetricTile extends CanvasCard {
  static N = 40;  // samples on the sparkline
  constructor(icon, label, color) {
    super(128, { cls: "w-tile", accent: color });
    this.shimmer = true;
    this.icon = icon; this.label = label; this.color = color;
    this.text = "--"; this.unit = ""; this.sub = "";
    this.numeric = false; this.shown = 0; this.target = 0; this.dec = 0;
    this.flashAt = -1e4; this.spark = [];
    // optional block on the right of the value (2.0.27, cell-delta tile: balancer state + current):
    // { top: "ชาร์จบาลานซ์", val: "0.807 A", color, live } — live: a pulsing dot while it works
    this.side = null;
    // or (2.0.28, temperature tiles) up to 3 small rows on the right: [[label, value, colour], …] — avg / max / min
    this.stats = null;
    // sparkline (2.0.28: smooth, glowing, a light pulse running along it, glides left when a sample arrives)
    this.sparkTs = []; this.pushT = -1e4; this.slide = false; this.sLo = 0; this.sHi = 0;
    // places on the line, and empty places at its left while a history is shorter than the time the line covers (2.0.38)
    this.N = MetricTile.N; this.off = 0; this.hist = false;
  }
  set(txt, unit, sub, color) {
    this.numeric = false; this.text = txt; this.unit = unit || ""; this.sub = sub || ""; if (color) this.color = color; this.invalidate();
  }
  setNum(v, dec, unit, sub, color) {
    if (v == null || !isFinite(v)) return this.set("--", unit, sub, color);
    if (!this.numeric) this.shown = 0.6 * v;
    if (Math.abs(v - this.target) > Math.pow(10, -dec) * 0.5) this.flashAt = this.t() * 1000;
    this.numeric = true; this.target = v; this.dec = dec; this.unit = unit || ""; this.sub = sub || ""; if (color) this.color = color;
    this.invalidate();
  }
  push(v) {
    if (v == null || !isFinite(v)) return;
    // a line from history (below): the reading of right now is its last point — moved, not added
    if (this.hist) { this.spark[this.spark.length - 1] = v; this.sparkTs[this.sparkTs.length - 1] = Date.now(); this.ver = (this.ver || 0) + 1; return; }
    this.spark.push(v); this.sparkTs.push(Date.now()); this.ver = (this.ver || 0) + 1;
    this.slide = this.spark.length > this.N;  // a full line moves one step left
    if (this.slide) { this.spark.shift(); this.sparkTs.shift(); }
    this.pushT = this.t();
  }
  /**
   * The line from a history (2.0.38, Home Assistant's recorder): `vals` one per `step` ms from `t0` up to the last full
   * step, out of `slots` places for the time the line covers (a shorter history starts further right) — and one more
   * place at the right for the reading of right now, which push() keeps up to date. A history one step on (every
   * 5 minutes) glides the line one place left.
   */
  history(vals, slots, t0, step) {
    if (!vals?.length) return;
    const last = this.spark.length ? this.spark[this.spark.length - 1] : vals[vals.length - 1];
    const glide = this.hist && t0 - this.histT0 === step && vals.length === slots && this.off === 0;
    this.hist = true; this.histT0 = t0; this.N = slots + 1; this.off = Math.max(0, slots - vals.length);
    this.spark = [...vals, last];
    this.sparkTs = vals.map((_, k) => t0 + k * step).concat(Date.now());
    this.ver = (this.ver || 0) + 1;
    this.slide = glide;
    if (glide) this.pushT = this.t();
    this.invalidate();
  }
  // seconds covered by the samples on the sparkline
  sparkSpan() { const n = this.sparkTs.length; return n > 1 ? (this.sparkTs[n - 1] - this.sparkTs[0]) / 1000 : 0; }
  // avg / max / min of the samples on the sparkline (null when there are none)
  sparkStats() {
    const a = this.spark;
    if (!a.length) return null;
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    return { avg: sum / a.length, max: hi, min: lo, n: a.length };
  }
  draw(ctx, b) {
    this.accent = this.color;
    const t = this.t(), pad = 12;
    const fl = 1 - clamp01((1000 * t - this.flashAt) / 700);
    if (fl > 0) {
      ctx.fillStyle = radial(ctx, b.left + 40, b.top + 62, b.width, [[0, alpha(this.color, fl * 60)], [1, "rgba(0,0,0,0)"]]);
      roundRect(ctx, b.left, b.top, b.width, b.height, 18); ctx.fill();
    }
    const ix = b.left + pad + 14, iy = b.top + pad + 14, ph = (0.8 * t) % 1;
    dot(ctx, ix, iy, ph * 6 + 14, alpha(this.color, (1 - ph) * 50));
    dot(ctx, ix, iy, 14, alpha(this.color, 38));
    drawIcon(ctx, this.icon, ix, iy, 16, this.color);
    text(ctx, fit(ctx, this.label, b.width - (ix - b.left) - 30, 11.5, 500), ix + 20, iy + 4, { size: 11.5, weight: 500, color: C.SUB });
    this.drawSpark(ctx, b, t);
    let s;
    if (this.numeric) {
      const k = Math.abs(this.target - this.shown) < Math.pow(10, -this.dec) * 0.5 ? 1 : ease(0.12);
      this.shown += (this.target - this.shown) * k;
      s = fmt(this.shown, this.dec);
    } else s = this.text;
    const vy = b.top + 70;
    const sideW = this.side ? this.drawSide(ctx, b, pad, vy, t) : this.stats ? this.drawStats(ctx, b, pad, vy) : 0;
    let size = 23;
    while (size > 14 && measure(ctx, s, size, 600, "Chakra Petch") + measure(ctx, this.unit, 12, 700, "Chakra Petch") + 6 > b.width - pad * 2 - sideW) size -= 1;
    text(ctx, s, b.left + pad, vy, { size, weight: 600, family: "Chakra Petch" });
    text(ctx, this.unit, b.left + pad + measure(ctx, s, size, 600, "Chakra Petch") + 4, vy, { size: 12, weight: 700, family: "Chakra Petch", color: C.SUB });
    if (Array.isArray(this.sub)) this.drawParts(ctx, b.left + pad, b.width - pad * 2, vy + 17);
    else text(ctx, fit(ctx, this.sub, b.width - pad * 2, 10.5), b.left + pad, vy + 17, { size: 10.5, color: C.SUB });
  }
  // between data updates only the icon's ring, the sparkline strip and a live dot move (2.0.35)
  liveRects(b) {
    const t = this.t();
    if (t - this.enterT < 1.3 || 1000 * t - this.flashAt < 750) return null;
    if (this.numeric && this.shown !== this.target) return null;  // until the figure has snapped to its value
    const ix = b.left + 26, iy = b.top + 26, rs = [[ix - 22, iy - 22, 44, 44]];
    // the strip under the sparkline, edge to edge: the newest sample's ripple reaches past the card's border
    if (this.spark.length >= 2) rs.push([0, b.bottom - 48, this.w, 52]);
    if (this.side?.live) rs.push([b.left, b.top + 40, b.width, 20]);
    return rs;
  }
  // Sparkline along the bottom: a smooth curve (monotone, never overshoots), its scale easing to new extremes, a soft
  // glow (blur at "full", a wide faint stroke at "lite"), a light pulse running along it every few seconds, and a
  // ripple at the newest sample. A new sample on a full line makes it glide one step left instead of jumping.
  drawSpark(ctx, b, t) {
    const n = this.spark.length, e = easeOut((t - this.enterT) / 1.2);
    if (n < 2 || e <= 0) return;
    const col = this.color, N = this.N, still = calm(), off = this.off;
    let lo = Infinity, hi = -Infinity;
    for (const v of this.spark) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 0.001) { hi += 0.5; lo -= 0.5; }
    if (!(this.sHi > this.sLo) || still) { this.sLo = lo; this.sHi = hi; }
    this.sLo += (lo - this.sLo) * ease(0.1); this.sHi += (hi - this.sHi) * ease(0.1);
    const x0 = b.left + 6, x1 = b.right - 6, yb = b.bottom - 5, yt = b.bottom - 24, step = (x1 - x0) / (N - 1);
    const Y = (v) => yb + ((yt - yb) * (v - this.sLo)) / (this.sHi - this.sLo);
    const g = still ? 0 : 1 - easeOut((t - this.pushT) / 0.6);  // 1 → 0 just after a sample arrives
    const m = Math.max(1, Math.floor((n - 1) * e));
    const xs = new Float32Array(m + 1), ys = new Float32Array(m + 1);
    for (let i = 0; i <= m; i++) { xs[i] = x0 + step * (i + off + (this.slide ? g : 0)); ys[i] = Y(this.spark[i]); }
    let hx = xs[m], hy = ys[m];
    if (g > 0 && m === n - 1) {
      if (this.slide) { hx = x1; hy = ys[m - 1] + (ys[m] - ys[m - 1]) * (1 - g); }      // head rides the right edge
      else { xs[m] = hx = xs[m - 1] + step * (1 - g); ys[m] = hy = ys[m - 1] + (ys[m] - ys[m - 1]) * (1 - g); }  // grows
    }
    // area + line + glow (2.0.35): a cached layer while the line only glides — a new sample on a full line moves the
    // whole line one step left, which is the layer copied at an offset; drawn live only while it is still growing
    const steady = this.slide || g <= 0, sx0 = this.slide ? step * g : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, b.top, x1 - x0, b.height); ctx.clip();
    if (steady) {
      const X = new Float32Array(m + 1);
      for (let i = 0; i <= m; i++) X[i] = x0 + step * (i + off);
      const key = `${this.ver}|${this.sLo.toPrecision(5)}|${this.sHi.toPrecision(5)}|${m}|${b.width}|${col}|${fx.level}`;
      const sp = this.sprite("spark").plain(key, [x0 - 2, yt - 6, x1 - x0 + 4, yb - yt + 12], 12, this.dpr, (c) => this.sparkBody(c, X, ys, m, x0, x1, yt, yb, col));
      if (sx0) ctx.translate(sx0, 0);
      sp.put(ctx);
      if (sx0) ctx.translate(-sx0, 0);
    } else this.sparkBody(ctx, xs, ys, m, x0, x1, yt, yb, col);
    // light pulse running left → right, one every 3.2 s — stroked only where it shows (its gradient is clear
    // elsewhere), so its blur covers a few samples instead of the whole line
    if (!still) {
      const f = (((t + this.phase) % 3.2) / 3.2) * 1.35 - 0.1, sx = x0 + (x1 - x0) * f;
      if (sx > x0 && sx - 46 < xs[m]) {
        let i0 = 0, i1 = m;
        while (i0 < m && xs[i0 + 1] < sx - 46) i0++;
        while (i1 > i0 + 1 && xs[i1 - 1] > sx + 3) i1--;
        i0 = Math.max(0, i0 - 1); i1 = Math.min(m, i1 + 1);
        const gp = ctx.createLinearGradient(sx - 46, 0, sx + 3, 0);
        gp.addColorStop(0, alpha(col, 0)); gp.addColorStop(0.85, alpha(mix(col, C.TEXT, 0.6), 235)); gp.addColorStop(1, alpha(C.TEXT, 0));
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.shadowColor = col; ctx.shadowBlur = fx.level === "full" ? 10 : 0;
        ctx.beginPath(); monotone(ctx, xs, ys, i0, i1); ctx.strokeStyle = gp; ctx.lineWidth = 2.6; ctx.stroke();
      }
    }
    ctx.restore();
    // newest sample: halo, ripple, bright dot (its glow a cached sprite)
    const p = Math.sin(t * 5) * 0.5 + 0.5;
    dot(ctx, hx, hy, 6, alpha(col, p * 60 + 30));
    if (!still) { const r = (t * 0.7 + this.phase) % 1; strokeCircle(ctx, hx, hy, 3 + 10 * r, alpha(col, (1 - r) * 170), 1.2); }
    if (fx.level === "full") this.sprite("head").free(col, 2.3, 10, this.dpr, col, 8, (c) => dot(c, 0, 0, 2.3, C.TEXT)).putAt(ctx, hx, hy);
    dot(ctx, hx, hy, 2.3, C.TEXT);
  }
  // the area under the sparkline and the line itself (with its glow at "full")
  sparkBody(ctx, xs, ys, m, x0, x1, yt, yb, col) {
    const path = () => { ctx.beginPath(); monotone(ctx, xs, ys, 0, m); };
    path(); ctx.lineTo(xs[m], yb + 1); ctx.lineTo(xs[0], yb + 1); ctx.closePath();
    const ga = ctx.createLinearGradient(0, yt, 0, yb);
    ga.addColorStop(0, alpha(col, 70)); ga.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = ga; ctx.fill();
    // line: older samples fainter, glowing
    const gl = ctx.createLinearGradient(x0, 0, x1, 0);
    gl.addColorStop(0, alpha(col, 90)); gl.addColorStop(1, col);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    path();
    ctx.save();
    if (fx.level === "lite") { ctx.strokeStyle = alpha(col, 45); ctx.lineWidth = 5; ctx.stroke(); }
    if (fx.level === "full") { ctx.shadowColor = alpha(col, 210); ctx.shadowBlur = 8; }
    ctx.strokeStyle = gl; ctx.lineWidth = 1.9; ctx.stroke();
    ctx.restore();
  }
  // up to 3 rows (label + value) right-aligned beside the value; a row without a value is a heading over the rows
  // below it ("last 12 h", 2.0.37); returns the width it takes (+ gap)
  drawStats(ctx, b, pad, vy) {
    const rows = this.stats.slice(0, 3), x = b.right - pad, avail = (b.width - pad * 2) * 0.5, head = (v) => v == null || v === "";
    let ls = 9.5, vs = 11.5, lw = 0, vw = 0, hw = 0;
    const fit = () => {
      lw = vw = hw = 0;
      for (const [l, v] of rows) {
        if (head(v)) hw = Math.max(hw, measure(ctx, l, ls, 500));
        else { lw = Math.max(lw, measure(ctx, l, ls, 500)); vw = Math.max(vw, measure(ctx, v, vs, 600, "Chakra Petch")); }
      }
      return Math.max(lw + 5 + vw, hw);
    };
    while ((ls > 8 || vs > 9.5) && fit() > avail) { ls = Math.max(8, ls - 0.5); vs = Math.max(9.5, vs - 0.5); }
    const w = fit();
    rows.forEach(([l, v, col], i) => {
      const y = vy - 21 + i * 14;
      if (head(v)) { text(ctx, l, x, y, { size: ls, weight: 500, color: C.SUB, align: "right" }); return; }
      text(ctx, v, x, y, { size: vs, weight: 600, family: "Chakra Petch", color: col || C.TEXT, align: "right" });
      text(ctx, l, x - vw - 5, y, { size: ls, weight: 500, color: mix(C.SUB, C.DIM, 0.25), align: "right" });
    });
    return w + 10;
  }
  // the side block, right-aligned in the value row; returns the width it takes (+ gap)
  drawSide(ctx, b, pad, vy, t) {
    const sd = this.side, x = b.right - pad, col = sd.color || C.SUB, avail = (b.width - pad * 2) * 0.58;
    let ts = 10.5, vs = 13.5;
    const dotW = sd.live ? 11 : 0;
    while (ts > 8.5 && measure(ctx, sd.top, ts, 500) + dotW > avail) ts -= 0.5;
    while (vs > 10.5 && measure(ctx, sd.val, vs, 600, "Chakra Petch") > avail) vs -= 0.5;
    const tw = measure(ctx, sd.top, ts, 500), vw = measure(ctx, sd.val, vs, 600, "Chakra Petch");
    text(ctx, sd.top, x, vy - 17, { size: ts, weight: 500, color: col, align: "right" });
    if (sd.live) {
      const p = Math.sin(t * 4) * 0.5 + 0.5, dx = x - tw - 6, dy = vy - 20.5;
      dot(ctx, dx, dy, 2.6, alpha(col, p * 135 + 120));
      dot(ctx, dx, dy, p * 4 + 2.6, alpha(col, 70 * (1 - p)));
    }
    text(ctx, sd.val, x, vy, { size: vs, weight: 600, family: "Chakra Petch", color: sd.live ? mix(col, C.TEXT, 0.35) : C.TEXT, align: "right" });
    return Math.max(tw + dotW, vw) + 10;
  }
  // sub line given as [label, value] pairs (e.g. temperature probes): spread them out with a clear gap,
  // shrinking the text a little on narrow tiles rather than letting the items touch
  drawParts(ctx, x, avail, y) {
    const parts = this.sub, n = parts.length;
    if (!n) return;
    const IN = 3, GAP_MIN = 10, GAP_MAX = 18;
    let size = 10.5, ws, total, gap;
    for (;;) {
      ws = parts.map(([l, v]) => measure(ctx, l, size, 500) + IN + measure(ctx, v, size, 500));
      total = ws.reduce((a, w) => a + w, 0);
      gap = n > 1 ? Math.min(GAP_MAX, (avail - total) / (n - 1)) : 0;
      if (gap >= GAP_MIN || size <= 8.5) break;
      size -= 0.5;
    }
    gap = Math.max(gap, 4);
    const lc = mix(C.SUB, C.DIM, 0.45), vc = mix(C.SUB, C.TEXT, 0.25);
    parts.forEach(([l, v], i) => {
      text(ctx, l, x, y, { size, weight: 500, color: lc });
      text(ctx, v, x + measure(ctx, l, size, 500) + IN, y, { size, weight: 500, color: vc });
      x += ws[i] + gap;
    });
  }
}

// ---------------------------------------------------------------------------
export class CellsView extends CanvasCard {
  static BARS = 0; static GRID = 1;
  constructor(mode) {
    super(mode === 0 ? 230 : 120, { cls: "w-cells", accent: C.CYAN });
    this.mode = mode; this.shimmer = mode === 0;
    this.sweep = true;  // the light running across the bars (the Home Assistant card turns it off, 2.0.35)
    // bars scaled to the pack chemistry's whole cell range and coloured by each cell's voltage (Home Assistant card
    // 1.0.15; off = the app's zoomed scale around the cells, MAX amber / MIN blue)
    this.chemScale = false;
    // Home Assistant card 1.0.16: bar height on an automatic range around the cells (colour still by chemistry),
    // liquid-style bars (moving wave top, rising bubbles, flow bands) and labelled, glowing MAX / MIN bars
    this.autoRange = false; this.fancy = false;
    this.d = null; this.shownH = new Float32Array(32); this.sLo = -1; this.sHi = -1; this.tLo = -1; this.tHi = -1;
    this.shownMax = -1; this.shownMin = -1;
    // dashboard bars: tap (or drag across) a bar to see its voltage for a moment
    this.tip = -1; this.tipHold = false; this.tipAt = 0; this.tops = new Float32Array(32);
    if (mode === 0) this.onPointer((x, y, ph) => this.touch(x, y, ph));
  }
  touch(x, y, ph) {
    const g = this._bars;
    if (!g) return;
    if (ph === "up" || ph === "leave") {
      if (this.tip >= 0 && this.tipHold) { this.tipHold = false; this.tipAt = this.t(); this.animateUntil(this.t() + 3); }
      this.invalidate();
      return;
    }
    const inside = x >= g.x0 - 6 && x <= g.x1 + 6 && y >= g.y0 - 24 && y <= g.y1 + 22;
    if (!inside) { if (ph === "down") { this.tip = -1; this.invalidate(); } return; }
    const i = Math.max(0, Math.min(g.n - 1, Math.floor((x - g.x0 + g.gap / 2) / (g.bw + g.gap))));
    if (i !== this.tip && ph === "down") navigator.vibrate?.(8);
    this.tip = i; this.tipHold = true; this.tipAt = this.t();
    this.invalidate();
  }
  // 1 while held, then fades out 2.5 s after the finger lifts
  tipAlpha() {
    if (this.tip < 0) return 0;
    if (this.tipHold) return 1;
    const a = 1 - clamp01((this.t() - this.tipAt - 2.5) / 0.35);
    if (a <= 0) this.tip = -1;
    return a;
  }
  drawTip(ctx, b, i, cx, top, a) {
    const d = this.d, v = d.cellV[i], r = d.cellR?.[i] > 0 ? d.cellR[i] : 0, col = this.colorFor(i, v);
    const dv = Math.round((v - d.avgV) * 1000);
    const head = L.t("เซลล์ ", "Cell ") + (i + 1), val = fmt(v, 3) + " V";
    const sub = [d.avgV > 0 ? `${dv > 0 ? "+" : dv < 0 ? "−" : "±"}${Math.abs(dv)} mV ${L.t("จากเฉลี่ย", "vs avg")}` : null, r ? fmt(r * 1000, 0) + " mΩ" : null].filter(Boolean).join(" · ");
    const w = Math.max(measure(ctx, head, 10.5, 500), measure(ctx, val, 17, 700, "Chakra Petch"), sub ? measure(ctx, sub, 10, 500) : 0) + 22;
    const hgt = sub ? 62 : 46;
    const bx = Math.max(b.left + 6, Math.min(b.right - 6 - w, cx - w / 2));
    const by = Math.max(b.top + 32, top - 12 - hgt);
    ctx.save();
    ctx.globalAlpha = a;
    softShadow(ctx, bx, by, w, hgt, 11);
    ctx.fillStyle = tone("#0A1222"); roundRect(ctx, bx, by, w, hgt, 11); ctx.fill();
    if (by + hgt < top - 2) {  // little arrow down to the bar
      ctx.beginPath(); ctx.moveTo(cx - 6, by + hgt - 0.5); ctx.lineTo(cx, by + hgt + 6); ctx.lineTo(cx + 6, by + hgt - 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = alpha(col, 190); ctx.lineWidth = 1.2; roundRect(ctx, bx + 0.5, by + 0.5, w - 1, hgt - 1, 11); ctx.stroke();
    text(ctx, head, bx + w / 2, by + 16, { size: 10.5, weight: 500, color: C.SUB, align: "center" });
    text(ctx, val, bx + w / 2, by + 36, { size: 17, weight: 700, family: "Chakra Petch", color: col, align: "center" });
    if (sub) text(ctx, sub, bx + w / 2, by + 53, { size: 10, weight: 500, color: mix(C.SUB, C.TEXT, 0.2), align: "center" });
    ctx.restore();
  }
  // AIG-LINK uses 4 columns on phones; wider screens get more
  static cols(n, w) {
    if (n > 0 && n <= 3) return n;
    return w > 700 ? 8 : w > 520 ? 6 : 4;
  }
  set(d) {
    this.d = d;
    const ok = !!(d && d.valid && d.cellCount > 0);
    if (ok) { this.shownMax = Math.max(0, Math.min(d.maxCell, d.cellCount - 1)); this.shownMin = Math.max(0, Math.min(d.minCell, d.cellCount - 1)); }
    if (ok && this.autoRange) {  // the BMS's max / min cell number can lag the cell voltages: take them from the bars themselves (1.0.16)
      let mx = -1, mn = -1;
      for (let k = 0; k < d.cellCount; k++) { const v = d.cellV[k]; if (!(v > 0.5)) continue; if (mx < 0 || v > d.cellV[mx]) mx = k; if (mn < 0 || v < d.cellV[mn]) mn = k; }
      if (mx >= 0) { this.shownMax = mx; this.shownMin = mn; }
    }
    else { this.shownMax = this.shownMin = -1; }
    if (this.mode !== 0) {
      const n = ok ? d.cellCount : 0;
      const cols = CellsView.cols(n, this.w || this.el.clientWidth || 360);
      const rows = Math.ceil(n / Math.max(1, cols));
      this.setHeight(ok ? rows * (this.tileH() + 8) + 60 : 110);
    }
    this.invalidate();
  }
  // grid tiles show the cell wire resistance under the voltage whenever the BMS reports any
  hasR() { const d = this.d; return !!(d && d.cellR && d.cellR.some((r) => r > 0)); }
  tileH() { return this.hasR() ? 76 : 62; }
  resize() { super.resize(); if (this.d && this.mode !== 0) this.set(this.d); }
  draw(ctx, b) {
    const d = this.d, ok = !!(d && d.valid && d.cellCount > 0), n = ok ? d.cellCount : 0;
    text(ctx, L.t("แรงดันแต่ละเซลล์", "Cell Voltages"), b.left + 16, b.top + 26, { size: 14, weight: 600 });
    const ty = b.top + 26;
    this.statsY = 0;
    if (ok && this.mode === 0) {
      // lowest · average (2.0.28) · highest — beside the title when it fits, else on a line of their own under it
      const hi = this.shownMax >= 0 ? d.cellV[this.shownMax] : d.maxV, lo = this.shownMin >= 0 ? d.cellV[this.shownMin] : d.minV;
      const parts = [[L.t("ต่ำสุด ", "min ") + fmt(lo, 3) + " V", C.ICE], [L.t("เฉลี่ย ", "avg ") + fmt(d.avgV, 3) + " V", mix(C.TEXT, C.SUB, 0.15)], [L.t("สูงสุด ", "max ") + fmt(hi, 3) + " V", C.AMBER]];
      const sep = "  ·  ", sw = measure(ctx, sep, 11, 500), total = parts.reduce((a, [s]) => a + measure(ctx, s, 11, 500), 0) + 2 * sw;
      const inline = total <= b.width - 32 - measure(ctx, L.t("แรงดันแต่ละเซลล์", "Cell Voltages"), 14, 600) - 12;
      const y = inline ? ty : ty + 19;
      let x = b.right - 16;
      if (!inline) this.statsY = y;
      [...parts].reverse().forEach(([s, col], i) => {
        if (i) { text(ctx, sep, x, y, { size: 11, weight: 500, color: C.DIM, align: "right" }); x -= sw; }
        text(ctx, s, x, y, { size: 11, weight: 500, color: col, align: "right" }); x -= measure(ctx, s, 11, 500);
      });
    } else {
      const s = !ok ? "--" : L.t("ต่าง ", "Δ ") + Math.round(d.deltaV * 1000) + " mV · " + n + "S";
      text(ctx, s, b.right - 16, ty, { size: 11, weight: 500, color: ok && d.deltaV > 0.05 ? C.AMBER : C.SUB, align: "right" });
    }
    if (!ok) {
      text(ctx, this.waitText || L.t("รอข้อมูลเซลล์จาก BMS…", "Waiting for cell data…"), b.cx, b.cy + 14, { size: 11, weight: 500, color: mix(C.DIM, C.SUB, Math.sin(this.t() * 3) * 0.5 + 0.5), align: "center" });
      return;
    }
    if (this.mode === 0) this.bars(ctx, b, n); else this.grid(ctx, b, n, "live");
  }
  // moving between data updates (2.0.35) — bars: the bar area; grid: the number badges and the MAX / MIN tiles
  liveRects(b) {
    const d = this.d, ok = !!(d && d.valid && d.cellCount > 0);
    if (!ok || this.tip >= 0 || this.t() - this.enterT < 1.8) return null;
    if (this.mode === 0) {
      const y0 = b.top + 44 + (this.statsY ? 14 : 0), y1 = b.bottom - 26;
      return [[b.left, y0 - 20, b.width, y1 - y0 + 36]];
    }
    const n = d.cellCount, cols = CellsView.cols(n, b.width), x0 = b.left + 12, x1 = b.right - 12, y0 = b.top + 42, gap = 8;
    const cw = (x1 - x0 - (cols - 1) * gap) / cols, ch = this.tileH(), rs = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      if ((i === this.shownMax || i === this.shownMin) && d.deltaV > 0.002) rs.push([x - 10, y - 10, cw + 20, ch + 20]);
      else rs.push([x - 8, y - 11, 60, 50]);  // the badge and its glow
    }
    return rs;
  }
  // grid (BMS info, 2.0.35): the ordinary tiles are still pictures — they live in the card's cached background and
  // only the number badges' glow wave and the MAX / MIN tiles are drawn on every frame
  staticKey(b) {
    const d = this.d;
    if (this.mode !== 1 || !(d && d.valid && d.cellCount > 0)) return "";
    const n = d.cellCount;
    return [b.width, n, this.shownMax, this.shownMin, d.deltaV > 0.002, cellVmin(d), cellVmax(d), this.hasR(), d.avgV.toFixed(4),
      d.cellV.slice(0, n).map((v) => v.toFixed(3)).join(","), this.hasR() ? d.cellR.slice(0, n).map((r) => (r || 0).toFixed(4)).join(",") : "",
      C.TEXT, C.STROKE, C.GREEN, C.CYAN, C.SUB, C.PURPLE, tone("#111A2E")].join("|");
  }
  drawStatic(ctx, b) {
    const d = this.d;
    if (this.mode === 1 && d && d.valid && d.cellCount > 0) this.grid(ctx, b, d.cellCount, "static");
  }
  // a cell's range by chemistry, [empty, full] in volts: LFP 2.40–3.65, NMC 3.20–4.20, LTO 1.50–2.80 (1.0.15)
  static RANGE = [[2.4, 3.65], [3.2, 4.2], [1.5, 2.8]];
  chemRange() { const d = this.d; return this.chemScale && d ? CellsView.RANGE[d.battType] || null : null; }
  // colour by where the voltage sits in that range: red near empty → amber → green → cyan near full → purple at the
  // top, red again above full
  static voltColor(v, lo, hi) {
    const f = (v - lo) / (hi - lo);
    if (f > 1.0) return C.RED;
    if (f < 0.05) return C.RED;
    if (f < 0.2) return mix(C.RED, C.AMBER, (f - 0.05) / 0.15);
    if (f < 0.4) return mix(C.AMBER, C.GREEN, (f - 0.2) / 0.2);
    if (f < 0.85) return mix(C.GREEN, C.CYAN, (f - 0.4) / 0.45);
    return mix(C.CYAN, C.PURPLE, (f - 0.85) / 0.15);
  }
  colorFor(i, v) {
    const d = this.d;
    if (v < 0.5) return C.RED;
    const cr = this.chemRange();
    if (cr) return CellsView.voltColor(v, cr[0], cr[1]);
    if (i === this.shownMax && d.deltaV > 0.002) return C.AMBER;
    if (i === this.shownMin && d.deltaV > 0.002) return C.BLUE;
    return mix(C.GREEN, C.CYAN, Math.min(1, Math.abs(v - d.avgV) / 0.01));
  }
  autoScale() {
    const d = this.d, cr = this.autoRange ? null : this.chemRange();
    if (this.autoRange) {  // around the cells: a window 6× their spread (at least 90 mV)
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < d.cellCount; k++) { const v = d.cellV[k]; if (v > 0.5) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
      if (!(hi >= lo)) { lo = 3.25; hi = 3.3; }
      const win = Math.max(6 * (hi - lo), 0.090), mid = (lo + hi) / 2;  // at least 90 mV tall: 6 mV ≈ 7 % of the bar
      // where the cells sit in the chemistry's range sets how high they stand (LFP 3.50 V of 2.40–3.65 → ~88 %);
      // unknown chemistry: 60 %
      const cr = this.chemRange(), p = cr ? Math.min(0.88, Math.max(0.15, (mid - cr[0]) / (cr[1] - cr[0]))) : 0.6;
      this.tLo = mid - p * win; this.tHi = this.tLo + win;
      if (this.sLo < 0) { this.sLo = this.tLo; this.sHi = this.tHi; }
      const t = this.t(), k = fx.level === "off" ? 1 : 1 - Math.exp(-Math.min(1, Math.max(0, t - (this._st ?? t))) * 4); this._st = t;
      this.sLo += (this.tLo - this.sLo) * k; this.sHi += (this.tHi - this.sHi) * k;
      return;
    }
    if (cr) {  // fixed: empty … full of the chemistry
      this.tLo = cr[0]; this.tHi = cr[1];
      if (this.sLo < 0) { this.sLo = this.tLo; this.sHi = this.tHi; }
      this.sLo += (this.tLo - this.sLo) * ease(0.08); this.sHi += (this.tHi - this.sHi) * ease(0.08);
      return;
    }
    let lo = d.minV, hi = d.maxV;
    if (!(lo > 0.2 && hi >= lo)) { lo = 3.25; hi = 3.3; }
    const mid = (lo + hi) / 2, span = hi - lo;
    if (span < 0.03) {
      if (this.tLo <= 0 || Math.abs(this.tHi - this.tLo - 0.12) >= 5e-4 || lo < this.tLo + 0.024 || hi > this.tHi - 0.024) { this.tLo = mid - 0.066; this.tHi = mid + 0.054; }
    } else { const s = span * 4; this.tLo = mid - 0.55 * s; this.tHi = mid + 0.45 * s; }
    if (this.sLo < 0) { this.sLo = this.tLo; this.sHi = this.tHi; }
    this.sLo += (this.tLo - this.sLo) * ease(0.08);
    this.sHi += (this.tHi - this.sHi) * ease(0.08);
  }
  bars(ctx, b, n) {
    const d = this.d, x0 = b.left + 14, x1 = b.right - 14, y0 = b.top + 44 + (this.statsY ? 14 : 0), y1 = b.bottom - 26;
    const gap = n > 20 ? 2 : 4, bw = (x1 - x0 - (n - 1) * gap) / n;
    this.autoScale();
    const lo = this.sLo, hi = this.sHi, t = this.t(), pulse = Math.sin(3.2 * t) * 0.5 + 0.5;
    // fancy (1.0.16): heights follow by time, not by frame, so a slow frame rate cannot leave them behind the data
    const dt = Math.min(1, Math.max(0, t - (this._lt ?? t))); this._lt = t;
    const kH = this.fancy ? (fx.level === "off" ? 1 : 1 - Math.exp(-dt * 7)) : ease(0.15);
    this._bars = { x0, x1, y0, y1, bw, gap, n };
    const ta = this.tipAlpha();
    for (let i = 0; i < n; i++) {
      const v = d.cellV[i], x = x0 + (bw + gap) * i;
      const f = Math.max(0.03, Math.min(1, (v - lo) / (hi - lo)));
      const e = clamp01((t - this.enterT - i * 0.035) / 0.6);
      this.shownH[i] += (f * easeOutBack(e) - this.shownH[i]) * kH;
      const hgt = (y1 - y0) * Math.max(0.03, this.shownH[i]);
      ctx.fillStyle = i === this.tip && ta > 0 ? mix(tone("#121C31"), tone("#24365A"), ta) : tone("#121C31");
      roundRect(ctx, x, y0, bw, y1 - y0, bw / 3); ctx.fill();
      const col = this.colorFor(i, v), top = y1 - hgt;
      this.tops[i] = top;
      const hl = d.deltaV > 0.002 ? (i === this.shownMax ? C.AMBER : i === this.shownMin ? C.BLUE : null) : null;
      if (hl && this.fancy) {  // MAX / MIN: a strong pulsing halo and a glowing rim
        const hp = calm() ? 0.7 : pulse;
        const g = ctx.createLinearGradient(0, top - 16, 0, y1); g.addColorStop(0, alpha(hl, 110 * hp + 70)); g.addColorStop(1, alpha(hl, 20));
        ctx.fillStyle = g; roundRect(ctx, x - 5, top - 12, bw + 10, y1 - top + 12, bw / 2); ctx.fill();
        for (let k = 4; k >= 1; k--) {
          ctx.strokeStyle = alpha(hl, (30 + 70 * hp) * ((5 - k) / 4) ** 1.3); ctx.lineWidth = k * 2.2 + hp * 2;
          roundRect(ctx, x, top, bw, hgt, bw / 3); ctx.stroke();
        }
      } else if (hl) {
        const hc = this.chemRange() ? hl : col;  // MAX / MIN halo
        const g = ctx.createLinearGradient(0, top - 10, 0, y1); g.addColorStop(0, alpha(hc, 60 * pulse + 40)); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; roundRect(ctx, x - 3, top - 8, bw + 6, y1 - top + 8, bw / 2); ctx.fill();
      }
      const g = ctx.createLinearGradient(0, top, 0, y1); g.addColorStop(0, col); g.addColorStop(1, alpha(col, 70));
      ctx.fillStyle = g; roundRect(ctx, x, top, bw, hgt, bw / 3); ctx.fill();
      if (this.fancy) this.liquid(ctx, x, top, bw, hgt, y1, i, t, col, hl);
      else {
        ctx.fillStyle = alpha(C.TEXT, (Math.sin(2.4 * t - i * 0.45) * 0.5 + 0.5) * 70 + 30);
        roundRect(ctx, x + 0.2 * bw, top + 3, 0.6 * bw, 2.5, 2); ctx.fill();
      }
      if (i === this.tip && ta > 0) {
        ctx.strokeStyle = alpha(C.TEXT, 210 * ta); ctx.lineWidth = 1.5;
        roundRect(ctx, x - 1.5, top - 1.5, bw + 3, hgt + 3, bw / 3 + 1.5); ctx.stroke();
      }
      const tipped = i === this.tip && ta > 0;
      const hlN = this.fancy && hl;
      if (n <= 24 || i % 2 === 0 || tipped || hlN) text(ctx, String(i + 1), x + bw / 2, y1 + 14, { size: 9.5, weight: tipped || hlN ? 700 : 500, color: tipped ? C.TEXT : hlN ? hl : C.SUB, align: "center" });
    }
    this.avgLine(ctx, x0, x1, y0, y1, lo, hi, t);
    if (this.fancy && d.deltaV > 0.002 && ta <= 0) {  // floating MAX / MIN tags over their bars
      [[this.shownMax, C.AMBER, "MAX"], [this.shownMin, C.BLUE, "MIN"]].forEach(([i, hl, lab], k) => {
        if (i < 0 || i >= n) return;
        const cx = x0 + (bw + gap) * i + bw / 2, bob = calm() ? 0 : Math.sin(t * 2.6 + k * Math.PI) * 2;
        const w = measure(ctx, lab, 8.5, 700, "Chakra Petch") + 10, h = 14;
        const py = Math.max(y0 - 18, this.tops[i] - 14 - h + bob), px = Math.max(b.left + 4, Math.min(b.right - 4 - w, cx - w / 2));
        ctx.fillStyle = alpha(hl, 60); roundRect(ctx, px - 2, py - 2, w + 4, h + 4, 9); ctx.fill();
        ctx.fillStyle = tone("#0A1222"); roundRect(ctx, px, py, w, h, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 4, py + h - 0.5); ctx.lineTo(cx, py + h + 4); ctx.lineTo(cx + 4, py + h - 0.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hl; ctx.lineWidth = 1.2; roundRect(ctx, px + 0.5, py + 0.5, w - 1, h - 1, 6.5); ctx.stroke();
        text(ctx, lab, px + w / 2, py + 10.2, { size: 8.5, weight: 700, family: "Chakra Petch", color: hl, align: "center" });
      });
    }
    if (this.sweep) {
      const sx = x0 + (x1 - x0 + 80) * ((t * 0.35) % 1) - 40;
      const g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, alpha(C.TEXT, 40)); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(Math.max(x0, sx - 40), y0, Math.max(0, Math.min(x1, sx + 40) - Math.max(x0, sx - 40)), y1 - y0);
    }
    if (this.tip >= 0 && this.tip < n && ta > 0) this.drawTip(ctx, b, this.tip, x0 + (bw + gap) * this.tip + bw / 2, this.tops[this.tip], ta);
  }
  // liquid bar (1.0.16): flow bands moving up while charging / down while discharging, bubbles rising, a moving wave
  // on the top. Reduced motion: only the wave line, still.
  liquid(ctx, x, top, bw, hgt, y1, i, t, col, hl) {
    const d = this.d, still = calm();
    const dir = d.current > 0.15 ? -1 : d.current < -0.15 ? 1 : 0;
    const speed = dir ? 10 + 30 * Math.min(1, Math.abs(d.current) / Math.max(10, d.maxChgA || 100)) : 0;
    ctx.save();
    roundRect(ctx, x, top, bw, hgt, bw / 3); ctx.clip();
    if (!still && hgt > 8) {
      if (dir) {  // diagonal light bands
        const per = 22, off = ((t * speed * dir) % per + per) % per;
        ctx.fillStyle = alpha(C.TEXT, 22);
        for (let yy = top - per + off; yy < y1 + per; yy += per) {
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + bw, yy - 7); ctx.lineTo(x + bw, yy - 1); ctx.lineTo(x, yy + 6); ctx.closePath(); ctx.fill();
        }
      }
      for (let k = 0; k < 3; k++) {  // bubbles
        const h1 = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453, r0 = h1 - Math.floor(h1);
        const ph = (t * (0.18 + 0.12 * r0) + r0 + k / 3) % 1;
        const by = y1 - ph * hgt, bx = x + bw * (0.25 + 0.5 * ((r0 * 7) % 1)) + Math.sin(t * 2 + k + i) * bw * 0.08;
        ctx.fillStyle = alpha(C.TEXT, Math.sin(ph * Math.PI) * 110);
        ctx.beginPath(); ctx.arc(bx, by, Math.max(0.8, bw * 0.05) * (1 + r0), 0, Math.PI * 2); ctx.fill();
      }
    }
    // wave on the top surface
    const amp = still ? 0 : Math.min(1.6, hgt / 10), ph0 = t * 3 + i * 0.7;
    ctx.beginPath();
    for (let s = 0; s <= 8; s++) { const xx = x + (bw * s) / 8, yy = top + 3 + Math.sin(ph0 + (s / 8) * Math.PI * 2) * amp; s ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.lineTo(x + bw, top - 4); ctx.lineTo(x, top - 4); ctx.closePath();
    ctx.fillStyle = alpha(mix(col, C.TEXT, 0.55), 120); ctx.fill();
    ctx.restore();
    if (hl) {  // bright cap on MAX / MIN
      ctx.fillStyle = alpha(mix(hl, C.TEXT, 0.4), 230); roundRect(ctx, x + 0.15 * bw, top + 1.5, 0.7 * bw, 2.5, 1.5); ctx.fill();
    }
  }
  // cell number in a small framed badge (2.0.28, was "#01"): the theme's accent colour — or the MAX / MIN tile's —
  // with a glow wave running across the grid cell by cell
  numBadge(ctx, x, y, i, hl, t) {
    const s = String(i + 1), base = hl || C.CYAN, hgt = 15;
    const w = Math.max(19, measure(ctx, s, 10, 700, "Chakra Petch") + 11);
    const wave = calm() ? 0.6 : Math.pow(Math.sin(t * 2.6 - i * 0.55) * 0.5 + 0.5, 2);
    ctx.fillStyle = alpha(base, 22 + 26 * wave); roundRect(ctx, x, y, w, hgt, 5); ctx.fill();
    // the glow follows the wave in 10 steps, each a cached sprite (2.0.35, was a blur per badge per frame)
    if (fx.level === "full") {
      const q = Math.round(wave * 9), wq = q / 9;
      this.sprite(`bdg${base}${w}${q}`).free(`${base}|${w}|${q}`, w / 2 + 1, 12, this.dpr, alpha(base, 230), 2 + 8 * wq, (c) => {
        c.strokeStyle = alpha(base, 95 + 150 * wq); c.lineWidth = 1.1; roundRect(c, -w / 2 + 0.5, -hgt / 2 + 0.5, w - 1, hgt - 1, 4.5); c.stroke();
      }).putAt(ctx, x + w / 2, y + hgt / 2);
    }
    ctx.strokeStyle = alpha(base, 95 + 150 * wave); ctx.lineWidth = 1.1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, hgt - 1, 4.5); ctx.stroke();
    text(ctx, s, x + w / 2, y + 11, { size: 10, weight: 700, family: "Chakra Petch", color: mix(base, C.TEXT, 0.35 + 0.4 * wave), align: "center" });
  }
  // the pack's average cell voltage across the bars (2.0.28): a glowing dashed line drifting slowly, "AVG" at its end
  avgLine(ctx, x0, x1, y0, y1, lo, hi, t) {
    const d = this.d;
    if (!(d.avgV > 0) || !(hi > lo)) return;
    const f = clamp01((d.avgV - lo) / (hi - lo)), e = clamp01((t - this.enterT - 0.4) / 0.6);
    if (e <= 0) return;
    const y = Math.round(y1 - (y1 - y0) * f) + 0.5, col = mix(C.TEXT, C.CYAN, 0.25);
    const xe = x0 + (x1 - x0) * easeOut(e);
    ctx.save();
    ctx.globalAlpha = e;
    // glow of the dashed line ≈ a cached glow of a solid one at the dashes' share of the length (2.0.35)
    if (fx.level === "full") this.glowShape(ctx, "avg", `${x0},${xe.toFixed(1)},${y},${col}`, [x0 - 4, y - 1, xe - x0 + 4, 2], alpha(C.CYAN, 200), 6, (c) => line(c, x0 - 4, y, xe, y, alpha(col, 200), 1.3, "butt"), 6 / 11);
    ctx.setLineDash([6, 5]); ctx.lineDashOffset = calm() ? 0 : -((t * 14) % 11);
    line(ctx, x0 - 4, y, xe, y, alpha(col, 200), 1.3, "butt");
    ctx.setLineDash([]);
    const lab = "AVG", lw = measure(ctx, lab, 8.5, 700, "Chakra Petch") + 10;
    ctx.fillStyle = alpha(tone("#0A1222"), 215); roundRect(ctx, x1 - lw + 4, y - 7, lw, 14, 7); ctx.fill();
    ctx.strokeStyle = alpha(col, 170); ctx.lineWidth = 1; roundRect(ctx, x1 - lw + 4.5, y - 6.5, lw - 1, 13, 6.5); ctx.stroke();
    text(ctx, lab, x1 - lw / 2 + 4, y + 3.2, { size: 8.5, weight: 700, family: "Chakra Petch", color: col, align: "center" });
    ctx.restore();
  }
  grid(ctx, b, n, pass) {
    const d = this.d, cols = CellsView.cols(n, b.width), x0 = b.left + 12, x1 = b.right - 12, y0 = b.top + 42, gap = 8;
    const withR = this.hasR(), cw = (x1 - x0 - (cols - 1) * gap) / cols, ch = this.tileH(), t = this.t();
    const rCol = mix(C.SUB, C.PURPLE, 0.35);
    // MIN / MAX tiles glow and blink together (~1.2 s): a soft halo made of stacked strokes (shadowBlur is slow on
    // phones) drawn under the tile, a brighter border and a faint tint. Reduced motion: a steady glow.
    const blink = calm() ? 0.75 : Math.pow(Math.sin(t * 5.2) * 0.5 + 0.5, 1.6);
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const isMax = i === this.shownMax && d.deltaV > 0.002, isMin = i === this.shownMin && d.deltaV > 0.002;
      const hl = isMax ? C.AMBER : isMin ? C.BLUE : null;
      if (pass === "static" && hl) continue;                                       // MAX / MIN blink: every frame
      if (pass === "live" && !hl) { this.numBadge(ctx, x + 7, y + 6, i, hl, t); continue; }  // the rest is cached
      if (hl) {
        for (let k = 5; k >= 1; k--) {  // widest + faintest first, ~7 px outside the tile at full blink
          ctx.strokeStyle = alpha(hl, (18 + 62 * blink) * ((6 - k) / 5) ** 1.3); ctx.lineWidth = k * 2.4 + blink * 2.4;
          roundRect(ctx, x, y, cw, ch, 10); ctx.stroke();
        }
      }
      ctx.fillStyle = hl ? mix(tone("#111A2E"), hl, 0.05 + 0.09 * blink) : tone("#111A2E"); roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = hl ? alpha(hl, 120 + 135 * blink) : C.STROKE; ctx.lineWidth = hl ? 1.6 : 1;
      roundRect(ctx, x + 0.5, y + 0.5, cw - 1, ch - 1, 10); ctx.stroke();
      if (pass !== "static") this.numBadge(ctx, x + 7, y + 6, i, hl, t);
      const bx0 = x + 8, bx1 = x + cw - 8, by = y + ch - 12;
      ctx.fillStyle = tone("#1B2741"); roundRect(ctx, bx0, by, bx1 - bx0, 4, 2); ctx.fill();
      const v = d.cellV[i];
      text(ctx, fmt(v, 3), x + cw / 2, y + 37, { size: 13, weight: 600, family: "Chakra Petch", color: isMax ? C.AMBER : isMin ? C.ICE : C.TEXT, align: "center" });
      const r = withR ? d.cellR[i] || 0 : 0;
      if (r > 0) {
        // e.g. "61mΩ" under the voltage — the bundled fonts have no Ω, so the unit is drawn separately in Kanit
        const rs = fmt(r * 1000, 0), w1 = measure(ctx, rs, 11, 600, "Chakra Petch"), w2 = measure(ctx, "mΩ", 9.5, 500);
        const sx = x + cw / 2 - (w1 + 1 + w2) / 2;
        text(ctx, rs, sx, y + 53, { size: 11, weight: 600, family: "Chakra Petch", color: rCol });
        text(ctx, "mΩ", sx + w1 + 1, y + 53, { size: 9.5, weight: 500, color: rCol });
      }
      const f = Math.max(0, Math.min(1, (v - cellVmin(d)) / (cellVmax(d) - cellVmin(d)))), col = this.colorFor(i, v);
      const g = ctx.createLinearGradient(bx0, 0, bx1, 0); g.addColorStop(0, alpha(col, 120)); g.addColorStop(1, col);
      ctx.fillStyle = g; roundRect(ctx, bx0, by, (bx1 - bx0) * f, 4, 2); ctx.fill();
      if (isMax || isMin) {
        ctx.fillStyle = mix(isMax ? C.AMBER : C.BLUE, C.TEXT, 0.18 * blink); roundRect(ctx, x + cw - 32, y + 6, 26, 12, 6); ctx.fill();
        text(ctx, isMax ? "MAX" : "MIN", x + cw - 19, y + 14.8, { size: 8.5, weight: 600, color: C.BG, align: "center" });
        if (d.balanceAction) {
          const sx = x + cw * ((t * 1.4) % 1), g2 = ctx.createLinearGradient(sx - 20, 0, sx + 20, 0);
          g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(0.5, alpha(C.TEXT, 50)); g2.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g2; roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
export class StatusView extends CanvasCard {
  // 2.0.29: bigger state tiles — icon in a ring, name + what it is doing, glowing border, a light sweep, moving stripes
  // while energy flows, an LED with a ripple · a live summary chip in the header · alarm rows with a glowing edge
  constructor(withAlarms) {
    super(withAlarms ? 160 : 114, { cls: "w-status" });
    this.withAlarms = withAlarms; this.d = null; this.alarms = [];
  }
  set(d) {
    this.d = d;
    this.alarms = alarmList(d || {});
    if (this.withAlarms) this.setHeight(122 + 38 * Math.max(1, this.alarms.length));
    this.invalidate();
  }
  draw(ctx, b) {
    const d = this.d, z = !!(d && d.valid), real = this.alarms.filter((a) => !a.info), t = this.t(), still = calm();
    const live = z && !d.stale;
    this.accent = z && real.length ? C.RED : C.GREEN;
    const title = this.withAlarms ? L.t("สถานะ & การแจ้งเตือน", "Status & Alarms") : L.t("สถานะการทำงาน", "Operating Status");
    text(ctx, title, b.left + 16, b.top + 26, { size: 14, weight: 600 });
    // header chip: all good / N alarms / no data
    const chipTxt = !z ? "--" : real.length ? L.t(`แจ้งเตือน ${real.length}`, `${real.length} alarm${real.length > 1 ? "s" : ""}`) : d.stale ? L.t("ออฟไลน์", "Offline") : L.t("ปกติ", "Normal");
    const chipCol = !z || d.stale ? C.SUB : real.length ? C.RED : C.GREEN;
    const room = b.width - 32 - measure(ctx, title, 14, 600) - 12;
    if (room > 60) this.chip(ctx, b.right - 14, b.top + 13, chipTxt, chipCol, t, !!(z && !d.stale), real.length > 0);
    // the three states
    const ch = live && isCharging(d), dc = live && isDischarging(d), ba = live && d.balanceAction !== 0;
    const on = [z && d.chg, z && d.dsg, z && (d.bal || d.balanceAction !== 0)];
    const flow = [ch && on[0], dc && on[1], ba];
    const gap = 8, w = (b.width - 24 - 2 * gap) / 3, y = b.top + 42, hgt = 52, narrow = w < 104;
    const names = [L.t("ชาร์จ", "CHG"), L.t("จ่ายไฟ", "DSG"), L.t("บาลานซ์", "BAL")];
    // what it is doing — the long words when all three fit their tiles, else "active"
    let doing = [L.t("กำลังชาร์จ", "Charging"), L.t("กำลังจ่าย", "Discharging"), L.t("กำลังบาลานซ์", "Balancing")];
    const g = StatusView.geo(narrow, w < 96);
    if (!doing.every((s, i) => 2 * g.r + g.ig + Math.max(measure(ctx, names[i], g.ns, 600), measure(ctx, s, g.ss, 500)) <= w - 24)) doing = doing.map(() => L.t("ทำงาน", "Active"));
    const states = [0, 1, 2].map((i) => (!z ? "--" : flow[i] ? doing[i] : on[i] ? L.t("เปิด", "On") : L.t("ปิด", "Off")));
    [["plug", C.GREEN], ["home", C.AMBER], ["balance", C.PURPLE]].forEach(([icon, col], i) =>
      this.tile(ctx, b.left + 12 + i * (w + gap), y, w, hgt, icon, col, names[i], states[i], on[i], flow[i], t, i, narrow, still));
    if (!this.withAlarms) return;
    const ay = y + hgt + 14;
    if (!z) { text(ctx, L.t("ไม่มีข้อมูล", "No data"), b.left + 16, ay + 20, { size: 12, weight: 500, color: C.SUB }); return; }
    if (!this.alarms.length) { this.okBar(ctx, b.left + 12, ay, b.width - 24, 32, t, still); return; }
    this.alarms.forEach((a, i) => this.alarmRow(ctx, b.left + 12, ay + i * 38, b.width - 24, 32, a, t, i, still));
  }
  chip(ctx, xr, y, s, col, t, liveDot, blink) {
    const w = measure(ctx, s, 11, 600) + 28, x = xr - w, p = Math.sin(t * (blink ? 6 : 3)) * 0.5 + 0.5;
    ctx.fillStyle = alpha(col, 30); roundRect(ctx, x, y, w, 22, 11); ctx.fill();
    ctx.strokeStyle = alpha(col, 90 + 90 * p); ctx.lineWidth = 1; roundRect(ctx, x + 0.5, y + 0.5, w - 1, 21, 10.5); ctx.stroke();
    dot(ctx, x + 11, y + 11, 3, alpha(col, liveDot ? 150 + 105 * p : 160));
    if (liveDot && !calm()) { const r = (t * 0.9) % 1; strokeCircle(ctx, x + 11, y + 11, 3 + 4 * r, alpha(col, (1 - r) * 200), 1.1); }
    text(ctx, s, x + 19, y + 15.5, { size: 11, weight: 600, color: col });
  }
  // ring radius, gap ring → text, name / state size, side margin — by tile width (narrow < 104 px, tiny < 96 px)
  static geo(narrow, tiny) { return tiny ? { r: 9.5, ig: 5, ns: 12, ss: 10, m: 6 } : narrow ? { r: 11, ig: 7, ns: 12, ss: 10, m: 8 } : { r: 14, ig: 10, ns: 13, ss: 10.5, m: 8 }; }
  tile(ctx, x, y, w, h, icon, col, name, state, on, flow, t, i, narrow, still) {
    const p = still ? 0.6 : Math.sin(t * 3 + i * 1.3) * 0.5 + 0.5, full = fx.level === "full";
    // glow outside the tile — at "full" a cached glow breathing in opacity (2.0.35, was a 10–18 px blur every frame)
    const tfill = (c) => { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, alpha(col, 78)); g.addColorStop(1, alpha(col, 20)); return g; };
    if (on) {
      if (full) this.glowShape(ctx, "tile" + i, `${x},${y},${w},${h},${col}`, [x, y, w, h], alpha(col, 210), 14, (c) => { c.fillStyle = tfill(c); roundRect(c, x, y, w, h, 14); c.fill(); }, (120 + 90 * p) / 210);
      else { ctx.strokeStyle = alpha(col, 40); ctx.lineWidth = 6; roundRect(ctx, x, y, w, h, 14); ctx.stroke(); }
    }
    ctx.fillStyle = on ? tfill(ctx) : tone("#111C2D"); roundRect(ctx, x, y, w, h, 14); ctx.fill();
    // inside: stripes running while energy flows, a light sweep every few seconds
    if (on && !still) {
      ctx.save(); roundRect(ctx, x, y, w, h, 14); ctx.clip();
      if (flow) {
        const off = (t * 22) % 16;
        ctx.strokeStyle = alpha(col, 30); ctx.lineWidth = 5;
        ctx.beginPath();
        for (let k = -h; k < w + h; k += 16) { ctx.moveTo(x + k + off, y + h); ctx.lineTo(x + k + off + h, y); }
        ctx.stroke();
      }
      const f = ((t + i * 0.9) % 3.6) / 1.4;
      if (f < 1) {
        const sx = x - 40 + (w + 80) * easeOut(f), g = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
        g.addColorStop(0, alpha(C.TEXT, 0)); g.addColorStop(0.5, alpha(C.TEXT, 46)); g.addColorStop(1, alpha(C.TEXT, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    }
    ctx.strokeStyle = on ? alpha(col, 140 + 115 * p) : C.STROKE; ctx.lineWidth = on ? 1.5 : 1.1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 13.5); ctx.stroke();
    // icon in a ring + name / state, centred as a group
    const { r, ig, ns, ss, m } = StatusView.geo(narrow, w < 96);
    const tw = Math.max(measure(ctx, name, ns, 600), measure(ctx, state, ss, 500));
    const gw = 2 * r + ig + tw, gx = x + Math.max(m, (w - gw) / 2 - (narrow ? 0 : 4)), cy = y + h / 2;
    const icx = gx + r;
    if (on) {
      dot(ctx, icx, cy, r, alpha(col, 55));
      if (flow && !still) { const q = (t * 0.8 + i * 0.3) % 1; strokeCircle(ctx, icx, cy, r + 7 * q, alpha(col, (1 - q) * 200), 1.4); }
      if (full) this.glowShape(ctx, "ring" + i, `${icx},${cy},${r},${col}`, [icx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2], col, 8, (c) => strokeCircle(c, icx, cy, r, alpha(col, 230), 1.4));
      strokeCircle(ctx, icx, cy, r, alpha(col, 230), 1.4);
    } else { dot(ctx, icx, cy, r, tone("#16223A")); strokeCircle(ctx, icx, cy, r, alpha(C.DIM, 160), 1); }
    drawIcon(ctx, icon, icx, cy, r < 10 ? 12 : narrow ? 13 : 15, on ? mix(col, C.TEXT, 0.25) : C.DIM, 2);
    const tx = gx + 2 * r + ig, room = x + w - m - tx;
    text(ctx, fit(ctx, name, room, ns, 600), tx, cy - 2, { size: ns, weight: 600, color: on ? C.TEXT : C.SUB });
    text(ctx, fit(ctx, state, room, ss, 500), tx, cy + 13, { size: ss, weight: 500, color: on ? mix(col, C.TEXT, 0.3) : C.DIM });
    // LED, top right
    const lx = x + w - 9, ly = y + 9;
    dot(ctx, lx, ly, 2.6, on ? alpha(col, 150 + 105 * p) : alpha(C.DIM, 200));
    if (flow && !still) { const q = (t * 1.1 + i * 0.25) % 1; strokeCircle(ctx, lx, ly, 2.6 + 5 * q, alpha(col, (1 - q) * 190), 1); }
  }
  okBar(ctx, x, y, w, h, t, still) {
    const col = C.GREEN, p = still ? 0.6 : Math.sin(t * 2.4) * 0.5 + 0.5;
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, alpha(col, 46)); g.addColorStop(1, alpha(col, 12));
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 11); ctx.fill();
    ctx.strokeStyle = alpha(col, 70 + 60 * p); ctx.lineWidth = 1; roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10.5); ctx.stroke();
    if (!still) {
      const f = (t % 4.2) / 1.6;
      if (f < 1) {
        ctx.save(); roundRect(ctx, x, y, w, h, 11); ctx.clip();
        const sx = x - 50 + (w + 100) * easeOut(f), sg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
        sg.addColorStop(0, alpha(C.TEXT, 0)); sg.addColorStop(0.5, alpha(C.TEXT, 40)); sg.addColorStop(1, alpha(C.TEXT, 0));
        ctx.fillStyle = sg; ctx.fillRect(x, y, w, h); ctx.restore();
      }
      const q = (t * 0.6) % 1; strokeCircle(ctx, x + 19, y + h / 2, 9 + 7 * q, alpha(col, (1 - q) * 150), 1.2);
    }
    if (fx.level === "full") this.glowShape(ctx, "shield", `${x},${y},${h},${col}`, [x + 11, y + h / 2 - 8, 16, 16], col, 9, (c) => drawIcon(c, "shield", x + 19, y + h / 2, 16, col, 1.8), 0.6 + 0.4 * p);
    drawIcon(ctx, "shield", x + 19, y + h / 2, 16, col, 1.8);
    text(ctx, fit(ctx, L.t("ระบบปกติ — ไม่มีการแจ้งเตือน", "All good — no active alarms"), w - 46, 12.5, 600), x + 36, y + h / 2 + 4.5, { size: 12.5, weight: 600, color: col });
  }
  alarmRow(ctx, x, y, w, h, a, t, i, still) {
    const col = a.info ? C.GREEN : C.RED, p = still ? 0.7 : Math.sin(t * (a.info ? 2.4 : 5) + i) * 0.5 + 0.5;
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, alpha(col, 58)); g.addColorStop(1, alpha(col, 10));
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 11); ctx.fill();
    ctx.strokeStyle = alpha(col, 60 + 90 * p); ctx.lineWidth = 1; roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10.5); ctx.stroke();
    // glowing edge on the left
    if (fx.level === "full") this.glowShape(ctx, "edge" + i, `${x},${y},${h},${col}`, [x + 4, y + 6, 3, h - 12], col, 10, (c) => { c.fillStyle = col; roundRect(c, x + 4, y + 6, 3, h - 12, 1.5); c.fill(); }, (160 + 95 * p) / 255);
    ctx.fillStyle = alpha(col, 160 + 95 * p); roundRect(ctx, x + 4, y + 6, 3, h - 12, 1.5); ctx.fill();
    if (!still && !a.info) {
      const f = ((t + i * 0.7) % 2.8) / 1.2;
      if (f < 1) {
        ctx.save(); roundRect(ctx, x, y, w, h, 11); ctx.clip();
        const sx = x + (w + 60) * easeOut(f) - 30, sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
        sg.addColorStop(0, alpha(col, 0)); sg.addColorStop(0.5, alpha(col, 60)); sg.addColorStop(1, alpha(col, 0));
        ctx.fillStyle = sg; ctx.fillRect(x, y, w, h); ctx.restore();
      }
    }
    // warning triangle (alarm) or a dot (information)
    const ix = x + 22, iy = y + h / 2;
    if (a.info) dot(ctx, ix, iy, 4, alpha(col, 140 + 115 * p));
    else {
      ctx.fillStyle = alpha(col, 170 + 85 * p); ctx.beginPath(); ctx.moveTo(ix, iy - 7); ctx.lineTo(ix + 7.5, iy + 6); ctx.lineTo(ix - 7.5, iy + 6); ctx.closePath(); ctx.fill();
      text(ctx, "!", ix, iy + 4.6, { size: 9.5, weight: 700, family: "Chakra Petch", color: C.BG, align: "center" });
    }
    text(ctx, fit(ctx, a.label, w - 46, 12.5, 500), x + 36, y + h / 2 + 4.5, { size: 12.5, weight: 500, color: a.info ? C.GREEN : C.ALARM_TX });
  }
}

// ---------------------------------------------------------------------------
// Real-time chart: newest sample on the right, 180 slots (ChartView.java)
export class ChartView extends CanvasCard {
  constructor(title, unit, dec, color, symmetric, spanLabel) {
    super(196, { cls: "w-chart", accent: color });
    this.title = title; this.unit = unit; this.dec = dec; this.color = color; this.symmetric = symmetric;
    this.data = []; this.max = 180; this.spanLabel = spanLabel;
  }
  push(v) {
    if (v == null || !isFinite(v)) return;
    this.data.push(v);
    if (this.data.length > this.max) this.data.shift();
    this.invalidate();
  }
  clear() { this.data = []; this.invalidate(); }
  setColor(c) { this.color = c; }
  draw(ctx, b) {
    this.accent = this.color;
    const n = this.data.length;
    text(ctx, this.title, b.left + 16, b.top + 26, { size: 14, weight: 600 });
    text(ctx, n ? `${fmt(this.data[n - 1], this.dec)} ${this.unit}` : "--", b.right - 16, b.top + 26, { size: 14, weight: 600, family: "Chakra Petch", color: this.color, align: "right" });
    const x0 = b.left + 40, x1 = b.right - 14, y0 = b.top + 44, y1 = b.bottom - 22;
    let lo = n ? Math.min(...this.data) : 0, hi = n ? Math.max(...this.data) : 1;
    if (this.symmetric) { hi = Math.max(Math.abs(lo), Math.abs(hi), 1); lo = -hi; }
    if (hi - lo < 0.001) { const m = Math.max(1, Math.abs(hi) * 0.05) / 2; lo -= m; hi += m; }
    const pad = (hi - lo) * 0.08, top = hi + pad, bot = lo - pad, span = top - bot;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + ((y1 - y0) * i) / 4;
      line(ctx, x0, y + 0.5, x1, y + 0.5, tone("#18233B"), 1, "butt");
      text(ctx, fmt(top - (i * span) / 4, Math.abs(span) < 2 ? 2 : 0), b.left + 8, y + 3, { size: 9.5, color: C.DIM });
    }
    if (bot < 0 && top > 0) {
      const y = y0 + (y1 - y0) * (top / span);
      ctx.setLineDash([4, 4]); line(ctx, x0, y, x1, y, tone("#2A3A5C"), 1, "butt"); ctx.setLineDash([]);
    }
    text(ctx, this.spanLabel ? this.spanLabel() : L.t("-15 นาที", "-15 min"), x0, b.bottom - 7, { size: 9.5, color: C.DIM });
    text(ctx, L.t("ตอนนี้", "now"), x1, b.bottom - 7, { size: 9.5, color: C.DIM, align: "right" });
    if (n < 2) return;
    const start = Math.floor((n - 1) * (1 - easeOut((this.t() - this.enterT) / 1.1)));
    const X = (i) => x1 - ((n - 1 - i) * (x1 - x0)) / (this.max - 1), Y = (v) => y0 + ((top - v) * (y1 - y0)) / span;
    ctx.beginPath();
    let fx = 0, lx = 0, ly = 0;
    for (let i = start; i < n; i++) {
      const x = X(i), y = Y(this.data[i]);
      if (i === start) { ctx.moveTo(x, y); fx = x; }
      else { const mx = (X(i - 1) + x) / 2; ctx.bezierCurveTo(mx, Y(this.data[i - 1]), mx, y, x, y); }
      lx = x; ly = y;
    }
    ctx.save(); ctx.shadowColor = alpha(this.color, 160); ctx.shadowBlur = 6;
    ctx.strokeStyle = this.color; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
    ctx.lineTo(lx, y1); ctx.lineTo(fx, y1); ctx.closePath();
    const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, alpha(this.color, 90)); g.addColorStop(1, alpha(this.color, 0));
    ctx.fillStyle = g; ctx.fill();
    dot(ctx, lx, ly, 9, alpha(this.color, (Math.sin(this.t() * 5) * 0.5 + 0.5) * 60 + 30));
    dot(ctx, lx, ly, 3.5, C.TEXT);
  }
}

// History chart (time axis, from /history). Tap or drag along it to read a point; a new range sweeps in
// from the left with a glowing head, switching V/A/W/… morphs the curve into the new one.
// Performance: the grid, labels and the smooth glowing curve are rendered ONCE into two offscreen layers
// whenever the data or size changes; animation frames only blit them (plus a clip, a dot or a polyline).
const easeInOut = (f) => { f = clamp01(f); return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; };
const fmtWhen = (ts) => new Date(ts).toLocaleString(L.en ? "en-GB" : "th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const SWEEP_S = 1.1, MORPH_S = 0.6;

// Smooth curve through xs/ys[a..z] that never overshoots the data (monotone cubic, Fritsch–Carlson)
function monotone(ctx, xs, ys, a, z) {
  ctx.moveTo(xs[a], ys[a]);
  const m = z - a;
  if (m < 1) { ctx.lineTo(xs[a] + 0.01, ys[a]); return; }
  const dx = new Float32Array(m), s = new Float32Array(m), tg = new Float32Array(m + 1);
  for (let k = 0; k < m; k++) { dx[k] = xs[a + k + 1] - xs[a + k]; s[k] = dx[k] > 0 ? (ys[a + k + 1] - ys[a + k]) / dx[k] : 0; }
  tg[0] = s[0]; tg[m] = s[m - 1];
  for (let k = 1; k < m; k++) {
    tg[k] = s[k - 1] * s[k] <= 0 ? 0 : (3 * (dx[k - 1] + dx[k])) / ((2 * dx[k] + dx[k - 1]) / s[k - 1] + (dx[k] + 2 * dx[k - 1]) / s[k]);
  }
  for (let k = 0; k < m; k++) {
    const h = dx[k] / 3, i = a + k;
    ctx.bezierCurveTo(xs[i] + h, ys[i] + tg[k] * h, xs[i + 1] - h, ys[i + 1] - tg[k + 1] * h, xs[i + 1], ys[i + 1]);
  }
}
// Soft drop shadow without shadowBlur (which is very slow on phones)
function softShadow(ctx, x, y, w, h, r) {
  for (const [d, a] of [[7, 0.10], [4, 0.14], [2, 0.18]]) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    roundRect(ctx, x - d, y - d + 4, w + 2 * d, h + 2 * d, r + d);
    ctx.fill();
  }
}

export class HistoryChart extends CanvasCard {
  static slow = false;  // set once a phone proves too slow for the intro → later charts appear at once
  constructor() {
    super(220, { cls: "w-chart", accent: C.CYAN, card: false });  // the card frame lives in the base layer
    this.points = []; this.color = C.CYAN; this.unit = ""; this.dec = 1; this.title = ""; this.from = 0; this.to = 1; this.loading = false;
    this.animating = false;
    this.mode = "sweep";                                   // sweep = new data · morph = same range, other metric
    this.ver = 0; this.geo = null; this.layerKey = "";     // offscreen layers: base (grid, labels) + curve
    this.prevYs = null; this.prevColor = C.CYAN;           // curve on screen before the last set() (ts → y px)
    this.sel = -1; this.selTs = 0; this.selHold = false; this.selAt = 0;
    this.frameMs = []; 
    this.onPointer((x, y, ph) => this.touch(x, y, ph));
    // the sweep plays when the chart is really on screen (60 % visible, above the bottom bar)
    this.inView = false; this.introPending = false;
    this.io = new IntersectionObserver((es) => {
      for (const e of es) this.inView = e.isIntersecting;
      if (this.el.isConnected) this.seenInDom = true;
      else if (this.seenInDom) { this.io.disconnect(); return; }  // screen closed
      if (this.inView && this.introPending) this.startIntro();
    }, { threshold: 0.6, rootMargin: "0px 0px -90px 0px" });
    this.io.observe(this.el);
  }
  animated() { return !calm() && !HistoryChart.slow; }
  startIntro() {
    this.introPending = false;
    this.enterT = this.t();
    this.frameMs = [];
    if (this.animated()) this.animateUntil(this.t() + (this.mode === "sweep" ? SWEEP_S + 0.8 : MORPH_S + 0.1));
    else this.invalidate();
  }
  // stepMs (optional): the spacing of the samples — a line breaks only where more than 2.5 steps are missing
  // (Home Assistant card: hourly statistics on the 7-day view; the gateway history is 5-minute samples)
  set(points, { color, unit, dec, title, from, to, symmetric, detail = null, stepMs = 0 }) {
    const same = this.points.length > 0 && from === this.from && to === this.to;
    this.prevYs = same && this.geo ? new Map(this.geo.pts.map((p, i) => [p.ts, this.geo.ys[i]])) : null;
    this.prevColor = this.color;
    Object.assign(this, { points, color, unit, dec, title, from, to, symmetric, detail, stepMs });
    this.ver++;
    this.mode = this.prevYs ? "morph" : "sweep";
    this.sel = same && this.sel >= 0 && points.length ? this.nearest(this.selTs) : -1;  // keep the tapped time
    if (this.mode === "morph" || this.inView || !this.animated()) this.startIntro();
    else { this.introPending = true; this.invalidate(); }
  }
  nearest(ts) {
    const p = this.points;
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].ts < ts) lo = m; else hi = m; }
    return Math.abs(p[lo].ts - ts) <= Math.abs(p[hi].ts - ts) ? lo : hi;
  }
  touch(x, y, ph) {
    const g = this.geo;
    if (!g || !this.points.length) return;
    if (ph === "up" || ph === "leave") {
      if (this.sel >= 0 && this.selHold) { this.selHold = false; this.selAt = this.t(); this.animateUntil(this.t() + 3.6); }
      return;
    }
    if (x < g.x0 - 10 || x > g.x1 + 10 || y < g.y0 - 24 || y > g.y1 + 24) { if (ph === "down" && this.sel >= 0) { this.sel = -1; this.invalidate(); } return; }
    const i = this.nearest(this.from + ((x - g.x0) / (g.x1 - g.x0)) * (this.to - this.from));
    if (i !== this.sel && ph === "down") navigator.vibrate?.(8);
    if (i === this.sel && this.selHold) return;
    this.sel = i; this.selTs = this.points[i].ts; this.selHold = true; this.selAt = this.t();
    this.invalidate();
  }
  selAlpha() {
    if (this.sel < 0) return 0;
    if (this.selHold) return 1;
    const a = 1 - clamp01((this.t() - this.selAt - 3) / 0.45);
    if (a <= 0) this.sel = -1;
    return a;
  }

  // ---- static layers (rebuilt only when the data, size or language changes) ----
  layers(b) {
    const key = `${this.ver}|${this.w}|${this.h}|${this.dpr}|${L.en}`;
    if (key === this.layerKey && this.geo) return this.geo;
    const pts = this.points, n = pts.length, dpr = this.dpr;
    const mk = (c) => { c = c || document.createElement("canvas"); c.width = this.canvas.width; c.height = this.canvas.height; const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, x]; };
    const [base, bx] = mk(this.geo?.base);
    const [curve, cx] = mk(this.geo?.curve);
    const col = this.color;
    // card frame + header + grid + axis labels
    cardFrame(bx, b, col);
    text(bx, this.title, b.left + 16, b.top + 26, { size: 14, weight: 600 });
    const vals = pts.map((p) => p.v);
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    const stat = `min ${fmt(lo, this.dec)} · max ${fmt(hi, this.dec)} · avg ${fmt(sum / n, this.dec)} ${this.unit}`;
    text(bx, fit(bx, stat, b.width - 32 - measure(bx, this.title, 14, 600) - 10, 10.5, 500), b.right - 16, b.top + 26, { size: 10.5, weight: 500, color: col, align: "right" });
    if (this.symmetric) { hi = Math.max(Math.abs(lo), Math.abs(hi), 1); lo = -hi; }
    if (hi - lo < 0.001) { const m = Math.max(1, Math.abs(hi) * 0.05) / 2; lo -= m; hi += m; }
    const x0 = b.left + 44, x1 = b.right - 14, y0 = b.top + 44, y1 = b.bottom - 24;
    const pad = (hi - lo) * 0.08, top = hi + pad, bot = lo - pad, span = top - bot;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + ((y1 - y0) * i) / 4;
      line(bx, x0, y + 0.5, x1, y + 0.5, tone("#182540"), 1, "butt");
      text(bx, fmt(top - (i * span) / 4, Math.abs(span) < 2 ? 2 : Math.abs(span) < 20 ? 1 : 0), b.left + 8, y + 3, { size: 9.5, color: C.DIM });
    }
    const zeroY = bot < 0 && top > 0 ? y0 + (y1 - y0) * (top / span) : null;
    if (zeroY != null) { bx.setLineDash([4, 4]); line(bx, x0, zeroY, x1, zeroY, tone("#2A3A5C"), 1, "butt"); bx.setLineDash([]); }
    const X = (ts) => x0 + ((ts - this.from) / (this.to - this.from)) * (x1 - x0);
    const Y = (v) => y0 + ((top - v) * (y1 - y0)) / span;
    const spanH = (this.to - this.from) / 3600e3, stepH = spanH > 200 ? 24 * 5 : spanH > 48 ? 24 : spanH > 12 ? 6 : 3;
    const first = new Date(this.from); first.setMinutes(0, 0, 0);
    if (stepH >= 24) first.setHours(0); else first.setHours(Math.ceil(first.getHours() / stepH) * stepH);
    for (let ts = first.getTime(); ts <= this.to; ts += stepH * 3600e3) {
      const x = X(ts); if (x < x0 + 10 || x > x1 - 10) continue;
      const dt = new Date(ts);
      const lab = stepH >= 24 ? `${dt.getDate()}/${dt.getMonth() + 1}` : String(dt.getHours()).padStart(2, "0") + ":00";
      text(bx, lab, x, b.bottom - 8, { size: 9.5, color: C.DIM, align: "center" });
    }
    // curve: area (fading toward the zero line on ± charts) + soft glow + line
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = X(pts[i].ts); ys[i] = Y(pts[i].v); }
    const gapMs = Math.max(20 * 60e3, ((this.to - this.from) / 600) * 3, 2.5 * (this.stepMs || 0));
    const runs = [];
    for (let i = 1, s0 = 0; i <= n; i++) if (i === n || pts[i].ts - pts[i - 1].ts > gapMs) { runs.push([s0, i - 1]); s0 = i; }
    const baseY = zeroY ?? y1;
    const gr = cx.createLinearGradient(0, y0, 0, y1);
    if (zeroY != null) { const z = clamp01((zeroY - y0) / (y1 - y0)); gr.addColorStop(0, alpha(col, 80)); gr.addColorStop(z, alpha(col, 0)); gr.addColorStop(1, alpha(col, 80)); }
    else { gr.addColorStop(0, alpha(col, 75)); gr.addColorStop(1, alpha(col, 0)); }
    cx.fillStyle = gr;
    for (const [a, z] of runs) { cx.beginPath(); monotone(cx, xs, ys, a, z); cx.lineTo(xs[z], baseY); cx.lineTo(xs[a], baseY); cx.closePath(); cx.fill(); }
    // the curve once as a Path2D: stroked into the layer here, and again (clipped) by the light pulse every frame
    const path = new Path2D();
    for (const [a, z] of runs) monotone(path, xs, ys, a, z);
    // the glow is a real blur — affordable because this layer is drawn once, not every frame. 2.0.29: like the dashboard
    // graphs, older samples a little fainter (left → right)
    cx.lineJoin = "round"; cx.lineCap = "round";
    const lg = cx.createLinearGradient(x0, 0, x1, 0); lg.addColorStop(0, alpha(col, 150)); lg.addColorStop(1, col);
    cx.save(); cx.shadowColor = alpha(col, 190); cx.shadowBlur = 9;
    cx.strokeStyle = lg; cx.lineWidth = 2.2; cx.stroke(path); cx.restore();
    this.layerKey = key;
    this.geo = { base, curve, full: null, xs, ys, pts, runs, x0, x1, y0, y1, baseY, path };
    return this.geo;
  }
  // base + curve in one picture for the frames where nothing moves (one blit per frame)
  full(g) {
    if (!g.full) {
      const c = document.createElement("canvas");
      c.width = g.base.width; c.height = g.base.height;
      const x = c.getContext("2d");
      x.drawImage(g.base, 0, 0); x.drawImage(g.curve, 0, 0);
      g.full = c;
    }
    return g.full;
  }

  draw(ctx, b) {
    const pts = this.points, n = pts.length, t = this.t(), age = t - this.enterT;
    if (this.loading || !n) {
      this.pulseOn();  // → not animating
      this.geo = null; this.layerKey = "";
      cardFrame(ctx, b, this.color);
      text(ctx, this.title, b.left + 16, b.top + 26, { size: 14, weight: 600 });
      text(ctx, this.loading ? L.t("กำลังโหลดประวัติ…", "Loading history…") : L.t("ยังไม่มีประวัติในช่วงนี้", "No history in this range"), b.cx, b.cy + 10, { size: 12, weight: 500, color: C.SUB, align: "center" });
      return;
    }
    const rebuilt = this.layerKey !== `${this.ver}|${this.w}|${this.h}|${this.dpr}|${L.en}`;
    const g = this.layers(b);
    const t0 = performance.now();
    const anim = this.animated();
    const morphing = anim && this.mode === "morph" && age < MORPH_S && this.prevYs;
    const sweep = this.introPending ? 0 : !anim || this.mode !== "sweep" ? 1 : easeInOut(age / SWEEP_S);
    const col = morphing ? mix(this.prevColor, this.color, easeInOut(age / MORPH_S)) : this.color;
    const W = this.w, H = this.h;
    const still = !morphing && sweep >= 1;
    ctx.drawImage(still ? this.full(g) : g.base, 0, 0, W, H);

    if (morphing) {
      // the old curve slides into the new one (a light polyline — the glowing layer takes over at the end)
      const e = easeInOut(age / MORPH_S), { xs, ys } = g;
      const my = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i++) { const py = this.prevYs.get(pts[i].ts); my[i] = py == null ? ys[i] : py + (ys[i] - py) * e; }
      const area = ctx.createLinearGradient(0, g.y0, 0, g.y1);
      area.addColorStop(0, alpha(col, 60)); area.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = area;
      for (const [a, z] of g.runs) {
        ctx.beginPath(); ctx.moveTo(xs[a], g.baseY);
        for (let i = a; i <= z; i++) ctx.lineTo(xs[i], my[i]);
        ctx.lineTo(xs[z], g.baseY); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath();
      for (const [a, z] of g.runs) for (let i = a; i <= z; i++) { if (i === a) ctx.moveTo(xs[i], my[i]); else ctx.lineTo(xs[i], my[i]); }
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = alpha(col, 50); ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
    } else if (still) {
      // already in the composite
    } else if (sweep > 0) {
      const rx = g.xs[0] + (g.xs[n - 1] - g.xs[0]) * sweep;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, rx, H); ctx.clip();
      ctx.drawImage(g.curve, 0, 0, W, H);
      ctx.restore();
      // glowing head riding the curve + a faint scan beam
      let k = 0; while (k < n - 2 && g.xs[k + 1] < rx) k++;
      const k1 = Math.min(k + 1, n - 1), f = g.xs[k1] > g.xs[k] ? clamp01((rx - g.xs[k]) / (g.xs[k1] - g.xs[k])) : 0;
      const hy = g.ys[k] + (g.ys[k1] - g.ys[k]) * f;
      const beam = ctx.createLinearGradient(0, g.y0, 0, g.y1);
      beam.addColorStop(0, alpha(col, 0)); beam.addColorStop(0.5, alpha(col, 70)); beam.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = beam; ctx.fillRect(rx - 1, g.y0, 2, g.y1 - g.y0);
      ctx.fillStyle = radial(ctx, rx, hy, 14, [[0, alpha(col, 190)], [1, alpha(col, 0)]]);
      ctx.beginPath(); ctx.arc(rx, hy, 14, 0, Math.PI * 2); ctx.fill();
      dot(ctx, rx, hy, 3.2, C.TEXT);
    }
    if (sweep >= 1 && !morphing) {
      // 2.0.29, like the dashboard graphs: a light pulse running along the curve, a ripple at the last sample
      const pulse = this.pulseOn();
      if (pulse && n > 1) this.drawPulse(ctx, g, col, t);
      // last sample: halo + one ripple right after the sweep lands, then one every 1.4 s
      const lx = g.xs[n - 1], ly = g.ys[n - 1], e = anim && this.mode === "sweep" ? clamp01((age - SWEEP_S) / 0.7) : 1;
      if (e < 1) { ctx.strokeStyle = alpha(col, 200 * (1 - e)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, 4 + 18 * easeOut(e), 0, Math.PI * 2); ctx.stroke(); }
      else if (pulse) { const r = ((age - SWEEP_S - 0.7) / 1.4) % 1; strokeCircle(ctx, lx, ly, 4 + 12 * r, alpha(col, (1 - r) * 190), 1.3); }
      const p = pulse ? Math.sin(t * 5) * 0.5 + 0.5 : 0.5;
      dot(ctx, lx, ly, 7, alpha(col, 45 + 50 * p));
      ctx.save();
      if (fx.level === "full") { ctx.shadowColor = col; ctx.shadowBlur = 8; }
      dot(ctx, lx, ly, 3.5, C.TEXT);
      ctx.restore();
    }
    const sa = this.selAlpha();
    if (sa > 0 && this.sel < n && !morphing) this.drawSel(ctx, b, g.xs[this.sel], g.ys[this.sel], pts[this.sel], col, sa);

    // a phone that cannot keep up gets the final picture at once from now on
    if (anim && !rebuilt && !this.introPending && (sweep < 1 || morphing)) {
      this.frameMs.push(performance.now() - t0);
      if (this.frameMs.length >= 4 && this.frameMs.slice(-4).reduce((a, v) => a + v, 0) / 4 > 14) {
        HistoryChart.slow = true;
        this.enterT = this.t() - 10;
        this.invalidate();
      }
    }
  }
  // the pulse and the ripple keep the chart repainting: not when effects are off or the phone proved too slow
  pulseOn() {
    const on = fx.level !== "off" && !HistoryChart.slow && !this.loading && this.points.length > 1;
    this.keepAnimating = on;
    if (!this.animUntil) this.animating = on;
    return on;
  }
  // a bright stretch ~80 px long running left → right along the curve (one every 4 s), drawn clipped to that stretch
  drawPulse(ctx, g, col, t) {
    const a = g.xs[0], z = g.xs[g.xs.length - 1];
    const f = (((t + this.phase) % 4) / 3.2) * 1.15 - 0.05, sx = a + (z - a) * f;
    if (f <= 0 || sx - 80 > z) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx - 80, g.y0 - 14, 83, g.y1 - g.y0 + 28); ctx.clip();
    const gp = ctx.createLinearGradient(sx - 80, 0, sx + 3, 0);
    gp.addColorStop(0, alpha(col, 0)); gp.addColorStop(0.85, alpha(mix(col, C.TEXT, 0.6), 240)); gp.addColorStop(1, alpha(C.TEXT, 0));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (fx.level === "full") { ctx.shadowColor = col; ctx.shadowBlur = 12; }
    else { const gw = ctx.createLinearGradient(sx - 80, 0, sx + 3, 0); gw.addColorStop(0, alpha(col, 0)); gw.addColorStop(0.85, alpha(col, 70)); gw.addColorStop(1, alpha(col, 0)); ctx.strokeStyle = gw; ctx.lineWidth = 7; ctx.stroke(g.path); }
    ctx.strokeStyle = gp; ctx.lineWidth = 3; ctx.stroke(g.path);
    ctx.restore();
  }
  drawSel(ctx, b, x, y, p, col, a) {
    const g = this.geo;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.setLineDash([3, 4]);
    line(ctx, x, g.y0 - 4, x, g.y1, alpha(C.TEXT, 130), 1, "butt");
    line(ctx, g.x0, y, x, y, alpha(col, 110), 1, "butt");
    ctx.setLineDash([]);
    dot(ctx, x, y, 10, alpha(col, 60));
    dot(ctx, x, y, 5, col);
    dot(ctx, x, y, 2.2, C.TEXT);
    const val = `${fmt(p.v, this.dec)} ${this.unit}`, when = fmtWhen(p.ts), more = this.detail ? this.detail(p) : "";
    const maxW = b.width - 24;
    const w = Math.min(maxW, Math.max(measure(ctx, val, 16, 700, "Chakra Petch"), measure(ctx, when, 10.5, 500), more ? measure(ctx, more, 10, 500) : 0) + 22);
    const hgt = more ? 64 : 48;
    // beside the point if it fits, otherwise above (or below) it — never on top of the point
    let bx, by;
    if (x + 14 + w <= b.right - 6) bx = x + 14;
    else if (x - 14 - w >= b.left + 6) bx = x - 14 - w;
    if (bx != null) by = Math.max(g.y0 - 8, Math.min(g.y1 - hgt, y - hgt / 2));
    else {
      bx = Math.max(b.left + 6, Math.min(b.right - 6 - w, x - w / 2));
      by = y - hgt - 16 >= b.top + 30 ? y - hgt - 16 : Math.min(y + 16, b.bottom - 6 - hgt);
    }
    softShadow(ctx, bx, by, w, hgt, 11);
    ctx.fillStyle = tone("#0A1222"); roundRect(ctx, bx, by, w, hgt, 11); ctx.fill();
    ctx.strokeStyle = alpha(col, 190); ctx.lineWidth = 1.2; roundRect(ctx, bx + 0.5, by + 0.5, w - 1, hgt - 1, 11); ctx.stroke();
    text(ctx, fit(ctx, val, w - 20, 16, 700, "Chakra Petch"), bx + 11, by + 22, { size: 16, weight: 700, family: "Chakra Petch", color: col });
    text(ctx, when, bx + 11, by + 39, { size: 10.5, weight: 500, color: C.SUB });
    if (more) text(ctx, fit(ctx, more, w - 20, 10, 500), bx + 11, by + 55, { size: 10, weight: 500, color: mix(C.SUB, C.TEXT, 0.25) });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Radar used while the gateway scans for BMS over Bluetooth (ScanViews.java)
export class Radar extends CanvasCard {
  constructor() { super(250, { cls: "w-radar" }); this.scanning = false; this.found = 0; this.jk = 0; this.title = ""; this.sub = ""; }
  draw(ctx, b) {
    const cx = b.cx, cy = b.top + 100, R = 78, t = this.t();
    ctx.strokeStyle = tone("#1A2846"); ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, (i * R) / 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    if (this.scanning) {
      for (let i = 0; i < 2; i++) { const f = (t * 0.5 + i * 0.5) % 1; strokeCircle(ctx, cx, cy, f * R, alpha(C.CYAN, (1 - f) * 120), 1); }
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(rad((t * 140) % 360), cx, cy);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.75, "rgba(0,0,0,0)"); g.addColorStop(1, alpha(C.CYAN, 150));
        dot(ctx, cx, cy, R, g);
      }
    }
    for (let i = 0; i < Math.min(this.found, 8); i++) {
      const a = i * 2.3 + 0.7, r = ((((i * 37) % 100) * 0.6) / 100 + 0.35) * R;
      dot(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i < this.jk ? 4 : 2.5, i < this.jk ? C.GREEN : alpha(C.TEXT, 150));
    }
    drawIcon(ctx, "bt", cx, cy, 30, this.scanning ? C.CYAN : C.SUB, 2);
    text(ctx, this.title, cx, b.bottom - 38, { size: 17, weight: 600, align: "center" });
    text(ctx, fit(ctx, this.sub, b.width - 24, 12), cx, b.bottom - 16, { size: 12, color: C.SUB, align: "center" });
  }
}

// ---------------------------------------------------------------------------
// Home list: one BMS per card (mini SOC ring + live numbers)
export class DeviceCard extends CanvasCard {
  constructor() {
    super(152, { cls: "w-dev" });
    this.shimmer = true; this.shown = 0; this.name = ""; this.sub = ""; this.s = null;
  }
  set(s) { this.s = s; this.invalidate(); }
  draw(ctx, full) {
    // top 116 px: SOC ring, name, V/A/W · bottom strip: charged / discharged today (2.0.24)
    const b = { ...full, bottom: full.top + 116, height: 112, cy: full.top + 58 };
    const s = this.s || {}, t = this.t(), on = !!s.online, live = on && s.v != null;
    const ch = live && s.i > 0.15, dc = live && s.i < -0.15, jk04 = s.soc === -1;
    const col = !on ? C.DIM : s.alarm ? C.RED : ch ? C.GREEN : dc ? C.AMBER : C.CYAN;
    this.accent = !on ? C.STROKE : s.alarm ? C.RED : ch ? C.GREEN : dc ? C.AMBER : C.BLUE;
    const target = live && !jk04 ? clamp01((s.soc || 0) / 100) : 0;
    this.shown += (target - this.shown) * ease(0.08);
    // SOC ring
    const cx = b.left + 54, cy = b.cy, R = 36;
    arc(ctx, cx, cy, R, 135, 270); ctx.strokeStyle = tone("#16213A"); ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();
    if (this.shown > 0.005) {
      let g = col;
      if (ctx.createConicGradient) { g = ctx.createConicGradient(rad(135), cx, cy); g.addColorStop(0, mix(col, C.BLUE, 0.6)); g.addColorStop(0.75, col); g.addColorStop(1, mix(col, C.BLUE, 0.6)); }
      arc(ctx, cx, cy, R, 135, 270 * this.shown); ctx.strokeStyle = g; ctx.lineWidth = 7; ctx.stroke();
      const a = rad(135 + 270 * this.shown);
      dot(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4, C.TEXT);
    }
    if (on && live) dot(ctx, cx, cy, R - 8, radial(ctx, cx, cy, R - 8, [[0, alpha(col, 40 + 20 * Math.sin(t * 2))], [1, "rgba(0,0,0,0)"]]));
    const big = !live ? "--" : jk04 ? "BAL" : String(Math.round(this.shown * 100));
    text(ctx, big, cx - (live && !jk04 ? 5 : 0), cy + 9, { size: jk04 ? 16 : 24, weight: 700, family: "Orbitron", color: on ? C.TEXT : C.SUB, align: "center" });
    if (live && !jk04) text(ctx, "%", cx + measure(ctx, big, 24, 700, "Orbitron") / 2 - 1, cy + 9, { size: 11, weight: 700, family: "Chakra Petch", color: C.SUB });
    if (ch) drawIcon(ctx, "bolt", cx, cy - 20, 12, alpha(C.GREEN, (Math.sin(4 * t) * 0.5 + 0.5) * 115 + 140));
    // name + state chip
    const x = b.left + 108, right = b.right - 14;
    const state = !on ? (s.ts ? L.t("ออฟไลน์", "Offline") : L.t("รอเชื่อมต่อ", "Waiting")) : !live ? L.t("ไม่มี BMS", "No BMS") : s.alarm ? L.t("แจ้งเตือน", "Alarm") : ch ? L.t("ชาร์จ", "Charging") : dc ? L.t("จ่ายไฟ", "Discharging") : L.t("พัก", "Idle");
    const scol = !on ? C.SUB : !live ? C.AMBER : col;
    const sw = measure(ctx, state, 11, 600) + 26;
    ctx.fillStyle = alpha(scol, 36); roundRect(ctx, right - sw, b.top + 14, sw, 22, 11); ctx.fill();
    const p = Math.sin(t * 4) * 0.5 + 0.5;
    dot(ctx, right - sw + 10, b.top + 25, 3, alpha(scol, on ? p * 135 + 120 : 200));
    text(ctx, state, right - sw / 2 + 5, b.top + 29, { size: 11, weight: 600, color: scol, align: "center" });
    text(ctx, fit(ctx, this.name, right - sw - x - 8, 15, 600), x, b.top + 31, { size: 15, weight: 600 });
    text(ctx, fit(ctx, this.sub, right - x, 11), x, b.top + 50, { size: 11, color: C.SUB });
    // V / A / W chips
    const vals = [[live ? fmt(s.v, 2) : "--", "V", C.CYAN], [live ? fmt(s.i, 1) : "--", "A", ch ? C.GREEN : dc ? C.AMBER : C.CYAN],
      [live ? (Math.abs(s.p) >= 1000 ? fmt(s.p / 1000, 2) : fmt(s.p, 0)) : "--", live && Math.abs(s.p) >= 1000 ? "kW" : "W", C.PURPLE]];
    const gap = 6, cw = (right - x - gap * 2) / 3, cy2 = b.bottom - 44;
    vals.forEach(([v, u, c], i) => {
      const xx = x + i * (cw + gap);
      ctx.fillStyle = on ? alpha(c, 22) : tone("#101A2D"); roundRect(ctx, xx, cy2, cw, 32, 9); ctx.fill();
      let size = 14;
      while (size > 10 && measure(ctx, v, size, 600, "Chakra Petch") + measure(ctx, u, 10, 700, "Chakra Petch") + 18 > cw) size--;
      text(ctx, v, xx + 9, cy2 + 21, { size, weight: 600, family: "Chakra Petch", color: on ? C.TEXT : C.SUB });
      text(ctx, u, xx + 12 + measure(ctx, v, size, 600, "Chakra Petch"), cy2 + 21, { size: 10, weight: 700, family: "Chakra Petch", color: on ? c : C.DIM });
    });
    line(ctx, full.left + 16, b.bottom + 2, full.right - 16, b.bottom + 2, tone("#16223A"), 1);
    todayLine(ctx, full.left + 16, full.bottom - 10, full.width - 32, s.today, on);
    if (this.shown !== target && Math.abs(this.shown - target) > 0.002) this.dirty = true;
  }
}

// ---------------------------------------------------------------------------
// Charged / discharged today (data/energy.js): why there is no number
export function todayWhy(e) {
  if (e?.why === "nosoc") return L.t("BMS รุ่นนี้ไม่รายงาน SOC", "This BMS reports no SOC");
  if (e?.why === "nodata") return L.t("ยังไม่มีข้อมูลวันนี้", "No data yet today");
  return "--";
}
function tri(ctx, x, y, up, col) {
  // a small ▲ / ▼ (drawn: not every font has the glyph) — x = left edge, y = text baseline
  ctx.fillStyle = col; ctx.beginPath();
  if (up) { ctx.moveTo(x, y - 1); ctx.lineTo(x + 8, y - 1); ctx.lineTo(x + 4, y - 8); }
  else { ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y - 8); ctx.lineTo(x + 4, y - 1); }
  ctx.closePath(); ctx.fill();
}
// "Today ▲ 3.21 kWh · 62.5 Ah   ▼ 1.80 kWh · 35.0 Ah" — shrinks, then leaves out the Ah, to fit maxW
function todayLine(ctx, x, y, maxW, e, on) {
  const lbl = L.t("วันนี้", "Today"), lw = measure(ctx, lbl, 11, 500) + 10;
  text(ctx, lbl, x, y, { size: 11, weight: 500, color: C.SUB });
  x += lw; maxW -= lw;
  if (!e || !e.ok) { text(ctx, fit(ctx, todayWhy(e), maxW, 11), x, y, { size: 11, color: C.DIM }); return; }
  const parts = [[true, e.chgKwh, e.chgAh, C.GREEN], [false, e.dsgKwh, e.dsgAh, C.AMBER]].map(([up, kwh, ah, c]) => ({ up, k: fmtE(kwh), a: " · " + fmtAh(ah) + " Ah", c: on ? c : mix(c, C.SUB, 0.45) }));
  const one = (p, size, ah) => 12 + measure(ctx, p.k, size, 600, "Chakra Petch") + 3 + measure(ctx, "kWh", size - 2, 700, "Chakra Petch") + (ah ? measure(ctx, p.a, size - 1.5, 500, "Chakra Petch") : 0);
  const GAP = 16;
  let size = 12.5, ah = true;
  for (;;) {
    const w = parts.reduce((a, p) => a + one(p, size, ah), 0) + GAP;
    if (w <= maxW) break;
    if (size > 10.5) size -= 0.5; else if (ah) { ah = false; size = 12.5; } else break;
  }
  for (const p of parts) {
    tri(ctx, x, y, p.up, p.c);
    let xx = x + 12;
    text(ctx, p.k, xx, y, { size, weight: 600, family: "Chakra Petch", color: on ? C.TEXT : C.SUB });
    xx += measure(ctx, p.k, size, 600, "Chakra Petch") + 3;
    text(ctx, "kWh", xx, y, { size: size - 2, weight: 700, family: "Chakra Petch", color: p.c });
    xx += measure(ctx, "kWh", size - 2, 700, "Chakra Petch");
    if (ah) text(ctx, p.a, xx, y, { size: size - 1.5, weight: 500, family: "Chakra Petch", color: C.SUB });
    x += one(p, size, ah) + GAP;
  }
}

// Home: fleet summary (total power, avg SOC, online, alarms)
export class SummaryCard extends CanvasCard {
  constructor() { super(206, { cls: "w-sum" }); this.shimmer = true; this.s = null; this.shownP = 0; this.title = ""; }
  set(s) { this.s = s; this.invalidate(); }
  draw(ctx, b) {
    const s = this.s || { total: 0, online: 0, power: 0, soc: null, chg: 0, dsg: 0, alarms: 0 }, t = this.t();
    this.shownP += (s.power - this.shownP) * ease(0.12);
    const P = this.shownP, col = P > 20 ? C.GREEN : P < -20 ? C.AMBER : C.CYAN;
    this.accent = s.alarms ? C.RED : col;
    text(ctx, this.title || L.t("ภาพรวม", "Overview"), b.left + 16, b.top + 26, { size: 14, weight: 600 });
    text(ctx, L.t(`${s.online}/${s.total} ออนไลน์`, `${s.online}/${s.total} online`), b.right - 16, b.top + 26, { size: 11, weight: 600, color: s.online ? C.GREEN : C.SUB, align: "right" });
    const kw = Math.abs(P) >= 1000, big = kw ? fmt(P / 1000, 2) : fmt(P, 0);
    const bx = b.left + 16, by = b.top + 82;
    let size = 40;
    while (size > 24 && measure(ctx, big, size, 700, "Orbitron") > b.width * 0.5) size -= 2;
    text(ctx, big, bx, by, { size, weight: 700, family: "Orbitron" });
    text(ctx, kw ? "kW" : "W", bx + measure(ctx, big, size, 700, "Orbitron") + 6, by, { size: 14, weight: 700, family: "Chakra Petch", color: col });
    text(ctx, P > 20 ? L.t("กำลังชาร์จรวม", "Net charging") : P < -20 ? L.t("กำลังจ่ายรวม", "Net discharging") : L.t("กำลังไฟรวม", "Net power"), bx, by + 20, { size: 11, color: C.SUB });
    // right column
    const rx = b.right - 16, rows = [
      [L.t("SOC เฉลี่ย", "Avg SOC"), s.soc == null ? "--" : Math.round(s.soc) + "%", C.BLUE],
      [L.t("ชาร์จ / จ่าย", "Chg / Dsg"), `${s.chg} / ${s.dsg}`, C.GREEN],
      [L.t("แจ้งเตือน", "Alarms"), String(s.alarms), s.alarms ? C.RED : C.SUB],
    ];
    rows.forEach(([k, v, c], i) => {
      const y = b.top + 58 + i * 22;
      text(ctx, v, rx, y, { size: 14, weight: 600, family: "Chakra Petch", color: c, align: "right" });
      text(ctx, k, rx - measure(ctx, v, 14, 600, "Chakra Petch") - 8, y, { size: 11, color: C.SUB, align: "right" });
    });
    // charged / discharged today, all packs in the list (2.0.24)
    const td = s.today, by0 = b.top + 118, gap = 8, bw = (b.width - 32 - gap) / 2;
    [[true, [L.t("ชาร์จวันนี้", "Charged today"), L.t("ชาร์จ", "Charged")], td?.chgKwh, td?.chgAh, C.GREEN],
      [false, [L.t("จ่ายวันนี้", "Discharged today"), L.t("จ่าย", "Out")], td?.dsgKwh, td?.dsgAh, C.AMBER]].forEach(([up, lbls, kwh, ah, c], k) => {
      const x = b.left + 16 + k * (bw + gap), has = td && td.n > 0;
      ctx.fillStyle = alpha(c, 20); roundRect(ctx, x, by0, bw, 48, 11); ctx.fill();
      tri(ctx, x + 10, by0 + 19, up, c);
      const ahTxt = has ? fmtAh(ah) + " Ah" : "";
      const aw = ahTxt ? measure(ctx, ahTxt, 11, 600, "Chakra Petch") : 0;
      const room = bw - 32 - aw, lbl = measure(ctx, lbls[0], 11) <= room ? lbls[0] : lbls[1];  // short label on narrow screens
      text(ctx, fit(ctx, lbl, room, 11), x + 22, by0 + 19, { size: 11, color: C.SUB });
      if (ahTxt) text(ctx, ahTxt, x + bw - 10, by0 + 19, { size: 11, weight: 600, family: "Chakra Petch", color: C.SUB, align: "right" });
      const v = has ? fmtE(kwh) : "--";
      let size = 17;
      while (size > 12 && measure(ctx, v, size, 600, "Chakra Petch") + measure(ctx, "kWh", 11, 700, "Chakra Petch") + 26 > bw) size--;
      text(ctx, v, x + 10, by0 + 40, { size, weight: 600, family: "Chakra Petch", color: has ? C.TEXT : C.SUB });
      text(ctx, "kWh", x + 14 + measure(ctx, v, size, 600, "Chakra Petch"), by0 + 40, { size: 11, weight: 700, family: "Chakra Petch", color: c });
    });
    // SOC bar
    const y = b.bottom - 16, x0 = b.left + 16, x1 = b.right - 16;
    ctx.fillStyle = tone("#16213A"); roundRect(ctx, x0, y - 3, x1 - x0, 6, 3); ctx.fill();
    if (s.soc != null) {
      const f = clamp01(s.soc / 100), g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, C.BLUE); g.addColorStop(1, s.soc < 20 ? C.RED : C.GREEN);
      ctx.fillStyle = g; roundRect(ctx, x0, y - 3, (x1 - x0) * f, 6, 3); ctx.fill();
      dot(ctx, x0 + (x1 - x0) * f, y, 4 + Math.sin(t * 3), C.TEXT);
    }
  }
}
