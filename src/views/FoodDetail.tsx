import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, MacroSplit, NutrientTable, Empty, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { exitFlow, go } from '../router';
import { useAppState } from '../lib/store';
import { get, put } from '../lib/db';
import { relativeDay, today } from '../lib/date';
import { gramsFor, makeEntry, nutrientsFor, recipeToFood, unitOptions, type Food, type LogEntry } from '../lib/foods';
import { usdaById } from '../lib/usda';
import { foodCache, logFood, toggleFavorite, deleteEntries, defaultMeal, touchHistory } from '../lib/actions';
import { targetsFor } from '../lib/program';
import { trimNum } from '../lib/units';

const SOURCE: Record<string, string> = {
  usda: 'USDA SR28 · lab analyzed', custom: 'Custom food', off: 'Open Food Facts · from package label',
  fdc: 'USDA FoodData Central', recipe: 'Recipe', ai: 'AI estimate', quick: 'Quick add',
};

async function resolveFood(key: string): Promise<Food | undefined> {
  const cached = foodCache.get(key);
  if (cached) return cached;
  if (key.startsWith('usda:')) return usdaById(Number(key.slice(5)));
  if (key.startsWith('recipe:')) {
    const r = await get('recipes', key.slice(7));
    return r && recipeToFood(r);
  }
  return (await get('foods', key)) ?? (await get('history', key))?.food;
}

