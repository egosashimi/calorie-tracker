import { del, get, put, putMany, entriesOn } from './db';
import { makeEntry, uid, type Food, type HistoryItem, type LogEntry } from './foods';
import type { Day } from './date';
import { timeOn, today } from './date';
import { toast } from '../ui/components';
import { getState } from './store';

/** Foods fetched from the internet or generated in-app are kept locally so they work offline later. */
const PERSIST: Food['source'][] = ['off', 'fdc', 'ai'];

/** Short-lived cache so search results can be opened without saving them first. */
export const foodCache = new Map<string, Food>();

export function defaultMeal(): number {
  const meals = getState().settings.meals.length;
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const m = h < 10.5 ? 0 : h < 15 ? 1 : h < 21 ? 2 : 3;
  return Math.min(m, meals - 1);
}

export async function logFood(food: Food, qty: number, unit: string, date: Day, meal: number): Promise<LogEntry> {
  const time = date === today() ? Date.now() : timeOn(date);
  const entry = makeEntry(food, qty, unit, date, meal, time);
  await put('entries', entry);
  if (PERSIST.includes(food.source)) {
    const existing = await get('foods', food.id);
    if (!existing) await put('foods', { ...food, createdAt: Date.now() });
  }
  if (food.source !== 'quick') await touchHistory(food, qty, unit);
  return entry;
}

export async function touchHistory(food: Food, qty: number, unit: string) {
  const prev = await get('history', food.id);
  const item: HistoryItem = {
    key: food.id, food, qty, unit, last: Date.now(), count: (prev?.count ?? 0) + 1, fav: prev?.fav,
  };
  await put('history', item);
}

export async function toggleFavorite(food: Food): Promise<boolean> {
  const prev = await get('history', food.id);
  const fav = !prev?.fav;
  await put('history', prev ? { ...prev, fav } : {
    key: food.id, food, qty: 1, unit: food.servings[0]?.label ?? 'g', last: 0, count: 0, fav,
  });
  return fav;
}

export async function deleteEntries(entries: LogEntry[], label?: string) {
  for (const e of entries) await del('entries', e.id);
  toast(label ?? (entries.length === 1 ? 'Entry deleted' : `${entries.length} entries deleted`), {
    label: 'Undo', run: () => void putMany('entries', entries),
  });
}

export async function copyEntries(entries: LogEntry[], date: Day, meal?: number) {
  const copies = entries.map((e) => ({ ...e, id: uid(), date, meal: meal ?? e.meal, time: timeOn(date, new Date(e.time)) }));
  await putMany('entries', copies);
  return copies;
}

export async function copyDay(from: Day, to: Day) {
  const list = await entriesOn(from);
  if (!list.length) {
    toast('Nothing logged on that day');
    return;
  }
  const copies = await copyEntries(list, to);
  toast(`Copied ${copies.length} entries`, { label: 'Undo', run: () => copies.forEach((c) => void del('entries', c.id)) });
}
