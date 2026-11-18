// Line icons on a 24-unit grid, ported from AIG-LINK Ui.icon() (+ a few extras for the cloud app).
// Each icon is an SVG path string, used both by canvas (Path2D) and DOM (inline <svg>).
const r2 = (v) => Math.round(v * 100) / 100;
const P = {
  line: (x1, y1, x2, y2) => `M${x1} ${y1}L${x2} ${y2}`,
  circle: (cx, cy, r) => `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0`,
  // Android drawArc(oval l,t,r,b, startDeg, sweepDeg) — clockwise, 0° = 3 o'clock
  arc(l, t, r, b, start, sweep) {
    const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
    if (Math.abs(sweep) >= 360) return P.circle(cx, cy, rx);
    const a0 = (start * Math.PI) / 180, a1 = ((start + sweep) * Math.PI) / 180;
    const x0 = r2(cx + rx * Math.cos(a0)), y0 = r2(cy + ry * Math.sin(a0));
    const x1 = r2(cx + rx * Math.cos(a1)), y1 = r2(cy + ry * Math.sin(a1));
    return `M${x0} ${y0}A${rx} ${ry} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${x1} ${y1}`;
  },
  rrect: (l, t, r, b, rad) => `M${l + rad} ${t}H${r - rad}A${rad} ${rad} 0 0 1 ${r} ${t + rad}V${b - rad}A${rad} ${rad} 0 0 1 ${r - rad} ${b}H${l + rad}A${rad} ${rad} 0 0 1 ${l} ${b - rad}V${t + rad}A${rad} ${rad} 0 0 1 ${l + rad} ${t}Z`,
  rect: (l, t, r, b) => `M${l} ${t}H${r}V${b}H${l}Z`,
};
const gear = () => {
  let d = P.circle(12, 12, 3.2) + P.circle(12, 12, 6.5);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    d += P.line(r2(12 + Math.cos(a) * 6.5), r2(12 + Math.sin(a) * 6.5), r2(12 + Math.cos(a) * 9.5), r2(12 + Math.sin(a) * 9.5));
  }
  return d;
};
const chip = () => {
  let d = P.rrect(6, 6, 18, 18, 2);
  for (let i = 0; i < 3; i++) { const v = i * 3 + 9; d += P.line(v, 2.5, v, 6) + P.line(v, 18, v, 21.5) + P.line(2.5, v, 6, v) + P.line(18, v, 21.5, v); }
  return d;
};

