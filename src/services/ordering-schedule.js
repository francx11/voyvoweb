// Ordering hours, evaluated in Europe/Madrid regardless of server timezone
// (Railway runs in UTC). `now` is injectable so tests control the clock.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Minutes-since-midnight for "HH:MM"; "24:00" is end-of-day (1440).
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Local date parts in Madrid: { weekday: 0-6 (Sun=0), minutes, isoDate }.
function madridParts(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some ICU builds emit 24 for midnight
  return {
    weekday: weekdayMap[parts.weekday],
    minutes: hour * 60 + Number(parts.minute),
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// Windows that apply today: closedDates win; holidayDates borrow Friday's hours.
function todayWindows(cfg, now = new Date()) {
  const schedule = (cfg && cfg.schedule) || {};
  const { weekday, isoDate } = madridParts(now);
  if (Array.isArray(cfg.closedDates) && cfg.closedDates.includes(isoDate)) return [];
  const key =
    Array.isArray(cfg.holidayDates) && cfg.holidayDates.includes(isoDate)
      ? 'fri'
      : DAY_KEYS[weekday];
  const windows = schedule[key];
  return Array.isArray(windows) ? windows : [];
}

function isOpenNow(cfg, now = new Date()) {
  if (!cfg || cfg.enabled === false) return false;
  if (cfg.forceOpen) return true; // admin override: ignore the weekly schedule
  const { minutes } = madridParts(now);
  return todayWindows(cfg, now).some(([start, end]) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    return minutes >= s && minutes < e;
  });
}

module.exports = { isOpenNow, todayWindows, madridParts };
