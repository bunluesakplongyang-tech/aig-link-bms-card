// Firebase /devices/{id} → AIG-LINK style BmsData, settings definitions, alarm texts
import { L } from "../i18n.js";
import { alarmBits, realAlarms, INFO_BITS } from "./alarms.js";
import { themed, tone } from "../ui/theme.js";

export function toBms(live, status, info, settings) {
  const proto = (status && status.proto) || (info && info.proto) || "UNKNOWN";
  const d = {
    valid: false, proto, is32s: proto === "JK02_32S", jk04: proto === "JK04",
    cellV: [], cellR: [], temps: [], cellCount: 0,
  };
  if (!live || !Array.isArray(live.c)) return d;
  d.valid = true;
  d.ts = live.ts || 0;
  d.voltage = num(live.v);
  d.current = num(live.i);
  d.power = live.p != null ? num(live.p) : d.voltage * d.current;
  d.soc = d.jk04 ? -1 : num(live.soc, -1);
  d.soh = num(live.soh, 0);
  d.cellV = live.c.map((mv) => (mv || 0) / 1000);
  d.cellR = (live.r || []).map((m) => (m || 0) / 1000);
  d.cellCount = d.cellV.length;
  d.maxV = num(live.mx) / 1000;
  d.minV = num(live.mn) / 1000;
  d.avgV = num(live.avg) / 1000;
  d.deltaV = num(live.d) / 1000;
  d.maxCell = Math.max(0, num(live.mxc, 1) - 1);
  d.minCell = Math.max(0, num(live.mnc, 1) - 1);
  d.mosTemp = live.mos != null ? num(live.mos) : NaN;
  d.temps = (live.t || []).map((v) => (v == null ? NaN : num(v)));
  d.balanceCurrent = num(live.bi);
  d.balanceAction = num(live.ba);
  d.remainAh = num(live.cr);
  d.nominalAh = num(live.cf);
  d.cycles = d.jk04 ? -1 : num(live.cy);
  d.cycleCapAh = num(live.cc);
  d.runtimeSec = num(live.rt);
  d.chg = !!live.chg;
  d.dsg = !!live.dis;
  d.precharge = !!live.pre;
  d.heating = !!live.heat;
  d.heatCurrent = live.hi != null ? num(live.hi) : NaN;
  d.alarms = num(live.err);
  d.alarmBits = num(live.eb, 16);
  d.dry = num(live.dry);
  d.chargeStatus = live.cs != null ? live.cs : -1;
  d.battType = live.bt != null ? live.bt : typeFromOvp(settings && settings.cell_ovp);
  d.bal = settings && settings.balancer != null ? !!settings.balancer : d.balanceAction !== 0;
  d.emergency = num(live.em);
  // the BMS's own current limits (settings) — the energy-flow card scales its speed to them (2.0.27); 0 = not read yet
  d.maxChgA = num(settings && settings.max_charge_current);
  d.maxDsgA = num(settings && settings.max_discharge_current);
  return d;
}

const num = (v, def = 0) => (v == null || v === "" || !isFinite(+v) ? def : +v);

export function typeFromOvp(ovp) {
  if (!ovp || ovp <= 0.5) return -1;
  if (ovp >= 3.9) return 1;
  return ovp <= 2.95 ? 2 : 0;
}

// Charge stage of the JK-PB / JK02_32S charging algorithm (live.cs): Bulk (constant current up to RCV) →
// Absorption (holds RCV for rcv_time) → Float (holds RFV); back to Bulk below re_bulk_soc. null = not reported.
const CHARGE_STAGES = [
  { name: "Bulk", th: "ชาร์จกระแสคงที่", en: "constant current", color: "#2BFFA8" },
  { name: "Absorption", th: "คงแรงดัน", en: "constant voltage", color: "#00E5FF" },
  { name: "Float", th: "รักษาระดับ", en: "holding full", color: "#3D7BFF" },
].map(themed);  // colours follow the theme (ui/theme.js, 2.0.27)
export function chargeStage(d) {
  const s = d && d.valid ? d.chargeStatus : -1;
  if (!(s >= 0)) return null;
  return CHARGE_STAGES[s] || { name: "#" + s, th: "ไม่ทราบ", en: "unknown", color: tone("#7F8DAB") };
}

