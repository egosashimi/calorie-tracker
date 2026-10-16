import { useState } from 'preact/hooks';
import { Screen, TopBar, Bar, MacroLine, Sheet, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { go, qs } from '../router';
import { useAppState, useQuery } from '../lib/store';
import { entriesBetween, entriesOn, get, put } from '../lib/db';
import { addDays, fmtDay, fmtTime, relativeDay, today, weekday, WEEKDAYS, type Day } from '../lib/date';
import { sum } from '../lib/nutrients';
import { targetsFor } from '../lib/program';
import { fmtQty, uid, type LogEntry, type Recipe } from '../lib/foods';
import { copyDay, copyEntries, deleteEntries } from '../lib/actions';
import { WeightSheet } from './Weight';

export function Log({ day: dayParam }: { day?: string }) {
  const { settings, program } = useAppState();
  const day: Day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today();
  const entries = useQuery(() => entriesOn(day), [day], ['entries']) ?? [];
  const dayRec = useQuery(() => get('days', day), [day], ['days']);
  const weekStart = addDays(day, -weekday(day));
  const weekEntries = useQuery(() => entriesBetween(weekStart, addDays(weekStart, 6)), [weekStart], ['entries']) ?? [];
  const [menu, setMenu] = useState<null | 'day' | number>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [weighOpen, setWeighOpen] = useState(false);
  const [note, setNote] = useState('');

  const n = sum(entries.map((e) => e.n));
  const t = targetsFor(program, day);
  const setDay = (d: Day) => go(`/log/${d}`, { replace: true });
  const daysWithFood = new Set(weekEntries.map((e) => e.date));

  const updateDay = async (patch: Record<string, unknown>) => {
    const cur = (await get('days', day)) ?? { date: day };
    await put('days', { ...cur, ...patch });
  };

  const saveAsRecipe = async (list: LogEntry[], name: string) => {
    const r: Recipe = {
      id: uid(), name, servings: 1, createdAt: Date.now(), updatedAt: Date.now(),
      ingredients: list.map((e) => ({ food: e.food, qty: e.qty, unit: e.unit, grams: e.grams })),
    };
    await put('recipes', r);
    toast('Saved as a meal', { label: 'Open', run: () => go(`/recipe/${r.id}`) });
  };

  const meals = settings.meals;
  const mealMenu = typeof menu === 'number' ? menu : null;
  const mealEntries = (m: number) => entries.filter((e) => e.meal === m || (m === meals.length - 1 && e.meal >= meals.length));

  return (
    <Screen>
      <TopBar
        title={relativeDay(day)}
        left={day !== today() ? <button class="text-btn" onClick={() => setDay(today())}>Today</button> : undefined}
        right={<button class="icon-btn" aria-label="Day options" onClick={() => setMenu('day')}><Icon name="more" /></button>}
      />

      <div class="daystrip">
        <button class="icon-btn" aria-label="Previous week" onClick={() => setDay(addDays(day, -7))}><Icon name="back" size={18} /></button>
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
          <button key={d} class={`d${d === day ? ' on' : ''}`} onClick={() => setDay(d)}>
            {WEEKDAYS[weekday(d)][0]}
            <b>{Number(d.slice(8))}</b>
            <span class={`pip${daysWithFood.has(d) ? '' : ' none'}`} />
          </button>
        ))}
        <button class="icon-btn" aria-label="Next week" onClick={() => setDay(addDays(day, 7))}><Icon name="forward" size={18} /></button>
      </div>

      <div class="card">
        <div class="row between" style={{ alignItems: 'baseline' }}>
          <div class="mid">{Math.round(n.kcal ?? 0).toLocaleString()}<span class="unit">{t ? `/ ${t.kcal.toLocaleString()} kcal` : 'kcal'}</span></div>
          <MacroLine n={n} />
        </div>
        {t && <div style={{ marginTop: 10 }}><Bar value={n.kcal ?? 0} max={t.kcal} /></div>}
        {dayRec?.incomplete && <div class="hint" style={{ marginTop: 10 }}>Marked incomplete — excluded from expenditure.</div>}
      </div>

      {meals.map((name, m) => {
        const list = mealEntries(m);
        const mn = sum(list.map((e) => e.n));
        return (
          <div class="list" key={m}>
            <div class="meal-head">
              <button class="text-btn" style={{ padding: 0 }} onClick={() => list.length && setMenu(m)}>
                <span class="name">{name}</span>
              </button>
              <span class="kcal">{list.length ? `${Math.round(mn.kcal ?? 0)} kcal` : ''}</span>
            </div>
            {list.map((e) => (
              <button key={e.id} class="entry" onClick={() => go(e.food.source === 'quick' ? `/quick${qs({ entry: e.id })}` : `/food${qs({ entry: e.id })}`)}>
                <div class="grow">
                  <div class="clamp2">{e.food.name}</div>
                  <div class="tiny muted ellipsis">
                    {e.food.source === 'quick' ? 'Quick add' : fmtQty(e.qty, e.unit)}{e.food.brand ? ` · ${e.food.brand}` : ''} · {fmtTime(e.time)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div class="k">{Math.round(e.n.kcal ?? 0)}</div>
                  <div class="tiny faint num">{Math.round(e.n.protein ?? 0)}P {Math.round(e.n.fat ?? 0)}F {Math.round(e.n.carbs ?? 0)}C</div>
                </div>
              </button>
            ))}
            <button class="add-row" onClick={() => go('/add' + qs({ date: day, meal: m }))}><Icon name="plus" />Add food</button>
          </div>
        );
      })}

      <div class="list">
        <button class="item" onClick={() => go('/nutrients' + qs({ date: day }))}>
          <Icon name="leaf" class="muted" /><span class="grow">Nutrients</span><Icon name="chevron" class="chev" size={18} />
        </button>
        <button class="item" onClick={() => { setNote(dayRec?.note ?? ''); setNoteOpen(true); }}>
          <Icon name="note" class="muted" />
          <span class="grow ellipsis">{dayRec?.note ? dayRec.note : <span class="muted">Add a note</span>}</span>
        </button>
      </div>

      <Sheet open={menu === 'day'} onClose={() => setMenu(null)} title={fmtDay(day, { weekday: true })}>
        <div class="list">
          <button class="item" onClick={() => { setMenu(null); setWeighOpen(true); }}>
            <Icon name="scale" class="muted" /><span class="grow">Log weight for this day</span>
          </button>
          <button class="item" onClick={async () => { setMenu(null); await copyDay(addDays(day, -1), day); }}>
            <Icon name="copy" class="muted" /><span class="grow">Copy previous day here</span>
          </button>
          {day !== today() && entries.length > 0 && (
            <button class="item" onClick={async () => { setMenu(null); await copyEntries(entries, today()); toast('Copied to today'); }}>
              <Icon name="copy" class="muted" /><span class="grow">Copy this day to today</span>
            </button>
          )}
          <button class="item" onClick={() => { updateDay({ incomplete: !dayRec?.incomplete }); setMenu(null); }}>
            <Icon name="info" class="muted" />
            <span class="grow">{dayRec?.incomplete ? 'Mark as complete' : 'Mark as incomplete'}<div class="sub">Incomplete days are left out of the expenditure estimate.</div></span>
          </button>
          {entries.length > 0 && (
            <button class="item" onClick={() => { setMenu(null); if (confirm('Delete everything logged on this day?')) deleteEntries(entries, 'Day cleared'); }}>
              <Icon name="trash" class="muted" /><span class="grow" style={{ color: 'var(--warn)' }}>Clear day</span>
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={mealMenu != null} onClose={() => setMenu(null)} title={mealMenu != null ? meals[mealMenu] : ''}>
        {mealMenu != null && (
          <div class="list">
            <button class="item" onClick={async () => { const l = mealEntries(mealMenu); setMenu(null); await copyEntries(l, today(), mealMenu); toast(`Copied to today's ${meals[mealMenu].toLowerCase()}`); }}>
              <Icon name="copy" class="muted" /><span class="grow">Copy to today</span>
            </button>
            <button class="item" onClick={async () => { const l = mealEntries(mealMenu); setMenu(null); await copyEntries(l, addDays(day, 1), mealMenu); toast('Copied to the next day'); }}>
              <Icon name="copy" class="muted" /><span class="grow">Copy to next day</span>
            </button>
            <button class="item" onClick={() => {
              const l = mealEntries(mealMenu); setMenu(null);
              const name = prompt('Name this meal', `${meals[mealMenu]} ${fmtDay(day)}`);
              if (name) saveAsRecipe(l, name);
            }}>
              <Icon name="book" class="muted" /><span class="grow">Save as a meal<div class="sub">Reuse it from Recipes &amp; meals.</div></span>
            </button>
            <button class="item" onClick={() => { const l = mealEntries(mealMenu); setMenu(null); deleteEntries(l, `${meals[mealMenu]} cleared`); }}>
              <Icon name="trash" class="muted" /><span class="grow" style={{ color: 'var(--warn)' }}>Delete all</span>
            </button>
          </div>
        )}
      </Sheet>

      <WeightSheet open={weighOpen} date={day} onClose={() => setWeighOpen(false)} />

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Note">
        <textarea class="textarea" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} placeholder="How did today go?" />
        <div class="spacer" />
        <div class="btn-row">
          {dayRec?.note && <button class="btn ghost" onClick={async () => { await updateDay({ note: undefined }); setNoteOpen(false); }}>Remove</button>}
          <button class="btn" onClick={async () => { await updateDay({ note: note.trim() || undefined }); setNoteOpen(false); }}>Save</button>
        </div>
      </Sheet>
    </Screen>
  );
}

