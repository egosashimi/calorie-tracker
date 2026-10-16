import { G_PER_OZ, ML_PER_FLOZ } from './units';
import { type Nutrients, scale } from './nutrients';
import type { Day } from './date';

export type FoodSource = 'usda' | 'custom' | 'off' | 'fdc' | 'recipe' | 'ai' | 'quick';

export interface Serving {
  label: string;
  /** Weight in grams (or ml for liquids) of one of this serving. */
  g: number;
}

export interface Food {
  /** usda:<ndb>, food:<uuid>, recipe:<uuid>, off:<barcode>, fdc:<id>, ai:<uuid>, quick:<uuid> */
  id: string;
  name: string;
  brand?: string;
  source: FoodSource;
  barcode?: string;
  /** Nutrients per 100 g (or 100 ml when `liquid`). For `noGrams` foods: per 100 "units" where one serving = 100 units. */
  per100: Nutrients;
  servings: Serving[];
  /** The serving weight is unknown, so gram/ounce amounts are not offered. */
  noGrams?: boolean;
  liquid?: boolean;
  group?: string;
  note?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface LogEntry {
  id: string;
  date: Day;
  meal: number;
  time: number;
  food: Food;
  qty: number;
  unit: string;
  grams: number;
  n: Nutrients;
}

export interface Ingredient {
  food: Food;
  qty: number;
  unit: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  /** Final cooked weight in grams, if weighed. Enables logging by weight accurately. */
  cookedGrams?: number;
  ingredients: Ingredient[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryItem {
  key: string;
  food: Food;
  count: number;
  last: number;
  qty: number;
  unit: string;
  fav?: boolean;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function unitOptions(food: Food): Serving[] {
  const base: Serving[] = food.noGrams ? [] : food.liquid
    ? [{ label: 'ml', g: 1 }, { label: 'fl oz', g: ML_PER_FLOZ }]
    : [{ label: 'g', g: 1 }, { label: 'oz', g: G_PER_OZ }];
  const seen = new Set(base.map((b) => b.label));
  const servings = food.servings.filter((s) => s.g > 0 && !seen.has(s.label) && (seen.add(s.label), true));
  return [...servings, ...base];
}

export function defaultUnit(food: Food): Serving {
  return unitOptions(food)[0];
}

export function gramsFor(food: Food, qty: number, unit: string): number {
  const u = unitOptions(food).find((o) => o.label === unit) ?? defaultUnit(food);
  return qty * u.g;
}

export function nutrientsFor(food: Food, grams: number): Nutrients {
  return scale(food.per100, grams / 100);
}

export function makeEntry(food: Food, qty: number, unit: string, date: Day, meal: number, time: number, id = uid()): LogEntry {
  const grams = gramsFor(food, qty, unit);
  return { id, date, meal, time, food, qty, unit, grams, n: nutrientsFor(food, grams) };
}

/** Food whose values are given for one serving with unknown weight (quick add, AI estimate without weight). */
export function perServingFood(partial: Omit<Food, 'per100' | 'servings' | 'noGrams'>, perServing: Nutrients, label = 'serving'): Food {
  return { ...partial, per100: perServing, servings: [{ label, g: 100 }], noGrams: true };
}

/** Food from label values given per serving of known weight. */
export function foodFromServing(partial: Omit<Food, 'per100' | 'servings'>, perServing: Nutrients, serving: Serving, extra: Serving[] = []): Food {
  return { ...partial, per100: scale(perServing, 100 / serving.g), servings: [serving, ...extra] };
}

export function recipeTotals(r: Recipe): { n: Nutrients; rawGrams: number } {
  const n: Nutrients = {};
  let rawGrams = 0;
  for (const ing of r.ingredients) {
    const part = nutrientsFor(ing.food, ing.grams);
    for (const k in part) (n as any)[k] = ((n as any)[k] ?? 0) + (part as any)[k];
    if (!ing.food.noGrams) rawGrams += ing.grams;
  }
  return { n, rawGrams };
}

export function recipeToFood(r: Recipe): Food {
  const { n, rawGrams } = recipeTotals(r);
  const servings = Math.max(r.servings || 1, 0.01);
  const anyUnweighed = r.ingredients.some((i) => i.food.noGrams);
  const total = r.cookedGrams && r.cookedGrams > 0 ? r.cookedGrams : rawGrams;
  if (anyUnweighed || total <= 0) {
    return { id: `recipe:${r.id}`, name: r.name, source: 'recipe', per100: scale(n, 1 / servings), servings: [{ label: 'serving', g: 100 }], noGrams: true };
  }
  return {
    id: `recipe:${r.id}`,
    name: r.name,
    source: 'recipe',
    per100: scale(n, 100 / total),
    servings: [{ label: 'serving', g: total / servings }, { label: 'whole recipe', g: total }],
  };
}

export function displayServing(food: Food): string {
  const s = food.servings[0];
  if (!s) return '100 g';
  if (food.noGrams) return s.label;
  return `${s.label} (${Math.round(s.g)} ${food.liquid ? 'ml' : 'g'})`;
}

export function kcalPerServing(food: Food): number {
  const s = food.servings[0];
  return ((food.per100.kcal ?? 0) * (s ? s.g : 100)) / 100;
}

export function fmtQty(qty: number, unit: string): string {
  const q = Math.round(qty * 100) / 100;
  if (unit === 'g' || unit === 'ml') return `${Math.round(qty)} ${unit}`;
  // household measures often carry their own count ("1 cup", "1 item, 7.6 oz")
  if (/^[\d.½¼¾]/.test(unit)) return q === 1 ? unit : `${q} × ${unit}`;
  return `${q} ${unit}`;
}

export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