// Energy-flow card speed (2.0.27): the current as a share of the BMS's own limit (max charge / discharge current
// setting) — 40 A on a 200 A pack flows gently, near its limit fast.
const clamp01 = (f) => (f < 0 ? 0 : f > 1 ? 1 : f);
/** |current| ÷ limit, 0..1 (limit not read yet → share of 100 A) */
export const flowRatio = (amps, limit) => clamp01(Math.abs(+amps || 0) / (limit > 0 ? limit : 100));
/** laps of the flow beam per second for that share: 0.22 at rest … 1.72 at the limit */
export const flowSpeed = (ratio) => 0.22 + 1.5 * Math.pow(clamp01(ratio), 0.75);

export const isCharging = (d) => d.valid && d.current > 0.15;
export const isDischarging = (d) => d.valid && d.current < -0.15;
export function cellVmax(d) {
  if (d.battType === 1) return 4.2;
  if (d.battType === 2) return 2.8;
  return d.battType !== 0 && d.maxV > 3.7 ? 4.2 : 3.65;
}
export function cellVmin(d) {
  if (d.battType === 1) return 3.0;
  if (d.battType === 2) return 1.8;
  return d.battType !== 0 && d.maxV > 3.7 ? 3.0 : 2.6;
}
export function typeName(d) {
  return ["LiFePO4 (LFP)", "Li-ion (NMC)", "LTO"][d.battType] || L.t("ไม่ทราบ", "Unknown");
}
export function etaSeconds(d) {
  if (!d.valid || Math.abs(d.current) < 0.15) return -1;
  const ah = d.current > 0 ? Math.max(0, d.nominalAh - d.remainAh) : d.remainAh;
  return (ah / Math.abs(d.current)) * 3600;
}

// ---------------------------------------------------------------------------
// Alarm bits: names live in data/alarms.js (shared with the admin page)

export function alarmList(d) {
  if (!d.valid || !d.alarms) return [];
  return alarmBits(d.alarms, d.alarmBits || 16).map((a) => ({ bit: a.bit, label: L.t(a.th, a.en), info: a.info }));
}
export { realAlarms, INFO_BITS };

