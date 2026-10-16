import { useEffect, useMemo, useState } from 'preact/hooks';
import { Screen, TopBar, Segmented, Empty, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { back, go, qs } from '../router';
import { useAppState, useQuery } from '../lib/store';
import { all } from '../lib/db';
import { relativeDay, today } from '../lib/date';
import { displayServing, fmtQty, gramsFor, kcalPerServing, recipeToFood, type Food, type HistoryItem } from '../lib/foods';
import { searchUsda, normalize } from '../lib/usda';
import { fdcSearch, offSearch } from '../lib/online';
import { defaultMeal, foodCache, logFood } from '../lib/actions';

type Tab = 'recent' | 'frequent' | 'favorites' | 'mine' | 'recipes';

const SOURCE_LABEL: Record<string, string> = {
  usda: 'USDA', custom: 'Custom', off: 'Open Food Facts', fdc: 'USDA FDC', recipe: 'Recipe', ai: 'AI estimate', quick: 'Quick add',
};

export function AddFood({ q }: { q: URLSearchParams }) {
  const { settings } = useAppState();
  const mode = q.get('mode') === 'recipe' ? 'recipe' : 'log';
  const recipeId = q.get('recipe') ?? undefined;
  const date = q.get('date') ?? today();
  const [meal, setMeal] = useState(q.has('meal') ? Number(q.get('meal')) : defaultMeal());
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [usda, setUsda] = useState<Food[]>([]);
  const [usdaError, setUsdaError] = useState('');
  const [online, setOnline] = useState<{ off: Food[]; fdc: Food[]; errors: string[]; loading: boolean; q: string } | null>(null);

  const history = useQuery(() => all('history'), [], ['history']) ?? [];
  const myFoods = useQuery(() => all('foods'), [], ['foods']) ?? [];
  const recipes = useQuery(() => all('recipes'), [], ['recipes']) ?? [];
  const historyMap = useMemo(() => new Map(history.map((h) => [h.key, h])), [history]);

  useEffect(() => {
    const term = query.trim();
    setOnline(null);
    if (term.length < 2) { setUsda([]); return; }
    const t = setTimeout(() => {
      searchUsda(term).then((r) => { setUsda(r); setUsdaError(''); }).catch((e) => setUsdaError(e.message));
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  const extra = qs({ date, meal, mode: mode === 'recipe' ? 'recipe' : undefined, recipe: recipeId });
  const open = (food: Food) => {
    foodCache.set(food.id, food);
    go('/food' + qs({ key: food.id }) + extra.replace('?', '&'));
  };

  const quickLog = async (food: Food) => {
    const h = historyMap.get(food.id);
    const qty = h?.qty ?? 1;
    const unit = h?.unit ?? food.servings[0]?.label ?? 'g';
    const amount = food.servings.length || h ? { qty, unit } : { qty: 100, unit: food.liquid ? 'ml' : 'g' };
    await logFood(food, amount.qty, amount.unit, date, meal);
    toast(`Added ${food.name.split(',')[0]} · ${fmtQty(amount.qty, amount.unit)}`);
  };

  const searchOnline = async () => {
    const term = query.trim();
    setOnline({ off: [], fdc: [], errors: [], loading: true, q: term });
    const [off, fdc] = await Promise.allSettled([offSearch(term), fdcSearch(term, settings.fdcKey)]);
    setOnline({
      off: off.status === 'fulfilled' ? off.value : [],
      fdc: fdc.status === 'fulfilled' ? fdc.value : [],
      errors: [off, fdc].flatMap((r, i) => (r.status === 'rejected' ? [`${i ? 'USDA' : 'Open Food Facts'}: ${(r.reason as Error).message}`] : [])),
      loading: false,
      q: term,
    });
  };

  const term = normalize(query);
  const recipeFoods = recipes.filter((r) => r.ingredients.length && r.id !== recipeId).map(recipeToFood);
  const localMatches = term.length >= 1 ? dedupe([...myFoods, ...recipeFoods, ...history.map((h) => h.food)])
    .filter((f) => term.split(' ').every((t) => normalize(`${f.name} ${f.brand ?? ''}`).includes(t)))
    .sort((a, b) => (historyMap.get(b.id)?.count ?? 0) - (historyMap.get(a.id)?.count ?? 0))
    .slice(0, 12) : [];
  const localIds = new Set(localMatches.map((f) => f.id));

  let list: { food: Food; h?: HistoryItem }[] = [];
  if (tab === 'recent') list = history.filter((h) => h.count > 0).sort((a, b) => b.last - a.last).slice(0, 60).map((h) => ({ food: h.food, h }));
  if (tab === 'frequent') list = history.filter((h) => h.count > 1).sort((a, b) => b.count - a.count).slice(0, 60).map((h) => ({ food: h.food, h }));
  if (tab === 'favorites') list = history.filter((h) => h.fav).sort((a, b) => a.food.name.localeCompare(b.food.name)).map((h) => ({ food: h.food, h }));
  if (tab === 'mine') list = myFoods.filter((f) => f.source === 'custom' || f.source === 'off' || f.source === 'fdc').sort((a, b) => a.name.localeCompare(b.name)).map((food) => ({ food }));
  if (tab === 'recipes') list = recipeFoods.sort((a, b) => a.name.localeCompare(b.name)).map((food) => ({ food }));

  const title = mode === 'recipe' ? 'Add ingredient' : `${settings.meals[meal] ?? 'Add'} · ${relativeDay(date)}`;

  return (
    <Screen tabs={false}>
      <TopBar title={title} backTo={mode === 'recipe' ? `/recipe/${recipeId}` : '/log'} />

      {mode === 'log' && (
        <div class="scroll-x">
          {settings.meals.map((m, i) => <button key={m} class={`chip${i === meal ? ' on' : ''}`} onClick={() => setMeal(i)}>{m}</button>)}
        </div>
      )}

      <div class="search">
        <Icon name="search" />
        <input class="input" type="search" placeholder="Search foods, brands, restaurants" value={query} enterKeyHint="search"
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim().length >= 2) { (e.target as HTMLInputElement).blur(); } }} />
      </div>

      {!query && (
        <div class="actions">
          <button class="action" onClick={() => go('/scan' + extra)}><Icon name="barcode" />Scan</button>
          {mode === 'log' && <button class="action" onClick={() => go('/quick' + extra)}><Icon name="quick" />Quick add</button>}
          {mode === 'log' && <button class="action" onClick={() => go('/ai' + extra)}><Icon name="chat" />Describe</button>}
          <button class="action" onClick={() => go('/custom-food' + extra)}><Icon name="edit" />Create</button>
        </div>
      )}

      {query.trim().length >= 1 ? (
        <>
          {localMatches.length > 0 && (
            <>
              <div class="section-label">Your foods</div>
              <div class="list">{localMatches.map((f) => <FoodRow key={f.id} food={f} h={historyMap.get(f.id)} onOpen={open} onQuick={mode === 'log' ? quickLog : undefined} />)}</div>
            </>
          )}
          {usdaError && <div class="hint pad">{usdaError}</div>}
          {usda.length > 0 && (
            <>
              <div class="section-label">USDA database</div>
              <div class="list">{usda.filter((f) => !localIds.has(f.id)).slice(0, 40).map((f) => <FoodRow key={f.id} food={f} h={historyMap.get(f.id)} onOpen={open} onQuick={mode === 'log' ? quickLog : undefined} />)}</div>
            </>
          )}
          {query.trim().length >= 2 && (
            <>
              <div class="section-label">Brands &amp; packaged foods</div>
              {!online || online.q !== query.trim() ? (
                <button class="btn ghost block" onClick={searchOnline}>Search online for “{query.trim()}”</button>
              ) : online.loading ? (
                <div class="list"><div class="list-empty">Searching Open Food Facts and USDA…</div></div>
              ) : (
                <>
                  {online.errors.map((e) => <div class="hint pad" key={e}>{e}</div>)}
                  {online.fdc.length + online.off.length === 0 && !online.errors.length && <div class="list"><div class="list-empty">No online matches.</div></div>}
                  {online.fdc.length > 0 && <div class="list">{online.fdc.map((f) => <FoodRow key={f.id} food={f} onOpen={open} />)}</div>}
                  {online.off.length > 0 && <div class="list">{online.off.map((f) => <FoodRow key={f.id} food={f} onOpen={open} />)}</div>}
                </>
              )}
              <p class="hint pad" style={{ marginTop: 12 }}>
                Can't find it? <button class="link" onClick={() => go('/custom-food' + extra)}>Create a food</button>
                {mode === 'log' && <> or <button class="link" onClick={() => go('/ai' + qs({ date, meal, text: query.trim() }))}>describe it</button></>}.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <Segmented<Tab> value={tab} onChange={setTab} options={[['recent', 'Recent'], ['frequent', 'Frequent'], ['favorites', 'Saved'], ['mine', 'My foods'], ['recipes', 'Recipes']]} />
          {list.length ? (
            <div class="list">{list.map(({ food, h }) => <FoodRow key={food.id} food={food} h={h ?? historyMap.get(food.id)} onOpen={open} onQuick={mode === 'log' ? quickLog : undefined} />)}</div>
          ) : (
            <Empty title={{ recent: 'Nothing logged yet', frequent: 'No frequent foods yet', favorites: 'No saved foods', mine: 'No custom foods', recipes: 'No recipes or meals' }[tab]}>
              {{ recent: 'Search, scan a barcode, or describe a meal.', frequent: 'Foods you log often show up here.', favorites: 'Tap the star on any food to save it here.', mine: 'Create a food or scan a barcode.', recipes: 'Build recipes in More → Recipes & meals.' }[tab]}
            </Empty>
          )}
        </>
      )}
      <div class="spacer" />
      {mode === 'recipe' && <button class="btn ghost block" onClick={() => back(`/recipe/${recipeId}`)}>Done</button>}
    </Screen>
  );
}

function dedupe(foods: Food[]): Food[] {
  const seen = new Set<string>();
  return foods.filter((f) => !seen.has(f.id) && (seen.add(f.id), true));
}

export function FoodRow({ food, h, onOpen, onQuick }: { food: Food; h?: HistoryItem; onOpen: (f: Food) => void; onQuick?: (f: Food) => void }) {
  const serving = h ? fmtQty(h.qty, h.unit) : displayServing(food);
  const kcal = h ? ((food.per100.kcal ?? 0) * gramsFor(food, h.qty, h.unit)) / 100 : food.servings.length ? kcalPerServing(food) : food.per100.kcal ?? 0;
  return (
    <div class="item" style={{ padding: 0 }}>
      <button class="item" style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(food)}>
        <div class="grow">
          <div class="title clamp2">{food.name}</div>
          <div class="sub ellipsis">
            {food.brand ? `${food.brand} · ` : ''}{food.servings.length || h ? serving : '100 g'} · {SOURCE_LABEL[food.source]}
          </div>
        </div>
        <div class="value">{Math.round(kcal)}<span class="unit">kcal</span></div>
      </button>
      {onQuick && (
        <button class="icon-btn" style={{ marginRight: 6 }} aria-label={`Quick add ${food.name}`} onClick={() => onQuick(food)}>
          <Icon name="plus" size={20} />
        </button>
      )}
    </div>
  );
}