export const ICONS = {
  // ---- AIG-LINK originals ----
  bolt: { d: "M13 2L4 14H11L10 22L20 9H13Z", fill: true },
  gauge: P.arc(3, 4, 21, 22, 150, 240) + P.line(12, 13, 17, 8) + P.circle(12, 13, 1.2),
  chart: P.line(4, 20, 20, 20) + P.line(7, 17, 7, 11) + P.line(12, 17, 12, 5) + P.line(17, 17, 17, 9),
  gear: gear(),
  temp: P.rrect(9.5, 2.5, 14.5, 15, 2.5) + P.circle(12, 18, 3.6) + P.line(12, 8, 12, 16),
  cycle: P.arc(4, 4, 20, 20, 30, 280) + "M20 4L19.5 9.5L14.5 8.5",
  balance: P.line(12, 3, 12, 21) + P.line(4, 7, 20, 7) + P.arc(2, 9, 9, 16, 0, 180) + P.arc(15, 9, 22, 16, 0, 180) + P.line(8, 21, 16, 21),
  bt: "M7 7L17 16L12 21V3L17 8L7 17",
  cell: P.rrect(6, 4, 18, 22, 2.5) + P.line(10, 2, 14, 2) + P.line(9, 16, 15, 16) + P.line(9, 12, 15, 12),
  power: P.arc(4, 5, 20, 21, -60, 300) + P.line(12, 2, 12, 11),
  current: "M2 12C6 2 9 2 12 12C15 22 18 22 22 12",
  scan: P.circle(11, 11, 6.5) + P.line(16, 16, 21, 21),
  chip: chip(),
  shield: "M12 2.5L20 5.5L19 13Q17 19 12 21.5Q7 19 5 13L4 5.5Z" + P.line(8.5, 12, 11, 14.5) + P.line(11, 14.5, 15.5, 9.5),
  clock: P.circle(12, 12, 9) + P.line(12, 7, 12, 12) + P.line(12, 12, 15.5, 14),
  plug: P.line(9, 2, 9, 7) + P.line(15, 2, 15, 7) + P.rrect(5.5, 7, 18.5, 14, 3) + P.line(12, 14, 12, 22),
  home: "M3 11L12 3.5L21 11" + P.rect(6, 10, 18, 20.5),
  flame: "M12 2.5C19 9 19 14 18 16C16 21 8 21 6 16C5 12 8 10 9 7C11 9.5 12 6 12 2.5",
  lock: P.rrect(5, 11, 19, 21, 2.5) + P.arc(8, 4, 16, 14, 180, 180) + P.line(8, 9, 8, 11) + P.line(16, 9, 16, 11) + P.line(12, 15, 12, 17),
  unlock: P.rrect(5, 11, 19, 21, 2.5) + P.arc(8, 3, 16, 13, 160, 160) + P.line(8, 9, 8, 11) + P.line(12, 15, 12, 17),
  globe: P.circle(12, 12, 9) + P.arc(7.5, 3, 16.5, 21, 0, 360) + P.line(3, 12, 21, 12),
  edit: "M4 20L5 15.5L15.5 5L19 8.5L8.5 19Z",
  check: P.line(5, 12.5, 10, 17.5) + P.line(10, 17.5, 19, 7),
  key: P.circle(8, 12, 4.5) + P.line(12.5, 12, 21, 12) + P.line(18, 12, 18, 15.5) + P.line(21, 12, 21, 15),
  // ---- extras in the same style ----
  plus: P.line(12, 5, 12, 19) + P.line(5, 12, 19, 12),
  back: "M15 5L8 12L15 19",
  chevron: "M9 6L15 12L9 18",
  close: P.line(6, 6, 18, 18) + P.line(18, 6, 6, 18),
  trash: "M4 7H20M9 7V4.5H15V7" + "M6 7L7 20.5H17L18 7" + P.line(10, 11, 10, 17) + P.line(14, 11, 14, 17),
  folder: "M3 6.5Q3 5 4.5 5H9.5L11.5 7.5H19.5Q21 7.5 21 9V18Q21 19.5 19.5 19.5H4.5Q3 19.5 3 18Z",
  wifi: P.arc(2, 6, 22, 26, 225, 90) + P.arc(5.5, 9.5, 18.5, 22.5, 225, 90) + P.arc(9, 13, 15, 19, 225, 90) + P.circle(12, 19.5, 0.9),
  cloud: "M7 19H17.5A4.5 4.5 0 0 0 18 10A6 6 0 0 0 6.6 9.2A5 5 0 0 0 7 19Z",
  qr: P.rect(3.5, 3.5, 10, 10) + P.rect(14, 3.5, 20.5, 10) + P.rect(3.5, 14, 10, 20.5) + P.rect(6, 6, 7.5, 7.5) + P.rect(16.5, 6, 18, 7.5) + P.rect(6, 16.5, 7.5, 18) + "M14 14H16.5V16.5M20.5 14V20.5H14V17.5M17.5 17.5H18",
  more: P.circle(5, 12, 1.2) + P.circle(12, 12, 1.2) + P.circle(19, 12, 1.2),
  user: P.circle(12, 8, 4) + "M4 21C5 16 8.5 14 12 14C15.5 14 19 16 20 21",
  logout: "M10 4H5.5Q4 4 4 5.5V18.5Q4 20 5.5 20H10" + P.line(10, 12, 20, 12) + "M16 8L20 12L16 16",
  refresh: P.arc(4, 4, 20, 20, -30, -300) + "M18.9 4.5L19 8L15.5 8.2",
  history: P.arc(3.5, 3.5, 20.5, 20.5, 200, 310) + "M3.2 6.5L3.6 10.5L7.4 9.6" + P.line(12, 8, 12, 12) + P.line(12, 12, 15, 14),
  grip: P.circle(9, 6, 1) + P.circle(15, 6, 1) + P.circle(9, 12, 1) + P.circle(15, 12, 1) + P.circle(9, 18, 1) + P.circle(15, 18, 1),
  up: "M6 15L12 9L18 15",
  down: "M6 9L12 15L18 9",
  restart: P.arc(4, 4, 20, 20, -60, 300) + "M18.5 3.5L18 8L13.6 7.4",
  battery: P.rrect(6, 4, 18, 22, 2.5) + P.line(10, 2, 14, 2) + "M13 7.5L9.5 13.5H12.5L11 18.5L14.5 12.5H11.5Z",
  rotate: P.rrect(7, 2.5, 17, 21.5, 2.5) + P.line(10.5, 18.5, 13.5, 18.5),
  info: P.circle(12, 12, 9) + P.line(12, 11, 12, 16.5) + P.circle(12, 7.6, 0.6),
  megaphone: "M3 10.5V13.5H6.5L12.5 17.5V6.5L6.5 10.5Z" + "M15.5 9.2A3.6 3.6 0 0 1 15.5 14.8" + "M18.2 6.6A7.2 7.2 0 0 1 18.2 17.4" + "M6.5 13.5L7.6 19H9.8L9 14.6",
  camera: "M3 8.5Q3 7 4.5 7H7.5L9 4.5H15L16.5 7H19.5Q21 7 21 8.5V18Q21 19.5 19.5 19.5H4.5Q3 19.5 3 18Z" + P.circle(12, 13, 3.6),
  share: P.circle(6, 12, 2.5) + P.circle(18, 6, 2.5) + P.circle(18, 18, 2.5) + P.line(8.2, 10.8, 15.8, 7.2) + P.line(8.2, 13.2, 15.8, 16.8),
  layers: "M12 3L21.5 8L12 13L2.5 8Z" + "M2.5 12L12 17L21.5 12" + "M2.5 16L12 21L21.5 16",
  sun: P.circle(12, 12, 4) + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const t = (a * Math.PI) / 180; return P.line(r2(12 + Math.cos(t) * 7), r2(12 + Math.sin(t) * 7), r2(12 + Math.cos(t) * 9.5), r2(12 + Math.sin(t) * 9.5)); }).join(""),
  download: P.line(12, 3.5, 12, 15) + "M7.5 10.5L12 15L16.5 10.5" + "M4 17V19.5H20V17",
  copy: P.rrect(8.5, 8.5, 20, 20, 2.5) + "M15.5 8.5V5.5Q15.5 4 14 4H5.5Q4 4 4 5.5V14Q4 15.5 5.5 15.5H8.5",
  link: "M10.6 13.4A4 4 0 0 0 16.3 13.4L19.1 10.6A4 4 0 0 0 13.4 4.9L12 6.3" + "M13.4 10.6A4 4 0 0 0 7.7 10.6L4.9 13.4A4 4 0 0 0 10.6 19.1L12 17.7",
  expand: "M4 9V4H9M15 4H20V9M20 15V20H15M9 20H4V15",
  image: P.rrect(3.5, 4.5, 20.5, 19.5, 2.5) + P.circle(9, 10, 1.8) + "M4 17L9.5 12.5L13 15.5L16 13L20.5 16.5",
  chat: "M4 5.5Q4 4 5.5 4H18.5Q20 4 20 5.5V14.5Q20 16 18.5 16H10L6 20V16H5.5Q4 16 4 14.5Z" + P.line(8, 9, 16, 9) + P.line(8, 12, 13, 12),
  ext: "M14 4H20V10M20 4L11 13M18 14V18.5Q18 20 16.5 20H5.5Q4 20 4 18.5V7.5Q4 6 5.5 6H10",
  // colour palette (Settings → Theme, 2.0.27)
  palette: "M12 3C7 3 3 6.9 3 11.6C3 16.5 7 20.5 11.6 20.5C13 20.5 13.6 19.6 13.2 18.5C12.8 17.4 13.4 16.3 14.6 16.3H16.6C19.1 16.3 21 14.4 21 11.9C21 6.9 17 3 12 3Z" + P.circle(7.6, 11.4, 1.25) + P.circle(10.2, 7.4, 1.25) + P.circle(14.7, 7.6, 1.25) + P.circle(17.3, 11.3, 1.25),
  heart: "M12 20.5C5.5 16 2.5 12.6 2.5 8.9A4.9 4.9 0 0 1 12 6.8A4.9 4.9 0 0 1 21.5 8.9C21.5 12.6 18.5 16 12 20.5Z",
  // guide + install (2.0.23)
  book: "M3.5 5.5Q3.5 4.5 4.5 4.5H9Q12 4.5 12 7.5V20Q12 18 9.5 18H3.5Z" + "M20.5 5.5Q20.5 4.5 19.5 4.5H15Q12 4.5 12 7.5V20Q12 18 14.5 18H20.5Z",
  phone: P.rrect(6.5, 2.5, 17.5, 21.5, 2.5) + P.line(10.5, 18.5, 13.5, 18.5),
  monitor: P.rrect(3, 4, 21, 16, 2) + P.line(8.5, 20, 15.5, 20) + P.line(12, 16, 12, 20),
  shareUp: "M8.5 9.5H7Q5.5 9.5 5.5 11V19Q5.5 20.5 7 20.5H17Q18.5 20.5 18.5 19V11Q18.5 9.5 17 9.5H15.5" + P.line(12, 3, 12, 14) + "M8.5 6.5L12 3L15.5 6.5",
  addBox: P.rrect(4, 4, 20, 20, 4.5) + P.line(12, 8.5, 12, 15.5) + P.line(8.5, 12, 15.5, 12),
  dotsV: P.circle(12, 5, 1.1) + P.circle(12, 12, 1.1) + P.circle(12, 19, 1.1),
  pdf: "M6 2.5H14L19 7.5V20Q19 21.5 17.5 21.5H6.5Q5 21.5 5 20V4Q5 2.5 6.5 2.5Z" + "M14 2.5V7.5H19" + P.line(8.5, 12.5, 15.5, 12.5) + P.line(8.5, 16, 13.5, 16),
  help: P.circle(12, 12, 9) + "M9.4 9.4A2.6 2.6 0 1 1 13.2 11.7C12.4 12.1 12 12.6 12 13.6" + P.circle(12, 16.9, 0.55),
};

const cache = new Map();
export function path2d(name) {
  let p = cache.get(name);
  if (!p) { const ic = ICONS[name] || ICONS.info; p = new Path2D(typeof ic === "string" ? ic : ic.d); cache.set(name, p); }
  return p;
}

// Draw centred at (cx,cy) with the given pixel size, like Ui.icon(canvas, id, cx, cy, size, paint)
export function drawIcon(ctx, name, cx, cy, size, color, width = 1.8) {
  const ic = ICONS[name] || ICONS.info, s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  if (ic.fill) { ctx.fillStyle = color; ctx.fill(path2d(name)); }
  else {
    ctx.strokeStyle = color; ctx.lineWidth = width / s; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke(path2d(name));
  }
  ctx.restore();
}

export function svg(name, size = 20, color = "currentColor", width = 1.8) {
  const ic = ICONS[name] || ICONS.info, d = typeof ic === "string" ? ic : ic.d;
  const paint = ic.fill ? `fill="${color}"` : `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path ${paint} d="${d}"/></svg>`;
}
