// BMS alarm bits → names (JK02, syssi/esphome-jk-bms order). No imports: shared by the app (data/model.js) and the
// admin page (admin/src/main.js) — 2.1.24.
export const ALARMS = [
  ["ความต้านทานสายเซลล์สูง", "Wire resistance too high"],
  ["MOS อุณหภูมิสูง (OTP)", "MOSFET over-temperature"],
  ["จำนวนเซลล์ไม่ตรงกับที่ตั้ง", "Cell count mismatch"],
  ["", ""],
  ["แบตเต็ม", "Battery fully charged"],
  ["แบตแรงดันเกิน", "Pack over-voltage"],
  ["ชาร์จกระแสเกิน (OCP)", "Charge over-current"],
  ["ชาร์จลัดวงจร (SCP)", "Charge short circuit"],
  ["ชาร์จอุณหภูมิสูง (OTP)", "Charge over-temperature"],
  ["ชาร์จอุณหภูมิต่ำ (UTP)", "Charge under-temperature"],
  ["สื่อสาร CPU ผิดพลาด", "Coprocessor communication error"],
  ["เซลล์แรงดันต่ำ (UVP)", "Cell under-voltage"],
  ["แบตแรงดันต่ำ", "Pack under-voltage"],
  ["จ่ายกระแสเกิน (OCP)", "Discharge over-current"],
  ["จ่ายลัดวงจร (SCP)", "Discharge short circuit"],
  ["จ่ายอุณหภูมิสูง (OTP)", "Discharge over-temperature"],
  ["Charge MOS ผิดปกติ", "Charge MOSFET fault"],
  ["Discharge MOS ผิดปกติ", "Discharge MOSFET fault"],
  ["GPS ขาดการเชื่อมต่อ", "GPS disconnected"],
  ["กรุณาเปลี่ยนรหัสผ่าน", "Please change password"],
  ["เปิดจ่ายไฟล้มเหลว", "Discharge turn-on failed"],
  ["แบตอุณหภูมิสูง", "Battery over-temperature"],
  ["เซ็นเซอร์อุณหภูมิผิดปกติ", "Temperature sensor fault"],
  ["โมดูล PCL ผิดปกติ", "PCL module fault"],
  ["ปลดล็อกลัดวงจรไม่สำเร็จ", "SCP release failed"],
  ["จ่ายกระแสเกิน ขั้น 2", "Discharge OCP II"],
  ["จ่ายกระแสเกิน ขั้น 3", "Discharge OCP III"],
  ["จ่ายอุณหภูมิต่ำ", "Discharge under-temperature"],
  ["GPS ล็อกจากระยะไกล", "GPS remote lock"],
];
export const INFO_BITS = new Set([4]); // "fully charged" is informational, not an alarm

// every set bit of err (16- and 32-bit protocols: unused high bits are 0) → { bit, th, en, info }
export function alarmBits(err, bits = 32) {
  const out = [];
  const e = Number(err) >>> 0;
  if (!e) return out;
  for (let b = 0; b < Math.min(bits, 32); b++) {
    if (((e >>> b) & 1) !== 1) continue;
    const a = ALARMS[b];
    out.push({ bit: b, th: a && a[0] ? a[0] : `Alarm bit ${b}`, en: a && a[1] ? a[1] : `Alarm bit ${b}`, info: INFO_BITS.has(b) });
  }
  return out;
}
export const realAlarms = (err) => (err ? (Number(err) >>> 0) & ~(1 << 4) : 0);
