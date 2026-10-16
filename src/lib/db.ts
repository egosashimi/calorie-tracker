import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Food, HistoryItem, LogEntry, Recipe } from './foods';
import type { Day } from './date';

export interface WeightRecord { date: Day; kg: number; time?: number }
export interface MetricRecord {
  date: Day;
  bodyFat?: number;
  waist?: number; hips?: number; chest?: number; neck?: number; arm?: number; thigh?: number;
}
export interface DayRecord { date: Day; waterMl?: number; steps?: number; note?: string; incomplete?: boolean }

interface Schema extends DBSchema {
  entries: { key: string; value: LogEntry; indexes: { date: string } };
  foods: { key: string; value: Food; indexes: { barcode: string } };
  recipes: { key: string; value: Recipe };
  history: { key: string; value: HistoryItem };
  weights: { key: string; value: WeightRecord };
  metrics: { key: string; value: MetricRecord };
  days: { key: string; value: DayRecord };
  kv: { key: string; value: { k: string; v: unknown } };
}

export type StoreName = 'entries' | 'foods' | 'recipes' | 'history' | 'weights' | 'metrics' | 'days' | 'kv';
export const STORES: StoreName[] = ['entries', 'foods', 'recipes', 'history', 'weights', 'metrics', 'days', 'kv'];

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>('tally', 1, {
    upgrade(d) {
      const e = d.createObjectStore('entries', { keyPath: 'id' });
      e.createIndex('date', 'date');
      const f = d.createObjectStore('foods', { keyPath: 'id' });
      f.createIndex('barcode', 'barcode');
      d.createObjectStore('recipes', { keyPath: 'id' });
      d.createObjectStore('history', { keyPath: 'key' });
      d.createObjectStore('weights', { keyPath: 'date' });
      d.createObjectStore('metrics', { keyPath: 'date' });
      d.createObjectStore('days', { keyPath: 'date' });
      d.createObjectStore('kv', { keyPath: 'k' });
    },
  });
  return dbp;
}

// ---- change notifications so views can re-query ----
type Listener = (store: StoreName) => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(store: StoreName) {
  for (const l of listeners) l(store);
}

export async function put<S extends StoreName>(store: S, value: Schema[S]['value']) {
  await (await db()).put(store, value as any);
  emit(store);
}

export async function putMany<S extends StoreName>(store: S, values: Schema[S]['value'][]) {
  const tx = (await db()).transaction(store, 'readwrite');
  await Promise.all([...values.map((v) => tx.store.put(v as any)), tx.done]);
  emit(store);
}

export async function del(store: StoreName, key: string) {
  await (await db()).delete(store, key);
  emit(store);
}

export async function get<S extends StoreName>(store: S, key: string): Promise<Schema[S]['value'] | undefined> {
  return (await db()).get(store, key) as any;
}

export async function all<S extends StoreName>(store: S): Promise<Schema[S]['value'][]> {
  return (await db()).getAll(store) as any;
}

export async function entriesOn(date: Day): Promise<LogEntry[]> {
  const list = await (await db()).getAllFromIndex('entries', 'date', date);
  return list.sort((a, b) => a.meal - b.meal || a.time - b.time);
}

export async function entriesBetween(start: Day, end: Day): Promise<LogEntry[]> {
  return (await db()).getAllFromIndex('entries', 'date', IDBKeyRange.bound(start, end));
}

export async function foodByBarcode(code: string): Promise<Food | undefined> {
  const d = await db();
  for (const c of barcodeVariants(code)) {
    const f = await d.getFromIndex('foods', 'barcode', c);
    if (f) return f;
  }
  return undefined;
}

/** UPC-A / EAN-13 / GTIN-14 representations of the same product code. */
export function barcodeVariants(code: string): string[] {
  const core = code.replace(/\D/g, '').replace(/^0+/, '');
  if (!core) return [code];
  const out = new Set<string>([code]);
  for (const len of [8, 12, 13, 14]) if (core.length <= len) out.add(core.padStart(len, '0'));
  return [...out];
}

export async function getKV<T>(k: string): Promise<T | undefined> {
  const r = await (await db()).get('kv', k);
  return r?.v as T | undefined;
}

export async function setKV(k: string, v: unknown) {
  await (await db()).put('kv', { k, v });
  emit('kv');
}

export async function clearAll() {
  const d = await db();
  const tx = d.transaction(STORES, 'readwrite');
  await Promise.all([...STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
  for (const s of STORES) emit(s);
}
