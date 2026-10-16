import type { Nutrients, NutrientKey } from './nutrients';

export type AiProvider = 'claude' | 'chatgpt';

export const PROVIDERS: Record<AiProvider, { label: string; withPrompt: (q: string) => string; home: string }> = {
  claude: { label: 'Claude', withPrompt: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, home: 'https://claude.ai/new' },
  chatgpt: { label: 'ChatGPT', withPrompt: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, home: 'https://chatgpt.com/' },
};

const ITEM_KEYS: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'];

export function mealPrompt(description: string, withPhoto: boolean): string {
  const what = withPhoto
    ? `I've attached a photo of what I ate.${description.trim() ? ` Notes: ${description.trim()}` : ''}`
    : `What I ate: ${description.trim()}`;
  return [
    'Estimate the nutrition of this meal as accurately as possible.',
    'Use the official published nutrition for branded or restaurant items when it exists, and USDA values otherwise. Assume typical US portions unless I give amounts; if I give weights, use them exactly.',
    '',
    what,
    '',
    'Reply with ONLY a JSON code block in exactly this shape (one item per distinct food, numbers are totals for the amount eaten, grams = estimated edible weight). No other text.',
    '```json',
    '{"tally":1,"items":[{"name":"Grilled chicken breast","amount":"6 oz","grams":170,"kcal":280,"protein":53,"carbs":0,"fat":6,"fiber":0,"sugar":0,"satFat":1.7,"sodium":125}]}',
    '```',
  ].join('\n');
}

export function labelPrompt(): string {
  return [
    "Read the Nutrition Facts label in the attached photo exactly as printed (also the product name and brand if visible).",
    'Reply with ONLY a JSON code block in exactly this shape. Values are per serving as printed; mg for cholesterol, sodium, calcium, iron and potassium; mcg for vitamin D; null if not shown. No other text.',
    '```json',
    '{"tally":1,"food":{"name":"","brand":"","servingLabel":"2/3 cup","servingGrams":55,"kcal":0,"fat":0,"satFat":0,"transFat":0,"cholesterol":0,"sodium":0,"carbs":0,"fiber":0,"sugar":0,"addedSugar":0,"protein":0,"vitD":0,"calcium":0,"iron":0,"potassium":0}}',
    '```',
  ].join('\n');
}

/** Pull the first JSON object out of a chat reply (handles code fences, smart quotes and surrounding prose). */
export function extractJson(text: string): any | null {
  const cleaned = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fence ? [fence[1], cleaned] : [cleaned];
  for (const c of candidates) {
    const starts: number[] = [];
    for (let i = 0; i < c.length; i++) if (c[i] === '{' || c[i] === '[') starts.push(i);
    for (const s of starts.slice(0, 20)) {
      for (let e = c.length; e > s; e--) {
        const ch = c[e - 1];
        if (ch !== '}' && ch !== ']') continue;
        try {
          return JSON.parse(c.slice(s, e).replace(/,\s*([}\]])/g, '$1'));
        } catch { /* keep shrinking */ }
      }
    }
  }
  return null;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export interface AiItem { name: string; amount: string; grams?: number; n: Nutrients }

export function parseMeal(text: string): AiItem[] {
  const data = extractJson(text);
  if (!data) throw new Error("Couldn't find the JSON in that reply. Copy the whole response, including the code block.");
  const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : data.food ? [data.food] : null;
  if (!items?.length) throw new Error('The reply had no food items.');
  return items.map((it: any) => {
    const n: Nutrients = {};
    for (const k of ITEM_KEYS) {
      const v = num(it[k] ?? (k === 'kcal' ? it.calories : undefined));
      if (v != null) n[k] = v;
    }
    if (n.kcal == null) throw new Error(`"${it.name ?? 'An item'}" is missing calories.`);
    const grams = num(it.grams);
    return { name: String(it.name ?? 'Food'), amount: String(it.amount ?? ''), grams: grams && grams > 0 ? grams : undefined, n };
  });
}

export interface AiLabel { name: string; brand?: string; servingLabel: string; servingGrams?: number; n: Nutrients }

const LABEL_KEYS: NutrientKey[] = ['kcal', 'fat', 'satFat', 'transFat', 'cholesterol', 'sodium', 'carbs', 'fiber', 'sugar', 'addedSugar', 'protein', 'vitD', 'calcium', 'iron', 'potassium'];

export function parseLabel(text: string): AiLabel {
  const data = extractJson(text);
  const f = data?.food ?? data;
  if (!f || typeof f !== 'object') throw new Error("Couldn't find the JSON in that reply.");
  const n: Nutrients = {};
  for (const k of LABEL_KEYS) {
    const v = num(f[k]);
    if (v != null) n[k] = v;
  }
  if (n.kcal == null) throw new Error('The reply is missing calories.');
  const g = num(f.servingGrams);
  return { name: String(f.name || 'Food'), brand: f.brand || undefined, servingLabel: String(f.servingLabel || 'serving'), servingGrams: g && g > 0 ? g : undefined, n };
}
