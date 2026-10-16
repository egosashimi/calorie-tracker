import { addDays, daysBetween, type Day } from './date';
import { slope, type WeightPoint } from './trend';

/** Energy content of body-mass change (≈3500 kcal/lb). */
export const KCAL_PER_KG = 7700;

export interface ExpenditureInput {
  /** Calories eaten on fully tracked days. Leave out today and days marked incomplete. */
  intake: Map<Day, number>;
  weights: WeightPoint[];
  /** Starting estimate (e.g. Mifflin-St Jeor × activity) used until enough data accumulates. */
  initial: number;
  end: Day;
  /** Rolling window length in days. */
  window?: number;
}

export interface ExpenditurePoint {
  date: Day;
  value: number;
  /** Unsmoothed energy-balance estimate for the window ending on this day, if computable. */
  raw?: number;
  /** 0–1: how much real data supports the estimate. */
  confidence: number;
}

const DAILY_GAIN = 0.12;
const MAX_STEP = 60;

/**
 * Adaptive expenditure (TDEE). For each day, energy balance over the trailing window is estimated as
 *   expenditure ≈ average intake − (weight slope × 7700 kcal/kg)
 * using a least-squares slope across the window's weigh-ins (unbiased, unlike a lagging average).
 * The estimate then moves gradually toward that value, weighted by how many tracked days and how much
 * weigh-in history support it, so a few odd days never cause big jumps.
 */
export function computeExpenditure({ intake, weights, initial, end, window = 21 }: ExpenditureInput): ExpenditurePoint[] {
  const sortedW = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const intakeDays = [...intake.keys()].sort();
  const firstDates = [sortedW[0]?.date, intakeDays[0]].filter(Boolean) as Day[];
  if (!firstDates.length) return [];
  const start = firstDates.sort()[0];
  if (start > end) return [];

  const out: ExpenditurePoint[] = [];
  let est = initial;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ws = maxDay(start, addDays(d, -(window - 1)));
    let total = 0, n = 0;
    for (let x = ws; x <= d; x = addDays(x, 1)) {
      const v = intake.get(x);
      if (v != null) { total += v; n++; }
    }
    const pts = sortedW.filter((w) => w.date >= ws && w.date <= d).map((w) => ({ x: daysBetween(ws, w.date), y: w.kg }));
    const span = pts.length ? pts[pts.length - 1].x - pts[0].x : 0;
    const s = pts.length >= 3 && span >= 6 ? slope(pts) : null;
    let raw: number | undefined;
    let confidence = 0;
    if (s != null && n >= 5) {
      raw = clamp(total / n - s * KCAL_PER_KG, 800, 7000);
      confidence = Math.min(1, n / 14) * Math.min(1, span / 14);
      est += clamp(DAILY_GAIN * confidence * (raw - est), -MAX_STEP, MAX_STEP);
    }
    out.push({ date: d, value: est, raw, confidence });
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const maxDay = (a: Day, b: Day) => (a > b ? a : b);
