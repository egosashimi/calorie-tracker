import { type Food, titleCase } from './foods';
import type { NutrientKey, Nutrients } from './nutrients';
import { barcodeVariants } from './db';

const TIMEOUT = 9000;

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 429) throw new Error('Rate limited — try again in a bit, or add your own USDA API key in Settings.');
    if (!r.ok) throw new Error(`Request failed (${r.status})`);
    return await r.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The food database took too long to respond.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ---------------- Open Food Facts ----------------
// Values in *_100g fields are normalised by OFF: grams for mass nutrients, kcal for energy-kcal.
const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments,quantity,nutrition_data_per';
const OFF_MAP: [string, NutrientKey, number][] = [
  ['proteins', 'protein', 1], ['carbohydrates', 'carbs', 1], ['fat', 'fat', 1], ['fiber', 'fiber', 1],
  ['sugars', 'sugar', 1], ['added-sugars', 'addedSugar', 1], ['saturated-fat', 'satFat', 1],
  ['monounsaturated-fat', 'monoFat', 1], ['polyunsaturated-fat', 'polyFat', 1], ['trans-fat', 'transFat', 1],
  ['cholesterol', 'cholesterol', 1000], ['sodium', 'sodium', 1000], ['potassium', 'potassium', 1000],
  ['calcium', 'calcium', 1000], ['iron', 'iron', 1000], ['magnesium', 'magnesium', 1000], ['phosphorus', 'phosphorus', 1000],
  ['zinc', 'zinc', 1000], ['vitamin-c', 'vitC', 1000], ['vitamin-d', 'vitD', 1e6], ['vitamin-a', 'vitA', 1e6],
  ['vitamin-e', 'vitE', 1000], ['vitamin-k', 'vitK', 1e6], ['vitamin-b12', 'vitB12', 1e6], ['vitamin-b6', 'vitB6', 1000],
  ['caffeine', 'caffeine', 1000],
];

function offNutrients(nm: any, suffix: '_100g' | '_serving'): Nutrients {
  const n: Nutrients = {};
  const num = (k: string) => {
    const v = nm?.[k + suffix];
    const x = typeof v === 'string' ? Number(v) : v;
    return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
  };
  const kcal = num('energy-kcal') ?? (num('energy') != null ? num('energy')! / 4.184 : undefined);
  if (kcal != null) n.kcal = kcal;
  for (const [k, key, mult] of OFF_MAP) {
    const v = num(k);
    if (v != null) n[key] = v * mult;
  }
  if (n.sodium == null && num('salt') != null) n.sodium = (num('salt')! / 2.5) * 1000;
  return n;
}

export function offProductToFood(p: any): Food | null {
  if (!p) return null;
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  let per100 = offNutrients(p.nutriments, '_100g');
  const servingG = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : undefined;
  if (per100.kcal == null && servingG) {
    const perServing = offNutrients(p.nutriments, '_serving');
    if (perServing.kcal != null) per100 = Object.fromEntries(Object.entries(perServing).map(([k, v]) => [k, (v! * 100) / servingG]));
  }
  if (per100.kcal == null || !name) return null;
  const liquid = /\bml\b|\bcl\b|\bl\b|fl/i.test(`${p.serving_size ?? ''} ${p.quantity ?? ''}`) && !/\bg\b/i.test(p.serving_size ?? '');
  const servings = servingG ? [{ label: cleanServing(p.serving_size) || 'serving', g: servingG }] : [];
  const pkg = parseQuantity(p.quantity);
  if (pkg && (!servingG || Math.abs(pkg - servingG) > 1)) servings.push({ label: 'package', g: pkg });
  return {
    id: `off:${p.code}`,
    name: titleCase(name),
    brand: p.brands ? titleCase(String(p.brands).split(',')[0].trim()) : undefined,
    source: 'off',
    barcode: p.code,
    per100,
    servings,
    liquid,
  };
}

function cleanServing(s?: string): string {
  if (!s) return '';
  return s.replace(/\s*\(.*?\)\s*/g, ' ').trim() || s;
}

