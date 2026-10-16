import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, Empty, NumInput, Field, MacroSplit, NutrientTable, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { back, go, qs } from '../router';
import { useQuery } from '../lib/store';
import { all, del, get, put } from '../lib/db';
import { fmtQty, nutrientsFor, recipeToFood, recipeTotals, uid, type Recipe } from '../lib/foods';
import { scale } from '../lib/nutrients';
import { trimNum } from '../lib/units';
import { foodCache } from '../lib/actions';

export function RecipeList() {
  const recipes = useQuery(() => all('recipes'), [], ['recipes']) ?? [];
  useEffect(() => {
    // tidy up recipes that were started but never filled in
    for (const r of recipes) if (!r.ingredients.length && r.name === 'New recipe' && Date.now() - r.updatedAt > 3600e3) del('recipes', r.id);
  }, [recipes.length]);

  const create = async () => {
    const r: Recipe = { id: uid(), name: 'New recipe', servings: 1, ingredients: [], createdAt: Date.now(), updatedAt: Date.now() };
    await put('recipes', r);
    go(`/recipe/${r.id}`);
  };

  const sorted = [...recipes].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Screen tabs={false}>
      <TopBar title="Recipes & meals" backTo="/more" right={<button class="icon-btn" aria-label="New recipe" onClick={create}><Icon name="plus" /></button>} />
      {!sorted.length ? (
        <Empty title="No recipes yet">
          Add ingredients once, then log a serving in one tap. You can also save any logged meal from the food log.
          <div class="spacer" /><button class="btn" onClick={create}>New recipe</button>
        </Empty>
      ) : (
        <div class="list">
          {sorted.map((r) => {
            const f = recipeToFood(r);
            const perServing = f.noGrams ? f.per100 : scale(f.per100, f.servings[0].g / 100);
            return (
              <button class="item" key={r.id} onClick={() => go(`/recipe/${r.id}`)}>
                <div class="grow">
                  <div class="title ellipsis">{r.name}</div>
                  <div class="sub">{r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'} · {r.servings} serving{r.servings === 1 ? '' : 's'}</div>
                </div>
                <div class="value">{Math.round(perServing.kcal ?? 0)}<span class="unit">kcal</span></div>
              </button>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

export function RecipeEditor({ id }: { id?: string }) {
  const recipe = useQuery(() => (id ? get('recipes', id) : Promise.resolve(undefined)), [id], ['recipes']);
  const [draft, setDraft] = useState<Recipe | null>(null);
  useEffect(() => { if (recipe) setDraft(recipe); }, [recipe]);

  if (recipe === undefined && !draft) return <Screen tabs={false}><TopBar backTo="/recipes" /></Screen>;
  if (!draft) return <Screen tabs={false}><TopBar backTo="/recipes" /><Empty title="Recipe not found" /></Screen>;

  const save = async (patch: Partial<Recipe>) => {
    const next = { ...draft, ...patch, updatedAt: Date.now() };
    setDraft(next);
    await put('recipes', next);
  };

  const { n, rawGrams } = recipeTotals(draft);
  const food = recipeToFood(draft);
  const perServing = food.noGrams ? food.per100 : scale(food.per100, food.servings[0].g / 100);
  const unweighed = draft.ingredients.some((i) => i.food.noGrams);

  const logIt = () => {
    foodCache.set(food.id, food);
    go('/food' + qs({ key: food.id }));
  };

  return (
    <Screen tabs={false}>
      <TopBar title="Recipe" backTo="/recipes" right={<button class="text-btn" onClick={logIt} disabled={!draft.ingredients.length}>Log</button>} />
      <div class="card">
        <Field label="Name">
          <input class="input" value={draft.name} onFocus={(e) => draft.name === 'New recipe' && (e.target as HTMLInputElement).select()}
            onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })} onBlur={() => save({ name: draft.name.trim() || 'Untitled recipe' })} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Servings"><NumInput class="input" value={draft.servings} onChange={(v) => v && v > 0 && save({ servings: v })} /></Field>
          <Field label="Cooked weight (g)"><NumInput class="input" value={draft.cookedGrams ?? null} placeholder={rawGrams ? `${Math.round(rawGrams)} raw` : 'optional'} onChange={(v) => save({ cookedGrams: v && v > 0 ? v : undefined })} /></Field>
        </div>
        <p class="hint" style={{ margin: 0 }}>Weigh the finished dish to log exact portions by weight — water lost or absorbed in cooking is accounted for.</p>
      </div>

      <div class="section-label">Ingredients <span class="num">{Math.round(rawGrams)} g raw</span></div>
      <div class="list">
        {draft.ingredients.map((ing, i) => {
          const part = nutrientsFor(ing.food, ing.grams);
          return (
            <button class="item" key={i} onClick={() => go('/food' + qs({ mode: 'recipe', recipe: draft.id, ing: i }))}>
              <div class="grow"><div class="title ellipsis">{ing.food.name}</div><div class="sub">{fmtQty(ing.qty, ing.unit)}{!ing.food.noGrams && ing.unit !== 'g' ? ` · ${trimNum(ing.grams, 0)} g` : ''}</div></div>
              <div class="value">{Math.round(part.kcal ?? 0)}<span class="unit">kcal</span></div>
            </button>
          );
        })}
        <button class="add-row" onClick={() => go('/add' + qs({ mode: 'recipe', recipe: draft.id }))}><Icon name="plus" />Add ingredient</button>
      </div>
      {unweighed && <p class="hint pad">Some ingredients have no known weight, so this recipe is logged by serving only.</p>}

      {draft.ingredients.length > 0 && (
        <>
          <div class="section-label">Per serving</div>
          <div class="card">
            <div class="row between" style={{ alignItems: 'flex-end' }}>
              <div class="big">{Math.round(perServing.kcal ?? 0)}<span class="unit">kcal</span></div>
              {!food.noGrams && <div class="small muted">{Math.round(food.servings[0].g)} g per serving</div>}
            </div>
            <div style={{ margin: '14px 0' }}><MacroSplit n={perServing} /></div>
            <div class="kv">
              <div><div class="k c-protein">Protein</div><div class="v">{trimNum(perServing.protein ?? 0, 1)} g</div></div>
              <div><div class="k c-fat">Fat</div><div class="v">{trimNum(perServing.fat ?? 0, 1)} g</div></div>
              <div><div class="k c-carbs">Carbs</div><div class="v">{trimNum(perServing.carbs ?? 0, 1)} g</div></div>
            </div>
          </div>
          <div class="list"><NutrientTable n={perServing} groups={['carb', 'fat', 'mineral']} /></div>
          <p class="hint pad">Whole recipe: {Math.round(n.kcal ?? 0)} kcal.</p>
        </>
      )}

      <Field label="Notes">
        <textarea class="textarea" value={draft.notes ?? ''} placeholder="Method, links, tweaks…" onInput={(e) => setDraft({ ...draft, notes: (e.target as HTMLTextAreaElement).value })} onBlur={() => save({ notes: draft.notes })} />
      </Field>

      <div class="btn-row">
        <button class="btn ghost" onClick={async () => {
          const copy = { ...draft, id: uid(), name: `${draft.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
          await put('recipes', copy);
          go(`/recipe/${copy.id}`, { replace: true });
          toast('Recipe duplicated');
        }}>Duplicate</button>
        <button class="btn danger" onClick={async () => { if (confirm(`Delete "${draft.name}"?`)) { await del('recipes', draft.id); await del('history', `recipe:${draft.id}`); back('/recipes'); } }}>Delete</button>
      </div>
    </Screen>
  );
}
