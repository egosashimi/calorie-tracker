export type NutrientKey =
  | 'kcal' | 'protein' | 'carbs' | 'fat'
  | 'fiber' | 'sugar' | 'addedSugar'
  | 'satFat' | 'monoFat' | 'polyFat' | 'transFat' | 'cholesterol'
  | 'sodium' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'phosphorus' | 'zinc' | 'copper' | 'manganese' | 'selenium'
  | 'vitA' | 'vitC' | 'vitD' | 'vitE' | 'vitK' | 'thiamin' | 'riboflavin' | 'niacin' | 'pantothenic' | 'vitB6' | 'folate' | 'vitB12' | 'choline'
  | 'caffeine';

export type Nutrients = Partial<Record<NutrientKey, number>>;

export interface NutrientDef {
  key: NutrientKey;
  label: string;
  unit: 'kcal' | 'g' | 'mg' | 'mcg';
  group: 'energy' | 'macro' | 'carb' | 'fat' | 'mineral' | 'vitamin' | 'other';
  /** FDA Daily Value for adults and children ≥ 4 (21 CFR 101.9, 2016 rule). Upper limits flagged with `limit`. */
  dv?: number;
  limit?: boolean;
}

export const NUTRIENTS: NutrientDef[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', group: 'energy' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro', dv: 50 },
  { key: 'fat', label: 'Fat', unit: 'g', group: 'macro', dv: 78 },
  { key: 'carbs', label: 'Carbs', unit: 'g', group: 'macro', dv: 275 },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'carb', dv: 28 },
  { key: 'sugar', label: 'Sugars', unit: 'g', group: 'carb' },
  { key: 'addedSugar', label: 'Added sugars', unit: 'g', group: 'carb', dv: 50, limit: true },
  { key: 'satFat', label: 'Saturated fat', unit: 'g', group: 'fat', dv: 20, limit: true },
  { key: 'monoFat', label: 'Monounsaturated fat', unit: 'g', group: 'fat' },
  { key: 'polyFat', label: 'Polyunsaturated fat', unit: 'g', group: 'fat' },
  { key: 'transFat', label: 'Trans fat', unit: 'g', group: 'fat' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', group: 'fat', dv: 300, limit: true },
  { key: 'sodium', label: 'Sodium', unit: 'mg', group: 'mineral', dv: 2300, limit: true },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral', dv: 4700 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', dv: 1300 },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral', dv: 18 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', dv: 420 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', group: 'mineral', dv: 1250 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', dv: 11 },
  { key: 'copper', label: 'Copper', unit: 'mg', group: 'mineral', dv: 0.9 },
  { key: 'manganese', label: 'Manganese', unit: 'mg', group: 'mineral', dv: 2.3 },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', group: 'mineral', dv: 55 },
  { key: 'vitA', label: 'Vitamin A', unit: 'mcg', group: 'vitamin', dv: 900 },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', dv: 90 },
  { key: 'vitD', label: 'Vitamin D', unit: 'mcg', group: 'vitamin', dv: 20 },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin', dv: 15 },
  { key: 'vitK', label: 'Vitamin K', unit: 'mcg', group: 'vitamin', dv: 120 },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', group: 'vitamin', dv: 1.2 },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', group: 'vitamin', dv: 1.3 },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', group: 'vitamin', dv: 16 },
  { key: 'pantothenic', label: 'Pantothenic acid (B5)', unit: 'mg', group: 'vitamin', dv: 5 },
  { key: 'vitB6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin', dv: 1.7 },
  { key: 'folate', label: 'Folate (DFE)', unit: 'mcg', group: 'vitamin', dv: 400 },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'mcg', group: 'vitamin', dv: 2.4 },
  { key: 'choline', label: 'Choline', unit: 'mg', group: 'vitamin', dv: 550 },
  { key: 'caffeine', label: 'Caffeine', unit: 'mg', group: 'other' },
];

export const NUTRIENT_MAP = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n])) as Record<NutrientKey, NutrientDef>;

/** Nutrients shown on a US-style label editor, in label order. */
export const LABEL_ORDER: NutrientKey[] = [
  'kcal', 'fat', 'satFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'sugar', 'addedSugar', 'protein',
  'vitD', 'calcium', 'iron', 'potassium',
];

export function addInto(target: Nutrients, n: Nutrients, factor = 1): Nutrients {
  for (const k in n) {
    const v = n[k as NutrientKey];
    if (v == null || !Number.isFinite(v)) continue;
    target[k as NutrientKey] = (target[k as NutrientKey] ?? 0) + v * factor;
  }
  return target;
}

export function scale(n: Nutrients, factor: number): Nutrients {
  return addInto({}, n, factor);
}

export function sum(list: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const n of list) addInto(out, n);
  return out;
}

/** Calories implied by macros (Atwater 4/4/9). */
export function macroKcal(n: Nutrients): number {
  return (n.protein ?? 0) * 4 + (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9;
}

export function fmtAmount(v: number | undefined, unit: string): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  let s: string;
  if (unit === 'kcal') s = String(Math.round(v));
  else if (abs >= 100) s = String(Math.round(v));
  else if (abs >= 10) s = (Math.round(v * 10) / 10).toString();
  else if (abs >= 1) s = (Math.round(v * 10) / 10).toString();
  else s = (Math.round(v * 100) / 100).toString();
  return s;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
