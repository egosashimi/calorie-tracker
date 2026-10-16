import { all, entriesBetween, type DayRecord, type WeightRecord } from './db';
import { addDays, today, type Day } from './date';
import { addInto, type Nutrients } from './nutrients';
import { computeTrend } from './trend';
import { computeExpenditure, type ExpenditurePoint } from './expenditure';
import { estimateTdee, type Profile } from './program';
import type { LogEntry } from './foods';

export function totalsByDay(entries: LogEntry[]): Map<Day, Nutrients> {
  const m = new Map<Day, Nutrients>();
  for (const e of entries) {
    let t = m.get(e.date);
    if (!t) m.set(e.date, (t = {}));
    addInto(t, e.n);
  }
  return m;
}

export interface Analysis {
  weights: WeightRecord[];
  trend: Map<Day, number>;
  intake: Map<Day, Nutrients>;
  /** Days that count as fully tracked (have entries, not marked incomplete, not today). */
  tracked: Set<Day>;
  expenditure: ExpenditurePoint[];
  expenditureNow: number | null;
  trendNow: number | null;
  days: Map<Day, DayRecord>;
}

export async function analyze(profile: Profile | undefined): Promise<Analysis> {
  const end = today();
  const [weights, entries, dayRecs] = await Promise.all([
    all('weights'), entriesBetween('0000-00-00', end), all('days'),
  ]);
  weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  const days = new Map(dayRecs.map((d) => [d.date, d]));
  const intake = totalsByDay(entries);
  const tracked = new Set<Day>();
  const kcalMap = new Map<Day, number>();
  for (const [d, n] of intake) {
    if (d >= end || days.get(d)?.incomplete) continue;
    tracked.add(d);
    kcalMap.set(d, n.kcal ?? 0);
  }
  const trend = computeTrend(weights, end);
  let initial = profile?.initialTdee;
  if (!initial && profile && weights.length) initial = estimateTdee(profile, weights[0].kg);
  const expenditure = initial
    ? computeExpenditure({ intake: kcalMap, weights, initial, end: addDays(end, -1) })
    : [];
  return {
    weights, trend, intake, tracked, expenditure, days,
    expenditureNow: expenditure.length ? expenditure[expenditure.length - 1].value : initial ?? null,
    trendNow: trend.size ? trend.get(end) ?? [...trend.values()].pop()! : null,
  };
}

export function averageOver(intake: Map<Day, Nutrients>, tracked: Set<Day>, end: Day, days: number): { n: Nutrients; count: number } {
  const n: Nutrients = {};
  let count = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(end, -i);
    if (!tracked.has(d)) continue;
    addInto(n, intake.get(d) ?? {});
    count++;
  }
  if (count) for (const k in n) (n as any)[k] /= count;
  return { n, count };
}