// ---------------------------------------------------------------------------
// Settings (AIG-LINK BmsSettings.DEFS order/ranges, keyed by the gateway setting key)
// full English names (shown under each setting) — follow syssi/esphome-jk-bms naming, abbreviations spelled out
const FULL = {
  cell_ovp: "Cell Overvoltage Protection", cell_ovpr: "Cell Overvoltage Recovery",
  cell_uvp: "Cell Undervoltage Protection", cell_uvpr: "Cell Undervoltage Recovery",
  soc100_voltage: "Cell SOC 100% Voltage", soc0_voltage: "Cell SOC 0% Voltage",
  rcv: "Cell Request Charge Voltage", rfv: "Cell Request Float Voltage",
  rcv_time: "Cell Request Charge Voltage Time", rfv_time: "Cell Request Float Voltage Time",
  power_off_voltage: "Power Off Voltage", smart_sleep_voltage: "Smart Sleep Voltage",
  max_charge_current: "Maximum Charge Current",
  charge_ocp_delay: "Charge Overcurrent Protection Delay", charge_ocp_recovery: "Charge Overcurrent Protection Recovery Time",
  max_discharge_current: "Maximum Discharge Current",
  discharge_ocp_delay: "Discharge Overcurrent Protection Delay", discharge_ocp_recovery: "Discharge Overcurrent Protection Recovery Time",
  scp_delay: "Short Circuit Protection Delay", scp_recovery: "Short Circuit Protection Recovery Time",
  charge_otp: "Charge Overtemperature Protection", charge_otpr: "Charge Overtemperature Protection Recovery",
  charge_utp: "Charge Undertemperature Protection", charge_utpr: "Charge Undertemperature Protection Recovery",
  discharge_otp: "Discharge Overtemperature Protection", discharge_otpr: "Discharge Overtemperature Protection Recovery",
  discharge_utp: "Discharge Undertemperature Protection", discharge_utpr: "Discharge Undertemperature Protection Recovery",
  mos_otp: "MOSFET Overtemperature Protection", mos_otpr: "MOSFET Overtemperature Protection Recovery",
  heating_start_temp: "Heating Start Temperature", heating_stop_temp: "Heating Stop Temperature",
  max_balance_current: "Maximum Balance Current", balance_trigger_voltage: "Balance Trigger Voltage", balance_start_voltage: "Balancing Start Voltage",
  cell_count: "Cell Count", battery_capacity: "Total Battery Capacity", re_bulk_soc: "Re-Bulk SOC", precharge_time: "Discharge Precharge Time",
  smart_sleep_delay: "Smart Sleep Delay", emergency_duration: "Emergency Mode Duration",
};
const D = (group, key, th, en, unit, min, max, dec) => ({ group, key, th, en, full: FULL[key] || en, unit, min, max, dec });
export const DEFS = [
  D("volt", "cell_ovp", "ป้องกันแรงดันเกิน", "Cell OVP", "V", 1.2, 4.35, 3),
  D("volt", "cell_ovpr", "คืนค่าแรงดันเกิน", "Cell OVPR", "V", 1.2, 4.35, 3),
  D("volt", "cell_uvp", "ป้องกันแรงดันต่ำ", "Cell UVP", "V", 1.2, 4.35, 3),
  D("volt", "cell_uvpr", "คืนค่าแรงดันต่ำ", "Cell UVPR", "V", 1.2, 4.35, 3),
  D("volt", "soc100_voltage", "แรงดัน SOC 100%", "SOC-100% Volt", "V", 1.2, 4.35, 3),
  D("volt", "soc0_voltage", "แรงดัน SOC 0%", "SOC-0% Volt", "V", 1.2, 4.35, 3),
  D("volt", "rcv", "แรงดันขอชาร์จ (RCV)", "Request Charge Volt", "V", 1.2, 4.35, 3),
  D("volt", "rfv", "แรงดันชาร์จลอย (RFV)", "Request Float Volt", "V", 1.2, 4.35, 3),
  D("volt", "rcv_time", "เวลาคงแรงดันขอชาร์จ (RCV)", "RCV Time", "h", 0, 18.2, 1),
  D("volt", "rfv_time", "เวลาคงแรงดันชาร์จลอย (RFV)", "RFV Time", "h", 0, 18.2, 1),
  D("volt", "power_off_voltage", "แรงดันปิดเครื่อง", "Power Off Volt", "V", 1.2, 4.35, 3),
  D("volt", "smart_sleep_voltage", "แรงดัน Smart Sleep", "Smart Sleep Volt", "V", 1.2, 4.35, 3),
  D("curr", "max_charge_current", "กระแสชาร์จสูงสุด", "Max Charge Current", "A", 1, 600, 1),
  D("curr", "charge_ocp_delay", "หน่วงเวลา OCP ชาร์จ", "Charge OCP Delay", "s", 2, 600, 0),
  D("curr", "charge_ocp_recovery", "เวลาคืนค่า OCP ชาร์จ", "Charge OCPR Time", "s", 2, 600, 0),
  D("curr", "max_discharge_current", "กระแสจ่ายสูงสุด", "Max Discharge Current", "A", 1, 1200, 1),
  D("curr", "discharge_ocp_delay", "หน่วงเวลา OCP จ่าย", "Discharge OCP Delay", "s", 2, 600, 0),
  D("curr", "discharge_ocp_recovery", "เวลาคืนค่า OCP จ่าย", "Discharge OCPR Time", "s", 2, 600, 0),
  D("curr", "scp_delay", "หน่วงเวลาลัดวงจร", "SCP Delay", "µs", 0, 1000000, 0),
  D("curr", "scp_recovery", "เวลาคืนค่าลัดวงจร", "SCPR Time", "s", 2, 600, 0),
  D("temp", "charge_otp", "ชาร์จ: อุณหภูมิสูงตัด", "Charge OTP", "°C", 30, 80, 1),
  D("temp", "charge_otpr", "ชาร์จ: คืนค่าอุณหภูมิสูง", "Charge OTPR", "°C", 20, 80, 1),
  D("temp", "charge_utp", "ชาร์จ: อุณหภูมิต่ำตัด", "Charge UTP", "°C", -45, 20, 1),
  D("temp", "charge_utpr", "ชาร์จ: คืนค่าอุณหภูมิต่ำ", "Charge UTPR", "°C", -45, 25, 1),
  D("temp", "discharge_otp", "จ่าย: อุณหภูมิสูงตัด", "Discharge OTP", "°C", 30, 80, 1),
  D("temp", "discharge_otpr", "จ่าย: คืนค่าอุณหภูมิสูง", "Discharge OTPR", "°C", 20, 80, 1),
  D("temp", "discharge_utp", "จ่าย: อุณหภูมิต่ำตัด", "Discharge UTP", "°C", -45, 20, 0),
  D("temp", "discharge_utpr", "จ่าย: คืนค่าอุณหภูมิต่ำ", "Discharge UTPR", "°C", -45, 25, 0),
  D("temp", "mos_otp", "MOS: อุณหภูมิสูงตัด", "MOS OTP", "°C", 50, 110, 1),
  D("temp", "mos_otpr", "MOS: คืนค่าอุณหภูมิสูง", "MOS OTPR", "°C", 40, 110, 1),
  D("temp", "heating_start_temp", "ฮีตเตอร์: เริ่มทำงานที่", "Heating Start Temp", "°C", -40, 100, 0),
  D("temp", "heating_stop_temp", "ฮีตเตอร์: หยุดที่", "Heating Stop Temp", "°C", -40, 100, 0),
  D("bal", "max_balance_current", "กระแสบาลานซ์สูงสุด", "Max Balance Current", "A", 0.1, 15, 2),
  D("bal", "balance_trigger_voltage", "ส่วนต่างเริ่มบาลานซ์", "Balance Trigger Volt", "V", 0.002, 1, 3),
  D("bal", "balance_start_voltage", "แรงดันเริ่มบาลานซ์", "Start Balance Volt", "V", 1.2, 4.25, 3),
  D("batt", "cell_count", "จำนวนเซลล์", "Cell Count", "S", 2, 32, 0),
  D("batt", "battery_capacity", "ความจุแบตเตอรี่", "Battery Capacity", "Ah", 2, 20000, 1),
  D("batt", "re_bulk_soc", "SOC เริ่มชาร์จใหม่ (Re-Bulk)", "Re-Bulk SOC", "%", 0, 50, 0),
  D("batt", "precharge_time", "เวลา Precharge ก่อนจ่าย", "Precharge Time", "s", 0, 255, 0),
  D("sys", "smart_sleep_delay", "Smart Sleep: หน่วงก่อนหลับ", "Smart Sleep Delay", "h", 1, 100, 0),
  D("sys", "emergency_duration", "ระยะเวลาโหมดฉุกเฉิน", "Emergency Duration", "min", 1, 255, 0),
];

