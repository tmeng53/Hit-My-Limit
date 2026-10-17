// Working out when a limit resets from the text the tools print, e.g. "resets 3pm (Europe/Berlin)".

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function validZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Wall-clock parts of a moment in a time zone (or the computer's own zone when tz is null).
function wall(date, tz) {
  if (!tz) {
    return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours(), mi: date.getMinutes() };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, mo: +parts.month - 1, d: +parts.day, h: +parts.hour, mi: +parts.minute };
}

// The moment a wall-clock time happens in a time zone.
function fromWall({ y, mo, d, h, mi }, tz) {
  if (!tz) return new Date(y, mo, d, h, mi);
  const target = Date.UTC(y, mo, d, h, mi);
  let t = target;
  for (let i = 0; i < 2; i++) {
    const w = wall(new Date(t), tz);
    t += target - Date.UTC(w.y, w.mo, w.d, w.h, w.mi);
  }
  return new Date(t);
}

const EPOCH = /\|(\d{10})\b/;
const RESET =
  /resets?\s+(?:at\s+|on\s+)?(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([A-Za-z_]+(?:\/[A-Za-z_+-]+)+|UTC)\))?/i;

// Returns the reset time as a Date, or null when the text doesn't say. `hit` is when the message was written.
export function parseReset(text, hit) {
  const epoch = EPOCH.exec(text);
  if (epoch) return new Date(Number(epoch[1]) * 1000);

  const m = RESET.exec(text);
  if (!m) return null;
  const [, mon, day, hh, mm, ampm, zone] = m;
  if (!ampm && mm === undefined) return null;
  let h = Number(hh);
  if (h > 23 || (ampm && (h < 1 || h > 12))) return null;
  if (ampm) h = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  const mi = Number(mm ?? 0);
  const tz = zone && validZone(zone) ? zone : null;
  const now = wall(hit, tz);

  if (mon) {
    const mo = MONTHS.indexOf(mon.toLowerCase());
    if (mo < 0) return null;
    let t = fromWall({ y: now.y, mo, d: Number(day), h, mi }, tz);
    if (t.getTime() < hit.getTime() - DAY) t = fromWall({ y: now.y + 1, mo, d: Number(day), h, mi }, tz);
    return t;
  }
  let t = fromWall({ ...now, h, mi }, tz);
  if (t.getTime() <= hit.getTime()) t = fromWall({ ...wall(new Date(hit.getTime() + DAY), tz), h, mi }, tz);
  return t;
}

export function duration(minutes) {
  const r = Math.max(5, Math.round(minutes / 5) * 5);
  const d = Math.floor(r / 1440), h = Math.floor((r % 1440) / 60), m = r % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ');
}

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export { HOUR, DAY };
