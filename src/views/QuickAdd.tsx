import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, Field, toast } from '../ui/components';
import { exitFlow } from '../router';
import { useAppState } from '../lib/store';
import { get, put } from '../lib/db';
import { relativeDay, today } from '../lib/date';
import { makeEntry, perServingFood, uid, type LogEntry } from '../lib/foods';
import { defaultMeal, deleteEntries, logFood } from '../lib/actions';
import { macroKcal, type Nutrients } from '../lib/nutrients';

export function QuickAdd({ q }: { q: URLSearchParams }) {
  const { settings } = useAppState();
  const entryId = q.get('entry');
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [fiber, setFiber] = useState<number | null>(null);
  const [meal, setMeal] = useState(q.has('meal') ? Number(q.get('meal')) : defaultMeal());
  const date = entry?.date ?? q.get('date') ?? today();

  useEffect(() => {
    if (!entryId) return;
    get('entries', entryId).then((e) => {
      if (!e) return;
      setEntry(e); setName(e.food.name === 'Quick add' ? '' : e.food.name); setMeal(e.meal);
      setKcal(e.n.kcal ?? null); setProtein(e.n.protein ?? null); setCarbs(e.n.carbs ?? null); setFat(e.n.fat ?? null); setFiber(e.n.fiber ?? null);
    });
  }, [entryId]);

  const fromMacros = macroKcal({ protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 });
  const effectiveKcal = kcal ?? (fromMacros || null);
  const mismatch = kcal != null && fromMacros > 0 && Math.abs(kcal - fromMacros) > Math.max(25, kcal * 0.15);

  const save = async () => {
    if (effectiveKcal == null) return;
    const n: Nutrients = { kcal: effectiveKcal };
    if (protein != null) n.protein = protein;
    if (carbs != null) n.carbs = carbs;
    if (fat != null) n.fat = fat;
    if (fiber != null) n.fiber = fiber;
    const food = perServingFood({ id: entry?.food.id ?? `quick:${uid()}`, name: name.trim() || 'Quick add', source: 'quick' }, n);
    if (entry) {
      await put('entries', makeEntry(food, 1, 'serving', entry.date, meal, entry.time, entry.id));
      toast('Entry updated');
    } else {
      await logFood(food, 1, 'serving', date, meal);
      toast(`Added ${Math.round(effectiveKcal)} kcal`);
    }
    exitFlow(`/log/${date}`);
  };

  return (
    <Screen tabs={false}>
      <TopBar title={entry ? 'Edit quick add' : 'Quick add'} backTo="/log" />
      <div class="card">
        <Field label="Calories">
          <NumInput class="input" value={kcal} onChange={setKcal} placeholder={fromMacros ? `${Math.round(fromMacros)} from macros` : 'kcal'} autoFocus={!entryId} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Field label={<span class="c-protein">Protein g</span>}><NumInput class="input" value={protein} onChange={setProtein} /></Field>
          <Field label={<span class="c-fat">Fat g</span>}><NumInput class="input" value={fat} onChange={setFat} /></Field>
          <Field label={<span class="c-carbs">Carbs g</span>}><NumInput class="input" value={carbs} onChange={setCarbs} /></Field>
        </div>
        <Field label="Fiber g (optional)"><NumInput class="input" value={fiber} onChange={setFiber} /></Field>
        <Field label="Name (optional)">
          <input class="input" value={name} placeholder="e.g. Coffee shop muffin" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        {mismatch && <div class="hint">Heads up: these macros add up to {Math.round(fromMacros)} kcal.</div>}
      </div>
      <div class="chips" style={{ margin: '4px 0 6px' }}>
        {settings.meals.map((m, i) => <button key={m} class={`chip${i === meal ? ' on' : ''}`} onClick={() => setMeal(i)}>{m}</button>)}
      </div>
      <div class="hint pad">{relativeDay(date)}</div>
      {entry && <button class="btn danger block" style={{ marginTop: 16 }} onClick={async () => { await deleteEntries([entry]); exitFlow(`/log/${entry.date}`); }}>Delete</button>}
      <div class="footer-bar"><div><button class="btn block" disabled={effectiveKcal == null} onClick={save}>{entry ? 'Save' : 'Add'}</button></div></div>
    </Screen>
  );
}