export const GROUP = {
  volt: { th: "แรงดันเซลล์", en: "Cell Voltage", color: "#00E5FF", icon: "bolt" },
  curr: { th: "กระแส & การป้องกัน", en: "Current & Protection", color: "#2BFFA8", icon: "current" },
  temp: { th: "อุณหภูมิ & ฮีตเตอร์", en: "Temperature & Heating", color: "#FFB020", icon: "temp" },
  bal: { th: "ระบบบาลานซ์", en: "Balancer", color: "#8B5CF6", icon: "balance" },
  batt: { th: "แบตเตอรี่", en: "Battery", color: "#3D7BFF", icon: "cell" },
  sys: { th: "ฟังก์ชันระบบ", en: "System Functions", color: "#00E5FF", icon: "clock" },
};
Object.values(GROUP).forEach(themed);

const S = (key, icon, th, en, subTh, subEn, warnTh, warnEn) => ({ key, icon, th, en, subTh, subEn, warnTh, warnEn });
export const MOS_SWITCHES = [
  S("charging", "plug", "เปิดการชาร์จ", "Charging", "Charge MOSFET", "Charge MOSFET"),
  S("discharging", "power", "เปิดการจ่ายไฟ", "Discharging", "Discharge MOSFET", "Discharge MOSFET"),
  S("balancer", "balance", "เปิดระบบบาลานซ์", "Balancer", "Balancer", "Active cell balancing"),
];
export const SYS_SWITCHES = [
  S("heating", "flame", "ฮีตเตอร์แบตเตอรี่", "Heating", "อุ่นแบตเมื่ออุณหภูมิต่ำกว่าค่าเริ่มทำงาน", "Warm the pack below the start temperature"),
  S("disable_temp_sensors", "temp", "ปิดเซนเซอร์อุณหภูมิ", "Disable Temp Sensors", "ใช้เมื่อไม่ได้ต่อเซนเซอร์อุณหภูมิ", "For packs without temperature probes",
    "เมื่อปิดเซนเซอร์ BMS จะไม่ป้องกันอุณหภูมิสูง/ต่ำของแบตเตอรี่ ใช้เฉพาะกรณีไม่ได้ต่อเซนเซอร์เท่านั้น", "With the sensors disabled the BMS cannot protect against over/under-temperature. Only use this when no sensor is fitted."),
  S("display_always_on", "gauge", "จอแสดงผลติดตลอด", "Display Always On", "ไม่ดับหน้าจอบนตัว BMS", "Keep the BMS display lit"),
  S("smart_sleep", "power", "Smart Sleep (หลับอัตโนมัติ)", "Smart Sleep", "BMS เข้าโหมดหลับเมื่อแรงดันต่ำ", "Sleep when the voltage is low"),
  S("disable_pcl", "chip", "ปิดโมดูล PCL", "Disable PCL Module", "ปิดโมดูลสื่อสารขนาน (PCL)", "Turn the PCL module off"),
  S("timed_stored_data", "clock", "บันทึกข้อมูลตามเวลา", "Timed Stored Data", "บันทึกข้อมูลลงหน่วยความจำเป็นช่วง ๆ", "Store history data periodically"),
  S("charging_float_mode", "bolt", "โหมดชาร์จลอย (Float)", "Charging Float Mode", "ใช้แรงดัน RFV หลังชาร์จเต็ม", "Hold the float voltage (RFV) when full"),
  S("emergency_button_trigger", "shield", "ปุ่มกดเปิดโหมดฉุกเฉิน", "Button Trigger Emergency", "ให้ปุ่มบน BMS สั่งโหมดฉุกเฉินได้", "Allow the BMS button to trigger emergency mode"),
  S("dry_alarm_intermittent", "current", "Dry Contact แจ้งเตือนกระพริบ", "Dry Contact Alarm Intermittent", "รีเลย์แจ้งเตือนทำงานเป็นจังหวะ", "Pulse the alarm relay instead of holding it"),
  S("discharge_ocp2", "current", "ป้องกันกระแสจ่ายเกิน ขั้น 2", "Discharge OCP II", "เปิดขั้นป้องกันกระแสจ่ายเกินที่ 2", "Enable the second discharge over-current stage"),
  S("discharge_ocp3", "current", "ป้องกันกระแสจ่ายเกิน ขั้น 3", "Discharge OCP III", "เปิดขั้นป้องกันกระแสจ่ายเกินที่ 3", "Enable the third discharge over-current stage"),
  S("gps_locked_charging", "plug", "ล็อกการชาร์จด้วย GPS", "GPS Locked Charging", "การชาร์จขึ้นกับสถานะ GPS", "Charging depends on the GPS state",
    "เมื่อเปิด การชาร์จจะถูกล็อกตามสถานะ GPS ถ้าไม่มีสัญญาณ GPS BMS อาจไม่ยอมชาร์จ", "When on, charging is locked by the GPS state; without a GPS link the BMS may refuse to charge."),
  S("gps_locked_discharging", "power", "ล็อกการจ่ายไฟด้วย GPS", "GPS Locked Discharging", "การจ่ายไฟขึ้นกับสถานะ GPS", "Discharging depends on the GPS state",
    "เมื่อเปิด การจ่ายไฟจะถูกล็อกตามสถานะ GPS ถ้าไม่มีสัญญาณ GPS โหลดอาจถูกตัดไฟ", "When on, discharging is locked by the GPS state; without a GPS link the loads may lose power."),
];

