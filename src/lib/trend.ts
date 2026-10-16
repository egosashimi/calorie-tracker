import { addDays, daysBetween, type Day } from './date';

export interface WeightPoint { date: Day; kg: number }

/** Smoothing factor of the exponentially weighted moving average (as popularised by The Hacker's Diet). */
export const TREND_ALPHA = 0.1;

/**
 * Trend weight: an exponentially smoothed moving average of scale weight that filters out day-to-day
 * water and gut-content noise. Days without a weigh-in are filled by linear interpolation between the
 * surrounding weigh-ins, so the trend keeps moving smoothly through gaps. After the last weigh-in the
 * trend is held flat.
 */
export function computeTrend(weights: WeightPoint[], end?: Day): Map<Day, number> {
  const out = new Map<Day, number>();
  const pts = [...weights].filter((w) => Number.isFinite(w.kg) && w.kg > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!pts.length) return out;
  const last = end && end > pts[pts.length - 1].date ? end : pts[pts.length - 1].date;
  let trend = pts[0].kg;
  let i = 0;
  for (let d = pts[0].date; d <= last; d = addDays(d, 1)) {
    while (i + 1 < pts.length && pts[i + 1].date <= d) i++;
    const prev = pts[i];
    let input: number | null;
    if (prev.date === d) input = prev.kg;
    else if (i + 1 < pts.length) {
      const next = pts[i + 1];
      const t = daysBetween(prev.date, d) / daysBetween(prev.date, next.date);
      input = prev.kg + (next.kg - prev.kg) * t;
    } else input = null;
    if (input != null && d !== pts[0].date) trend += TREND_ALPHA * (input - trend);
    out.set(d, trend);
  }
  return out;
}

/** Least-squares slope (kg/day) of points; null if fewer than 2 distinct days. */
export function slope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  return (n * sxy - sx * sy) / den;
}

/** Weekly rate of change of the trend weight over the last `days` days, in kg/week. */
export function trendRate(trend: Map<Day, number>, end: Day, days = 14): number | null {
  const pts: { x: number; y: number }[] = [];
  for (let k = days; k >= 0; k--) {
    const d = addDays(end, -k);
    const v = trend.get(d);
    if (v != null) pts.push({ x: -k, y: v });
  }
  if (pts.length < Math.min(7, days)) return null;
  const s = slope(pts);
  return s == null ? null : s * 7;
}