export function FoodDetail({ q }: { q: URLSearchParams }) {
  const { settings, program } = useAppState();
  const entryId = q.get('entry');
  const key = q.get('key');
  const mode = q.get('mode') === 'recipe' ? 'recipe' : 'log';
  const recipeId = q.get('recipe');
  const ingIndex = q.has('ing') ? Number(q.get('ing')) : null;

  const [food, setFood] = useState<Food | null | undefined>(undefined);
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [qty, setQty] = useState<number | null>(1);
  const [unit, setUnit] = useState('g');
  const [meal, setMeal] = useState(q.has('meal') ? Number(q.get('meal')) : defaultMeal());
  const [fav, setFav] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const date = entry?.date ?? q.get('date') ?? today();

  useEffect(() => {
    (async () => {
      if (entryId) {
        const e = await get('entries', entryId);
        if (!e) return setFood(null);
        setEntry(e); setFood(e.food); setQty(e.qty); setUnit(e.unit); setMeal(e.meal);
        setFav(!!(await get('history', e.food.id))?.fav);
        return;
      }
      if (mode === 'recipe' && recipeId && ingIndex != null) {
        const r = await get('recipes', recipeId);
        const ing = r?.ingredients[ingIndex];
        if (!ing) return setFood(null);
        setFood(ing.food); setQty(ing.qty); setUnit(ing.unit);
        return;
      }
      if (!key) return setFood(null);
      const f = await resolveFood(key);
      if (!f) return setFood(null);
      const h = await get('history', f.id);
      setFav(!!h?.fav);
      const units = unitOptions(f);
      if (h && units.some((u) => u.label === h.unit)) { setQty(h.qty); setUnit(h.unit); }
      else if (f.servings.length) { setQty(1); setUnit(units[0].label); }
      else { setQty(100); setUnit(units[0].label); }
      setFood(f);
    })();
  }, [entryId, key, recipeId, ingIndex]);

  if (food === undefined) return <Screen tabs={false}><TopBar backTo="/log" /></Screen>;
  if (food === null) return <Screen tabs={false}><TopBar backTo="/log" /><Empty title="Food not found">It may have been deleted.</Empty></Screen>;

  const units = unitOptions(food);
  const grams = gramsFor(food, qty ?? 0, unit);
  const n = nutrientsFor(food, grams);
  const t = targetsFor(program, date);
  const valid = qty != null && qty > 0;

  const primary = async () => {
    if (!valid) return;
    if (entry) {
      const updated = makeEntry(food, qty!, unit, entry.date, meal, entry.time, entry.id);
      await put('entries', updated);
      await touchHistory(food, qty!, unit);
      toast('Entry updated');
      exitFlow(`/log/${entry.date}`);
      return;
    }
    if (mode === 'recipe' && recipeId) {
      const r = await get('recipes', recipeId);
      if (!r) return;
      const ing = { food, qty: qty!, unit, grams };
      const ingredients = [...r.ingredients];
      if (ingIndex != null) ingredients[ingIndex] = ing; else ingredients.push(ing);
      await put('recipes', { ...r, ingredients, updatedAt: Date.now() });
      exitFlow(`/recipe/${recipeId}`);
      return;
    }
    await logFood(food, qty!, unit, date, meal);
    toast(`Added to ${settings.meals[meal]?.toLowerCase() ?? 'log'}`);
    exitFlow(`/log/${date}`);
  };

  const removeIngredient = async () => {
    const r = recipeId && (await get('recipes', recipeId));
    if (!r || ingIndex == null) return;
    await put('recipes', { ...r, ingredients: r.ingredients.filter((_, i) => i !== ingIndex), updatedAt: Date.now() });
    exitFlow(`/recipe/${recipeId}`);
  };

  const editable = food.source === 'custom' || food.source === 'recipe';
  const label = entry ? 'Save' : mode === 'recipe' ? (ingIndex != null ? 'Update ingredient' : 'Add to recipe') : `Add to ${settings.meals[meal] ?? 'log'}`;

  return (
    <Screen tabs={false}>
      <TopBar
        backTo="/log"
        right={<>
          {editable && !entry && (
            <button class="icon-btn" aria-label="Edit food" onClick={() => go(food.source === 'recipe' ? `/recipe/${food.id.slice(7)}` : `/custom-food/${food.id.slice(5)}`)}>
              <Icon name="edit" />
            </button>
          )}
          {food.source !== 'quick' && (
            <button class="icon-btn" aria-label={fav ? 'Remove from saved' : 'Save food'} onClick={async () => { const v = await toggleFavorite(food); setFav(v); toast(v ? 'Saved' : 'Removed from saved'); }}>
              <Icon name="star" filled={fav} />
            </button>
          )}
        </>}
      />

      <div style={{ margin: '4px 4px 16px' }}>
        <h2 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{food.name}</h2>
        <div class="muted small" style={{ marginTop: 4 }}>
          {food.brand && <>{food.brand} · </>}{SOURCE[food.source]}{food.group ? ` · ${food.group}` : ''}
        </div>
      </div>

      <div class="card">
        <div class="row" style={{ gap: 8 }}>
          <NumInput class="input" style={{ width: 96, textAlign: 'right' }} value={qty} onChange={setQty} aria-label="Amount" />
          <select class="select grow" value={unit} onChange={(e) => {
            const nu = (e.target as HTMLSelectElement).value;
            // keep the same weight when switching between units
            const g = gramsFor(food, qty ?? 0, unit);
            const target = units.find((u) => u.label === nu)!;
            setUnit(nu);
            if (g > 0) setQty(Number(trimNum(g / target.g, nu === 'g' || nu === 'ml' ? 0 : 2)));
          }}>
            {units.map((u) => (
              <option key={u.label} value={u.label}>
                {u.label}{!food.noGrams && u.label !== 'g' && u.label !== 'ml' ? ` (${trimNum(u.g, 1)} ${food.liquid ? 'ml' : 'g'})` : ''}
              </option>
            ))}
          </select>
        </div>
        {units.length > 1 && (
          <div class="chips" style={{ marginTop: 10 }}>
            {[0.5, 1, 1.5, 2].map((m) => (
              <button key={m} class={`chip${qty === m ? ' on' : ''}`} onClick={() => setQty(m)}>{m}×</button>
            ))}
          </div>
        )}

        {(mode === 'log' || entry) && (
          <>
            <div class="divider" />
            <div class="chips">
              {settings.meals.map((m, i) => <button key={m} class={`chip${i === meal ? ' on' : ''}`} onClick={() => setMeal(i)}>{m}</button>)}
            </div>
            <div class="hint" style={{ marginTop: 8 }}>{relativeDay(date)}</div>
          </>
        )}
      </div>

      <div class="card">
        <div class="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div class="big">{Math.round(n.kcal ?? 0)}<span class="unit">kcal</span></div>
            {!food.noGrams && <div class="small muted" style={{ marginTop: 6 }}>{trimNum(grams, 1)} {food.liquid ? 'ml' : 'g'}</div>}
          </div>
          {t && <div class="small muted num">{Math.round(((n.kcal ?? 0) / t.kcal) * 100)}% of today's target</div>}
        </div>
        <div style={{ margin: '14px 0' }}><MacroSplit n={n} /></div>
        <div class="kv">
          <div><div class="k c-protein">Protein</div><div class="v">{trimNum(n.protein ?? 0, 1)} g</div></div>
          <div><div class="k c-fat">Fat</div><div class="v">{trimNum(n.fat ?? 0, 1)} g</div></div>
          <div><div class="k c-carbs">Carbs</div><div class="v">{trimNum(n.carbs ?? 0, 1)} g</div></div>
        </div>
      </div>

      <div class="section-label">
        Nutrition
        <button class="text-btn muted" onClick={() => setShowAll(!showAll)}>{showAll ? 'Less' : 'All nutrients'}</button>
      </div>
      <div class="list">
        <NutrientTable n={n} groups={showAll ? ['macro', 'carb', 'fat', 'mineral', 'vitamin', 'other'] : ['carb', 'fat', 'mineral']} />
      </div>
      {food.source === 'off' && <p class="hint pad">Crowd-sourced from package labels. Check against your package if something looks off.</p>}
      {food.source === 'ai' && <p class="hint pad">Estimated by an AI assistant from your description — treat as approximate.</p>}

      {entry && (
        <div class="btn-row" style={{ marginTop: 16 }}>
          <button class="btn ghost" onClick={async () => { await logFood(food, qty ?? entry.qty, unit, today(), meal); toast('Logged again today'); }}>Log again today</button>
          <button class="btn danger" onClick={async () => { await deleteEntries([entry]); exitFlow(`/log/${entry.date}`); }}>Delete</button>
        </div>
      )}
      {mode === 'recipe' && ingIndex != null && (
        <button class="btn danger block" style={{ marginTop: 16 }} onClick={removeIngredient}>Remove ingredient</button>
      )}

      <div class="footer-bar"><div><button class="btn block" disabled={!valid} onClick={primary}>{label}</button></div></div>
      {food.source === 'usda' && <p class="hint pad" style={{ marginTop: 16 }}>Values per {trimNum(grams, 1)} g from the USDA National Nutrient Database (SR28).</p>}
    </Screen>
  );
}