const UART = ["4G-GPS Remote module Common protocol V4.2", "JK BMS RS485 Modbus V1.0", "NIU U SERIES", "China tower shared battery cabinet V1.1", "PACE_RS485_Modbus_V1.3", "PYLON_low_voltage_Protocol_RS485_V3.5", "Growatt_BMS_RS485_Protocol_1xSxxP_ESS_Rev2.01", "Voltronic_Inverter_and_BMS_485_communication_protocol_20200325", "China tower shared battery cabinet V2.0", "WOW_RS485_Modbus_V1.3", "JK BMS LCD Protocol V2.0", "UART1 User customization", "UART2 User customization", "(9600) JK BMS RS485 Modbus V1.0", "(9600) PYLON_low_voltage_Protocol_RS485_V3.5", "JK BMS PBxx SERIES LCD Protocol V1.0", "JK BMS LIN BUS V1.0", "RS485 Protocol 17", "RS485 Protocol 18", "RS485 Protocol 19", "RS485 Protocol 20"];
const CAN = ["JK BMS CAN Protocol (250K) V2.0", "Deye Low-voltage hybrid inverter CAN communication protocol V1.0", "PYLON-Low-voltage-V1.2", "Growatt BMS CAN-Bus-protocol-low-voltage_Rev_05", "Victron_CANbus_BMS_protocol_20170717", "MEGAREVO_Hybird_BMSCAN_Protocol_V1.0", "JK BMS CAN Protocol (500K) V2.0", "INVT BMS CAN Bus protocol V1.02", "GoodWe LV BMS Protocol (EX/EM/S-BP/BP)", "FSS-ConnectingBat-TI-en-10 Version 1.0", "MUST PV1800F-CAN communication Protocol1.04.04", "LuxpowerTek Battery CAN protocol V01", "CAN BUS User customization 1", "CAN BUS User customization 2"];
const TRIG = ["Off", "Low SoC", "Battery Over Voltage", "Battery Under Voltage", "Battery Cell Over Voltage", "Battery Cell Under Voltage", "Charge Over Current", "Discharge Over Current", "Battery Over Temperature", "MOSFET Over Temperature", "System Alarm", "Battery Low Temperature", "Remote Control", "Above SoC", "MOSFET Abnormal"];
const TRIG_TH = ["ปิด", "SOC ต่ำ", "แบตแรงดันเกิน", "แบตแรงดันต่ำ", "เซลล์แรงดันเกิน", "เซลล์แรงดันต่ำ", "ชาร์จกระแสเกิน", "จ่ายกระแสเกิน", "แบตอุณหภูมิสูง", "MOSFET อุณหภูมิสูง", "ระบบแจ้งเตือน", "แบตอุณหภูมิต่ำ", "สั่งงานระยะไกล", "SOC สูงกว่าค่าที่ตั้ง", "MOSFET ผิดปกติ"];
const SEL = (group, key, icon, th, en, opts, optsTh) => ({ group, key, icon, th, en, opts, optsTh });
export const SELECTS = [
  SEL("proto", "port_mode", "plug", "พอร์ตสื่อสารร่วม", "Multiplexed Port", ["CAN", "RS485"]),
  SEL("proto", "uart1_protocol", "chip", "โปรโตคอล UART1", "UART1 Protocol", UART),
  SEL("proto", "uart2_protocol", "chip", "โปรโตคอล UART2", "UART2 Protocol", UART),
  SEL("proto", "uart3_protocol", "chip", "โปรโตคอล UART3", "UART3 Protocol", UART),
  SEL("proto", "can_protocol", "chip", "โปรโตคอล CAN", "CAN Protocol", CAN),
  SEL("alarm", "lcd_buzzer_trigger", "shield", "LCD Buzzer: เงื่อนไขเตือน", "LCD Buzzer Trigger", TRIG, TRIG_TH),
  SEL("alarm", "dry1_trigger", "bolt", "Dry Contact 1: เงื่อนไข", "DRY1 Trigger", TRIG, TRIG_TH),
  SEL("alarm", "dry2_trigger", "bolt", "Dry Contact 2: เงื่อนไข", "DRY2 Trigger", TRIG, TRIG_TH),
];
export const selLabel = (sel, i) => {
  if (i == null || i < 0 || i >= sel.opts.length) return i == null ? "--" : "#" + i;
  return sel.optsTh ? L.t(sel.optsTh[i], sel.opts[i]) : sel.opts[i];
};

export const PROTO_NAME = { JK04: "JK04", JK02_24S: "JK02-24S", JK02_32S: "JK02-32S", UNKNOWN: "--" };
