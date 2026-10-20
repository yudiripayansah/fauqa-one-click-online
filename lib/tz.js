// Zona waktu situs (PRD §4.11). Indonesia tanpa DST → offset tetap.
export const TIMEZONES = [['Asia/Jakarta', 'WIB (UTC+7)', 7], ['Asia/Makassar', 'WITA (UTC+8)', 8], ['Asia/Jayapura', 'WIT (UTC+9)', 9]];
export const hoursOf = (tz) => (TIMEZONES.find((t) => t[0] === tz) ?? TIMEZONES[0])[2];
const pad = (h) => `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`;

// <input type="datetime-local"> (tanpa zona) ↔ ISO, dibaca dalam zona waktu situs.
export const parseLocal = (v, tz) => {
  const d = v ? new Date(`${String(v).slice(0, 16)}:00${pad(hoursOf(tz))}`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};
export const toLocalInput = (iso, tz) => (iso ? new Date(new Date(iso).getTime() + hoursOf(tz) * 3600e3).toISOString().slice(0, 16) : '');
