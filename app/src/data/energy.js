// Today's charge / discharge (Ah · kWh) estimated from the remaining capacity — no firmware change (app 2.0.24).
//
// The gateway already records  history/{id}/{YYYYMMDD}/{HHMM} = {v, i, p, soc, d, t}  every
// config/gateway/historyMin minutes (default 5). The BMS's SOC is its remaining capacity ÷ full capacity, so
//   remaining capacity (Ah) = SOC % × full capacity (live.cf)
// Every rise of the remaining capacity is charge that went in, every fall is charge that came out; × the pack
// voltage at that moment gives kWh. Because it follows the BMS's own counter, hours the gateway was offline are
// still counted (the SOC moved meanwhile) — unlike adding up current samples, which would miss them.
//
// Day keys are Thai time (gateway/template.yaml: timezone Asia/Bangkok), so the day — and the midnight reset —
// runs 00:00–24:00 Thai time, whatever time zone the phone is set to. Pure functions: tested in test/energy.test.mjs.

export const TH_OFFSET = 7 * 3600e3;  // Asia/Bangkok: UTC+7, no daylight saving
const DAY = 864e5;
const pad = (n) => String(n).padStart(2, "0");

/** "YYYYMMDD" of a moment in Thai time (the gateway's history day key) */
export function thaiDay(ts) {
  const d = new Date(ts + TH_OFFSET);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
/** 00:00 Thai time of the day `ts` falls in */
export function thaiMidnight(ts) {
  const x = ts + TH_OFFSET;
  return x - (((x % DAY) + DAY) % DAY) - TH_OFFSET;
}
export const nextThaiMidnight = (ts) => thaiMidnight(ts) + DAY;
/** "HH:MM" Thai time */
export function thaiHm(ts) {
  const d = new Date(ts + TH_OFFSET);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** history slot "HHMM" of day "YYYYMMDD" (Thai time) → ms */
export function slotTs(day, hm) {
  return Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), +hm.slice(0, 2), +hm.slice(2, 4)) - TH_OFFSET;
}

// The BMS reports SOC in whole percent. Half a step of backlash keeps a reading that flips 61 ↔ 62 % (at the edge
// of a step, or holding full in float) from counting as charge + discharge every few minutes — it counts once,
// half a step — while a real run 40 → 90 % still counts 49.5 %. Error: about one step (1 % of capacity) per run
// between two changes of direction — small next to a day's charge and discharge.
export const BAND = 0.5;

const okSoc = (x) => x != null && x !== "" && isFinite(x) && +x >= 0 && +x <= 100;
const okV = (x) => x != null && x !== "" && isFinite(x) && +x > 0;

/**
 * @param pts   [{ts, soc, v}] samples (history + the live reading), any order
 * @param capAh full capacity of the pack (live.cf)
 * @returns null when there is nothing to go on, else
 *   { chgAh, dsgAh, chgKwh, dsgKwh, netAh, netKwh, n, from, to, soc0, soc1, curve: [{ts, chgKwh, dsgKwh, chgAh, dsgAh}] }
 *   kWh are NaN if no sample has a voltage.
 */
export function energyFromSoc(pts, capAh, { band = BAND } = {}) {
  if (!(capAh > 0) || !Array.isArray(pts)) return null;
  const list = pts.filter((p) => p && isFinite(p.ts) && okSoc(p.soc)).sort((a, b) => a.ts - b.ts);
  if (!list.length) return null;
  let y = +list[0].soc, lastV = okV(list[0].v) ? +list[0].v : NaN;
  const r = { chgAh: 0, dsgAh: 0, chgKwh: 0, dsgKwh: 0, n: list.length, from: list[0].ts, to: list[list.length - 1].ts,
    soc0: +list[0].soc, soc1: +list[list.length - 1].soc, capAh, curve: [] };
  const mark = (ts) => r.curve.push({ ts, chgAh: r.chgAh, dsgAh: r.dsgAh, chgKwh: r.chgKwh, dsgKwh: r.dsgKwh });
  mark(list[0].ts);
  for (let k = 1; k < list.length; k++) {
    const p = list[k], x = +p.soc;
    const v = okV(p.v) ? +p.v : NaN;
    const ny = x > y + band ? x - band : x < y - band ? x + band : y;
    if (ny !== y) {
      const ah = (Math.abs(ny - y) / 100) * capAh;
      // the voltage in between: mean of the two samples (whichever exists)
      const vm = isFinite(v) && isFinite(lastV) ? (v + lastV) / 2 : isFinite(v) ? v : lastV;
      const kwh = (ah * vm) / 1000;
      if (ny > y) { r.chgAh += ah; r.chgKwh += kwh; } else { r.dsgAh += ah; r.dsgKwh += kwh; }
      y = ny;
    }
    if (isFinite(v)) lastV = v;
    mark(p.ts);
  }
  r.netAh = r.chgAh - r.dsgAh;
  r.netKwh = r.chgKwh - r.dsgKwh;
  return r;
}

