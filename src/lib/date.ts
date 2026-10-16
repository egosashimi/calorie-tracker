/** Dates are handled as local calendar days in 'YYYY-MM-DD' form. */
export type Day = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date = new Date()): Day {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function today(): Day {
  return dayKey(new Date());
}

export function addDays(day: Day, n: number): Day {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function weekday(day: Day): number {
  return parseDay(day).getDay();
}

export function dayRange(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDay(day: Day, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseDay(day);
  let s = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (opts.weekday) s = `${WEEKDAYS[d.getDay()]}, ${s}`;
  if (opts.year) s += `, ${d.getFullYear()}`;
  return s;
}

export function relativeDay(day: Day): string {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return fmtDay(day, { weekday: true, year: parseDay(day).getFullYear() !== new Date().getFullYear() });
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Timestamp for a given day using the current clock time (for logging into past days). */
export function timeOn(day: Day, ref = new Date()): number {
  const d = parseDay(day);
  d.setHours(ref.getHours(), ref.getMinutes(), 0, 0);
  return d.getTime();
}
