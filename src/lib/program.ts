import { weekday, type Day } from './date';
import { KCAL_PER_KG } from './expenditure';

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Diet = 'balanced' | 'lowfat' | 'lowcarb' | 'keto';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';

export interface MacroTargets { kcal: number; protein: number; fat: number; carbs: number }

export interface CheckIn {
  date: Day;
  expenditure: number;
  trendKg: number;
  /** Targets for Sun..Sat. */
  week: MacroTargets[];
}

export interface Program {
  mode: 'coached' | 'manual';
  goal: Goal;
  /** Rate of change as % of body weight per week (always positive; direction comes from goal). */
  ratePct: number;
  targetKg?: number;
  diet: Diet;
  proteinGPerKg: number;
  /** Weekdays (0 = Sunday) that receive extra calories, balanced by the other days. */
  shiftDays: number[];
  shiftKcal: number;
  checkInDay: number;
  manual: MacroTargets[];
  checkIns: CheckIn[];
  startDate: Day;
  startKg: number;
}

export interface Profile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activity: Activity;
  /** Starting expenditure estimate, if the user knows it better than the formula. */
  initialTdee?: number;
}

export const ACTIVITY: Record<Activity, { label: string; factor: number; hint: string }> = {
  sedentary: { label: 'Sedentary', factor: 1.2, hint: 'Desk job, little walking' },
  light: { label: 'Lightly active', factor: 1.375, hint: 'On your feet some, or 1–3 workouts a week' },
  moderate: { label: 'Moderately active', factor: 1.55, hint: '3–5 workouts a week, or an active job' },
  active: { label: 'Very active', factor: 1.725, hint: 'Hard training most days' },
  very: { label: 'Extremely active', factor: 1.9, hint: 'Physical job plus hard training' },
};

export const DIETS: Record<Diet, { label: string; hint: string; fatPct?: number }> = {
  balanced: { label: 'Balanced', hint: 'About 30% of calories from fat, rest from carbs', fatPct: 0.3 },
  lowfat: { label: 'Low fat', hint: 'About 20% of calories from fat', fatPct: 0.2 },
  lowcarb: { label: 'Low carb', hint: 'About 45% of calories from fat', fatPct: 0.45 },
  keto: { label: 'Keto', hint: 'Carbs held at 25 g, the rest from fat' },
};

export const RATE_PRESETS: Record<Goal, number[]> = {
  lose: [0.25, 0.5, 0.75, 1.0],
  maintain: [0],
  gain: [0.1, 0.25, 0.5],
};

/** Mifflin-St Jeor resting energy expenditure. */
export function bmr(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function estimateTdee(p: Profile, kg: number, year = new Date().getFullYear()): number {
  return bmr(p.sex, kg, p.heightCm, year - p.birthYear) * ACTIVITY[p.activity].factor;
}

export function dailyEnergyDelta(goal: Goal, ratePct: number, kg: number): number {
  if (goal === 'maintain') return 0;
  const kgPerWeek = (kg * ratePct) / 100;
  return ((goal === 'lose' ? -1 : 1) * kgPerWeek * KCAL_PER_KG) / 7;
}

export function minimumCalories(sex: Sex): number {
  return sex === 'male' ? 1500 : 1200;
}

export function macrosFor(kcal: number, protein: number, diet: Diet): MacroTargets {
  let fat: number, carbs: number;
  if (diet === 'keto') {
    carbs = 25;
    fat = Math.max(0, (kcal - protein * 4 - carbs * 4) / 9);
  } else {
    fat = (kcal * (DIETS[diet].fatPct ?? 0.3)) / 9;
    carbs = (kcal - protein * 4 - fat * 9) / 4;
    if (carbs < 0) {
      // protein + fat already exceed the budget; trim fat but keep at least 0.5 g/kg-equivalent floor via 15% kcal
      fat = Math.max((kcal * 0.15) / 9, (kcal - protein * 4) / 9);
      carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/**
 * Body weight used for protein targets. Above a BMI of 27 extra mass is mostly fat, so protein is scaled to the
 * weight at BMI 27 instead (avoids unrealistically high targets at higher body weights).
 */
export function proteinReferenceKg(trendKg: number, heightCm?: number): number {
  if (!heightCm) return trendKg;
  const cap = 27 * (heightCm / 100) ** 2;
  return Math.min(trendKg, cap);
}

/** Targets for each weekday (Sun..Sat) from an expenditure estimate and current trend weight. */
export function computeWeek(p: Program, expenditure: number, trendKg: number, who: { sex: Sex; heightCm?: number }): MacroTargets[] {
  if (p.mode === 'manual') return p.manual;
  const base = Math.max(minimumCalories(who.sex), expenditure + dailyEnergyDelta(p.goal, p.ratePct, trendKg));
  const protein = p.proteinGPerKg * proteinReferenceKg(trendKg, who.heightCm);
  const highs = p.shiftDays.filter((d) => d >= 0 && d < 7);
  const shift = highs.length && highs.length < 7 ? p.shiftKcal : 0;
  const lowDelta = shift ? (-shift * highs.length) / (7 - highs.length) : 0;
  return Array.from({ length: 7 }, (_, wd) => {
    const kcal = base + (highs.includes(wd) ? shift : lowDelta);
    return macrosFor(kcal, protein, p.diet);
  });
}

export function targetsFor(p: Program | undefined, day: Day): MacroTargets | null {
  if (!p) return null;
  const wd = weekday(day);
  if (p.mode === 'manual') return p.manual[wd] ?? null;
  if (!p.checkIns.length) return null;
  let ci = p.checkIns[0];
  for (const c of p.checkIns) if (c.date <= day) ci = c;
  return ci.week[wd];
}

export function lastCheckIn(p: Program): CheckIn | undefined {
  return p.checkIns[p.checkIns.length - 1];
}

/** Next scheduled check-in on or after the day following the last one. */
export function checkInDue(p: Program, day: Day): boolean {
  if (p.mode !== 'coached') return false;
  const last = lastCheckIn(p);
  if (!last) return true;
  if (day <= last.date) return false;
  // due if a check-in weekday has occurred after the last check-in (inclusive of today)
  const d0 = new Date(last.date + 'T12:00:00');
  const d1 = new Date(day + 'T12:00:00');
  const days = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  if (days >= 7) return true;
  for (let k = 1; k <= days; k++) {
    const wd = (d0.getDay() + k) % 7;
    if (wd === p.checkInDay) return true;
  }
  return false;
}