/**
 * Today so far for one BMS.
 * @param hist  { day, pts: [{ts, soc, v}] } from store.watchToday (may still be yesterday's just after midnight)
 * @param live  latest reading { soc, v, ts } — used as the newest point when it is newer than the last sample
 * @param capAh full capacity (live.cf, or the battery_capacity setting)
 * @param now   ms (store.now())
 * @param opts  { noSoc: true } for BMS without a SOC (JK04)
 * @returns { day, ok, why?, ...energyFromSoc }  why: "nosoc" | "nocap" | "nodata" | "denied"
 */
export function todayEnergy(hist, live, capAh, now, { noSoc = false } = {}) {
  const day = thaiDay(now);
  if (noSoc) return { day, ok: false, why: "nosoc" };
  if (hist?.denied) return { day, ok: false, why: "denied" };
  if (!(capAh > 0)) return { day, ok: false, why: "nocap" };
  // after midnight the old day's samples no longer count: today starts empty (= the reset)
  const pts = hist && hist.day === day && Array.isArray(hist.pts) ? hist.pts.slice() : [];
  const lastTs = pts.reduce((m, p) => Math.max(m, p.ts), 0);
  if (live && okSoc(live.soc) && live.ts > lastTs && live.ts <= now + 60e3 && thaiDay(live.ts) === day) pts.push({ ts: live.ts, soc: +live.soc, v: live.v });
  const e = energyFromSoc(pts, capAh);
  return e ? { day, ok: true, ...e } : { day, ok: false, why: "nodata" };
}

/** sum of several BMS (group / overview). kWh adds up across packs; Ah too, though it only means much for packs of one voltage. */
export function sumEnergy(list) {
  const t = { chgAh: 0, dsgAh: 0, chgKwh: 0, dsgKwh: 0, n: 0 };
  for (const e of list) {
    if (!e || !e.ok) continue;
    t.n++;
    t.chgAh += e.chgAh; t.dsgAh += e.dsgAh;
    if (isFinite(e.chgKwh)) t.chgKwh += e.chgKwh;
    if (isFinite(e.dsgKwh)) t.dsgKwh += e.dsgKwh;
  }
  return t;
}

/** "12.4" — 2 decimals under 10, 1 under 100, none above */
export function fmtE(x) {
  if (x == null || !isFinite(x)) return "--";
  return x.toFixed(decOf(x));
}
/** Ah: "75.6", "329" — one decimal under 100 (the estimate is good to about 1 % of the capacity) */
export function fmtAh(x) {
  if (x == null || !isFinite(x)) return "--";
  return x.toFixed(Math.abs(x) < 99.95 ? 1 : 0);
}
/** decimals fmtE uses for x */
export const decOf = (x) => { const a = Math.abs(x); return a < 9.995 ? 2 : a < 99.95 ? 1 : 0; };
/** cumulative curve reduced to ≤ n points (for a sparkline) */
export function curveOf(e, key, n = 40) {
  const c = e?.curve || [];
  if (c.length <= n) return c.map((p) => p[key]);
  const out = [];
  for (let i = 0; i < n; i++) out.push(c[Math.round((i * (c.length - 1)) / (n - 1))][key]);
  return out;
}