function parseQuantity(q?: string): number | null {
  if (!q) return null;
  const m = String(q).match(/([\d.,]+)\s*(g|ml|kg|l|cl|oz)\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  const mult = unit === 'kg' || unit === 'l' ? 1000 : unit === 'cl' ? 10 : unit === 'oz' ? 28.3495 : 1;
  return v > 0 ? v * mult : null;
}

export async function offByBarcode(code: string): Promise<Food | null> {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (data?.status !== 1 && !data?.product) return null;
  return offProductToFood({ ...data.product, code: data.product.code || code });
}

export async function offSearch(query: string): Promise<Food[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=${OFF_FIELDS}`;
  const data = await getJson(url);
  return (data?.products ?? []).map(offProductToFood).filter(Boolean) as Food[];
}

// ---------------- USDA FoodData Central ----------------
// Branded, Foundation and SR Legacy search results report nutrients per 100 g/ml.
const FDC_MAP: Record<number, [NutrientKey, number]> = {
  1008: ['kcal', 1], 1003: ['protein', 1], 1004: ['fat', 1], 1005: ['carbs', 1], 1079: ['fiber', 1],
  2000: ['sugar', 1], 1063: ['sugar', 1], 1235: ['addedSugar', 1], 1258: ['satFat', 1], 1292: ['monoFat', 1],
  1293: ['polyFat', 1], 1257: ['transFat', 1], 1253: ['cholesterol', 1], 1093: ['sodium', 1], 1092: ['potassium', 1],
  1087: ['calcium', 1], 1089: ['iron', 1], 1090: ['magnesium', 1], 1091: ['phosphorus', 1], 1095: ['zinc', 1],
  1098: ['copper', 1], 1101: ['manganese', 1], 1103: ['selenium', 1], 1106: ['vitA', 1], 1162: ['vitC', 1],
  1114: ['vitD', 1], 1110: ['vitD', 1 / 40], 1109: ['vitE', 1], 1185: ['vitK', 1], 1165: ['thiamin', 1],
  1166: ['riboflavin', 1], 1167: ['niacin', 1], 1170: ['pantothenic', 1], 1175: ['vitB6', 1], 1190: ['folate', 1],
  1178: ['vitB12', 1], 1180: ['choline', 1], 1057: ['caffeine', 1],
};

export function fdcToFood(f: any): Food | null {
  const n: Nutrients = {};
  let kj: number | undefined, atwater: number | undefined;
  for (const fn of f.foodNutrients ?? []) {
    const id = Number(fn.nutrientId ?? fn.nutrient?.id);
    const value = Number(fn.value ?? fn.amount);
    if (!Number.isFinite(value)) continue;
    if (id === 1062) kj = value;
    if (id === 2047 || id === 2048) atwater ??= value;
    const m = FDC_MAP[id];
    if (m && n[m[0]] == null) n[m[0]] = value * m[1];
  }
  if (n.kcal == null) n.kcal = atwater ?? (kj != null ? kj / 4.184 : undefined);
  if (n.kcal == null) return null;
  const unit = String(f.servingSizeUnit ?? '').toLowerCase();
  const liquid = unit === 'ml' || unit === 'mlt';
  const servings = [];
  if (Number(f.servingSize) > 0 && (unit === 'g' || unit === 'grm' || liquid)) {
    servings.push({ label: (f.householdServingFullText || 'serving').toLowerCase(), g: Number(f.servingSize) });
  }
  for (const m of f.foodMeasures ?? []) {
    if (Number(m.gramWeight) > 0 && m.disseminationText && m.disseminationText !== 'Quantity not specified') {
      servings.push({ label: m.disseminationText, g: Number(m.gramWeight) });
    }
  }
  return {
    id: `fdc:${f.fdcId}`,
    name: titleCase(f.description ?? 'Food'),
    brand: f.brandName ? titleCase(f.brandName) : f.brandOwner ? titleCase(f.brandOwner) : undefined,
    source: 'fdc',
    barcode: f.gtinUpc || undefined,
    per100: n,
    servings: servings.slice(0, 6),
    liquid,
    group: f.foodCategory || f.dataType,
  };
}

export async function fdcSearch(query: string, apiKey: string, branded = true): Promise<Food[]> {
  const types = branded ? 'Branded,Foundation,SR%20Legacy' : 'Foundation,SR%20Legacy';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}&query=${encodeURIComponent(query)}&dataType=${types}&pageSize=30`;
  const data = await getJson(url);
  return (data?.foods ?? []).map(fdcToFood).filter(Boolean) as Food[];
}

export async function fdcByBarcode(code: string, apiKey: string): Promise<Food | null> {
  const variants = new Set(barcodeVariants(code).map((v) => v.replace(/^0+/, '')));
  for (const q of [code, code.replace(/^0+/, '')]) {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}&query=${encodeURIComponent(q)}&dataType=Branded&pageSize=10`;
    const data = await getJson(url);
    const hit = (data?.foods ?? []).find((f: any) => f.gtinUpc && variants.has(String(f.gtinUpc).replace(/^0+/, '')));
    if (hit) return fdcToFood(hit);
  }
  return null;
}

/** Look up a barcode in Open Food Facts first, then USDA Branded Foods. */
export async function lookupBarcode(code: string, apiKey: string): Promise<{ food: Food | null; errors: string[] }> {
  const errors: string[] = [];
  for (const variant of [code, ...barcodeVariants(code).filter((v) => v !== code && v.length === 13)]) {
    try {
      const f = await offByBarcode(variant);
      if (f) return { food: { ...f, barcode: code }, errors };
    } catch (e: any) {
      errors.push(`Open Food Facts: ${e.message}`);
      break;
    }
  }
  try {
    const f = await fdcByBarcode(code, apiKey);
    if (f) return { food: { ...f, barcode: code }, errors };
  } catch (e: any) {
    errors.push(`USDA: ${e.message}`);
  }
  return { food: null, errors };
}
