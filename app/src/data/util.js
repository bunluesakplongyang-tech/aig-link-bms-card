import { L } from "../i18n.js";

// A gateway is online while its heartbeat is fresh (DATA_MODEL.md: now − status.ts < max(3×hb, 180) s)
export function isOnline(status, now) {
  if (!status || !status.ts) return false;
  return now - status.ts < Math.max(3 * (status.hb || 60), 180) * 1000;
}

export function ago(ts, now) {
  if (!ts) return L.t("ไม่เคย", "never");
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 10) return L.t("เมื่อสักครู่", "just now");
  if (s < 60) return L.t(`${Math.round(s)} วิที่แล้ว`, `${Math.round(s)} s ago`);
  if (s < 3600) return L.t(`${Math.round(s / 60)} นาทีที่แล้ว`, `${Math.round(s / 60)} min ago`);
  if (s < 86400) return L.t(`${Math.round(s / 3600)} ชม.ที่แล้ว`, `${Math.round(s / 3600)} h ago`);
  return L.t(`${Math.round(s / 86400)} วันที่แล้ว`, `${Math.round(s / 86400)} d ago`);
}

export const sortedGroups = (groups) => Object.entries(groups || {}).map(([id, g]) => ({ id, ...g })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(b.name));
export const sortedDevices = (devices) => Object.entries(devices || {}).map(([id, d]) => ({ id, ...d })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(b.name));

// Settings lock: the gateway publishes sha256("<deviceId>:<BMS password>") for each BMS password
export async function pwHash(id, pass) {
  const data = new TextEncoder().encode(`${id}:${pass}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const GROUP_COLORS = ["#00E5FF", "#2BFFA8", "#FFB020", "#8B5CF6", "#3D7BFF", "#FF4FD8", "#FF4D6D", "#EAF2FF"];

// Accepts the gateway QR payload "jkgw:ID:CODE", a "?add=ID:CODE" link or "#/add/ID/CODE"
export function parseClaim(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m = s.match(/^jkgw:([0-9A-Za-z]{12}):(\d{6})$/i);
  if (m) return { id: m[1].toUpperCase(), code: m[2] };
  try {
    const u = new URL(s);
    const a = u.searchParams.get("add");
    if (a) { m = a.match(/^([0-9A-Za-z]{12}):(\d{6})$/); if (m) return { id: m[1].toUpperCase(), code: m[2] }; }
    m = u.hash.match(/add\/([0-9A-Za-z]{12})\/(\d{6})/);
    if (m) return { id: m[1].toUpperCase(), code: m[2] };
  } catch { /* not a URL */ }
  return null;
}

export const powerTxt = (p) => (p == null || !isFinite(p) ? "--" : Math.abs(p) >= 1000 ? (p / 1000).toFixed(2) + " kW" : Math.round(p) + " W");
