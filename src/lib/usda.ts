import type { Food } from './foods';
import type { NutrientKey, Nutrients } from './nutrients';

interface Raw {
  keys: NutrientKey[];
  groups: string[];
  common: number[];
  foods: [number, string, number, (number | null)[], [number, string][], string?][];
}

interface Indexed { food: Raw['foods'][number]; words: string[]; head: string[]; segs: Set<string>; norm: string; common: boolean; len: number }

let loading: Promise<Indexed[]> | null = null;
let raw: Raw | null = null;

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
}

/** Light English plural stemming so "apples"/"apple" and "berries"/"berry" match. */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

// USDA names often start with a category ("Fish, salmon, …", "Nuts, almonds"); the next segment is the real food.
const CATEGORY_HEADS = new Set(['fish', 'cereal', 'cereals ready to eat', 'beverage', 'nut', 'seed', 'crustacean', 'mollusk', 'spice', 'oil',
  'alcoholic beverage', 'candy', 'candie', 'snack', 'cheese', 'bean', 'pepper', 'squash', 'cream', 'yogurt', 'cracker', 'cookie', 'sugar', 'syrup',
  'game meat', 'pork', 'lamb', 'veal', 'beef', 'turkey', 'chicken']);
const QUALIFIERS = new Set(['broiler or fryer', 'all class', 'retail part', 'fresh', 'cured', 'whole', 'mixed specy', 'australian', 'new zealand', 'imported']);

export function loadUsda(): Promise<Indexed[]> {
  loading ??= fetch(new URL('data/usda-sr28.json', document.baseURI).toString())
    .then((r) => {
      if (!r.ok) throw new Error(`Food database failed to load (${r.status})`);
      return r.json();
    })
    .then((data: Raw) => {
      raw = data;
      const common = new Set(data.common ?? []);
      return data.foods.map((f) => {
        const norm = normalize(f[1] + (f[5] ? ' ' + f[5] : ''));
        const segs = f[1].split(',').map((x) => normalize(x).split(' ').map(stem).join(' '));
        let headStr = segs[0];
        for (let i = 1; i < segs.length && i < 4 && (CATEGORY_HEADS.has(segs[0]) || QUALIFIERS.has(segs[i - 1])); i++) {
          headStr += ' ' + segs[i];
          if (!QUALIFIERS.has(segs[i])) break;
        }
        return {
          food: f, words: norm.split(' ').map(stem), head: headStr.split(' '), segs: new Set(segs), norm, common: common.has(f[0]),
          len: f[1].replace(/\(.*?\)/g, '').length,
        };
      });
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

const GROUP_PENALTY: Record<string, number> = { 'Baby foods': 6, 'Traditional foods': 4 };
const DEPRIORITIZE = ['dehydrated', 'freeze dried', 'imitation', 'babyfood', 'industrial', 'commercial bakery', 'deli', 'luncheon', 'prepackaged'];

export async function searchUsda(query: string, limit = 60): Promise<Food[]> {
  const index = await loadUsda();
  const q = normalize(query).split(' ').filter(Boolean).map(stem);
  if (!q.length) return [];
  const scored: { s: number; f: Indexed }[] = [];
  for (const it of index) {
    let score = 0;
    let ok = true;
    for (let qi = 0; qi < q.length; qi++) {
      const t = q[qi];
      let best = 0;
      for (let wi = 0; wi < it.words.length; wi++) {
        const w = it.words[wi];
        if (w === t) best = Math.max(best, 4 - Math.min(wi, 6) * 0.15);
        else if (w.startsWith(t)) best = Math.max(best, (t.length >= 3 ? 2.5 : 1.5) - Math.min(wi, 6) * 0.15);
      }
      if (!best) { ok = false; break; }
      if (it.head.includes(t)) best += 2.5;
      else if (it.segs.has(t)) best += 2;
      score += best;
    }
    if (!ok) continue;
    const name = it.food[1];
    score -= Math.min(it.len / 60, 1.2);
    score -= Math.min(name.match(/,/g)?.length ?? 0, 5) * 0.25;
    if (it.common) score += 5;
    if (/\braw\b/i.test(name)) score += 0.6;
    if (/\bcooked\b|\broasted\b|\bboiled\b/i.test(name)) score += 0.3;
    const group = raw!.groups[it.food[2]];
    score -= GROUP_PENALTY[group] ?? 0;
    if (DEPRIORITIZE.some((d) => it.norm.includes(d))) score -= 1.5;
    if (q.every((t) => it.head.includes(t))) score += it.head.join(' ') === q.join(' ') ? 3.5 : 3;
    scored.push({ s: score, f: it });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => toFood(x.f.food));
}

export async function usdaById(ndb: number): Promise<Food | undefined> {
  const index = await loadUsda();
  const it = index.find((x) => x.food[0] === ndb);
  return it && toFood(it.food);
}

function toFood(f: Raw['foods'][number]): Food {
  const per100: Nutrients = {};
  raw!.keys.forEach((k, i) => {
    const v = f[3][i];
    if (v != null) per100[k] = v;
  });
  return {
    id: `usda:${f[0]}`,
    name: f[1],
    source: 'usda',
    per100,
    // SR28 household measures are always expressed in grams, even for beverages.
    servings: f[4].map(([g, label]) => ({ label, g })),
    group: raw!.groups[f[2]],
  };
}
