import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/date';
import { computeTrend, trendRate } from '../src/lib/trend';
import { computeExpenditure, KCAL_PER_KG } from '../src/lib/expenditure';
import { bmr, computeWeek, checkInDue, macrosFor, targetsFor, type Program } from '../src/lib/program';
import { barcodeVariants } from '../src/lib/db';
import { gramsFor, makeEntry, recipeToFood, type Food, type Recipe } from '../src/lib/foods';
import { parseNum } from '../src/lib/units';

// Deterministic pseudo-random noise
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function simulate({ days, tdee, intake, startKg, noiseKg = 0.6, skipEvery = 0 }: {
  days: number; tdee: number; intake: number; startKg: number; noiseKg?: number; skipEvery?: number;
}) {
  const r = rng(42);
  const start = '2026-01-01';
  const weights = [];
  const intakeMap = new Map<string, number>();
  let kg = startKg;
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    if (!skipEvery || i % skipEvery !== 0) weights.push({ date, kg: kg + (r() - 0.5) * 2 * noiseKg });
    const eaten = intake + (r() - 0.5) * 600;
    intakeMap.set(date, eaten);
    kg += (eaten - tdee) / KCAL_PER_KG;
  }
  return { start, end: addDays(start, days - 1), weights, intakeMap, finalKg: kg };
}

describe('trend weight', () => {
  it('smooths noise and tracks a steady loss', () => {
    const sim = simulate({ days: 60, tdee: 2600, intake: 2050, startKg: 90 });
    const trend = computeTrend(sim.weights);
    const rate = trendRate(trend, sim.end, 21)!;
    // true loss is 550 kcal/day ≈ 0.5 kg/week
    expect(rate).toBeLessThan(-0.35);
    expect(rate).toBeGreaterThan(-0.65);
  });

  it('interpolates across gaps and holds after the last weigh-in', () => {
    const t = computeTrend([{ date: '2026-01-01', kg: 80 }, { date: '2026-01-11', kg: 79 }], '2026-01-20');
    expect(t.get('2026-01-06')!).toBeLessThan(80);
    expect(t.get('2026-01-20')).toBe(t.get('2026-01-11'));
  });
});

describe('adaptive expenditure', () => {
  it('converges to the true expenditure from a poor initial guess', () => {
    const sim = simulate({ days: 70, tdee: 2600, intake: 2050, startKg: 90 });
    const pts = computeExpenditure({ intake: sim.intakeMap, weights: sim.weights, initial: 2200, end: sim.end });
    const final = pts[pts.length - 1].value;
    expect(Math.abs(final - 2600)).toBeLessThan(120);
  });

  it('handles a surplus and missing weigh-ins', () => {
    const sim = simulate({ days: 70, tdee: 2400, intake: 2750, startKg: 70, skipEvery: 3 });
    const pts = computeExpenditure({ intake: sim.intakeMap, weights: sim.weights, initial: 2800, end: sim.end });
    expect(Math.abs(pts[pts.length - 1].value - 2400)).toBeLessThan(140);
  });

  it('stays at the initial estimate with no data and never jumps sharply', () => {
    const sim = simulate({ days: 40, tdee: 3000, intake: 2000, startKg: 100 });
    const pts = computeExpenditure({ intake: sim.intakeMap, weights: sim.weights, initial: 2000, end: sim.end });
    expect(pts[0].value).toBe(2000);
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i].value - pts[i - 1].value)).toBeLessThanOrEqual(60);
  });
});

describe('program', () => {
  const program: Program = {
    mode: 'coached', goal: 'lose', ratePct: 0.5, diet: 'balanced', proteinGPerKg: 1.8,
    shiftDays: [6], shiftKcal: 300, checkInDay: 1, manual: [], checkIns: [], startDate: '2026-01-01', startKg: 80,
  };

  it('computes Mifflin-St Jeor', () => {
    expect(bmr('male', 80, 180, 30)).toBeCloseTo(1780, 0);
    expect(bmr('female', 60, 165, 30)).toBeCloseTo(1320.25, 1);
  });

  it('builds a weekly plan whose average deficit matches the goal rate', () => {
    const week = computeWeek(program, 2500, 80, { sex: 'male' });
    const avg = week.reduce((s, d) => s + d.kcal, 0) / 7;
    // 0.5% of 80 kg = 0.4 kg/week -> 440 kcal/day deficit
    expect(avg).toBeGreaterThan(2500 - 440 - 3);
    expect(avg).toBeLessThan(2500 - 440 + 3);
    expect(week[6].kcal - week[1].kcal).toBe(350);
    expect(week[1].protein).toBe(144);
  });

  it('caps the protein reference weight at BMI 27', () => {
    const week = computeWeek(program, 3000, 130, { sex: 'male', heightCm: 175 });
    expect(week[0].protein).toBe(Math.round(1.8 * 27 * 1.75 ** 2));
  });

  it('macros add back up to the calorie target', () => {
    for (const diet of ['balanced', 'lowfat', 'lowcarb', 'keto'] as const) {
      const m = macrosFor(2200, 150, diet);
      expect(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - 2200)).toBeLessThan(12);
    }
  });

  it('picks the targets in force on a day and detects due check-ins', () => {
    const p: Program = { ...program, checkIns: [
      { date: '2026-01-05', expenditure: 2500, trendKg: 80, week: computeWeek(program, 2500, 80, { sex: 'male' }) },
      { date: '2026-01-12', expenditure: 2600, trendKg: 79.5, week: computeWeek(program, 2600, 79.5, { sex: 'male' }) },
    ] };
    expect(targetsFor(p, '2026-01-08')!.kcal).toBe(p.checkIns[0].week[4].kcal);
    expect(targetsFor(p, '2026-01-13')!.kcal).toBe(p.checkIns[1].week[2].kcal);
    expect(checkInDue(p, '2026-01-18')).toBe(false); // Sunday, check-in day is Monday
    expect(checkInDue(p, '2026-01-19')).toBe(true);
  });
});

describe('foods', () => {
  const rice: Food = { id: 'usda:1', name: 'Rice', source: 'usda', per100: { kcal: 130, carbs: 28 }, servings: [{ label: '1 cup', g: 158 }] };

  it('converts units to grams and scales nutrients', () => {
    expect(gramsFor(rice, 2, '1 cup')).toBe(316);
    expect(gramsFor(rice, 1, 'oz')).toBeCloseTo(28.35, 2);
    const e = makeEntry(rice, 1.5, '1 cup', '2026-01-01', 0, 0);
    expect(e.n.kcal).toBeCloseTo(308.1, 1);
  });

  it('turns recipes into per-serving foods using cooked weight', () => {
    const r: Recipe = { id: 'r', name: 'Bowl', servings: 4, cookedGrams: 1000, createdAt: 0, updatedAt: 0,
      ingredients: [{ food: rice, qty: 500, unit: 'g', grams: 500 }] };
    const f = recipeToFood(r);
    expect(f.per100.kcal).toBeCloseTo(65, 5);
    expect(f.servings[0].g).toBe(250);
  });

  it('parses fractions and comma decimals', () => {
    expect(parseNum('1/2')).toBe(0.5);
    expect(parseNum('1 1/2')).toBe(1.5);
    expect(parseNum('2,5')).toBe(2.5);
    expect(parseNum('abc')).toBeNull();
  });

  it('normalises barcode variants', () => {
    expect(barcodeVariants('0737628064502')).toContain('737628064502');
    expect(barcodeVariants('737628064502')).toContain('0737628064502');
  });
});
