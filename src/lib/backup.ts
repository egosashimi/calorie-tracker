import { all, clearAll, putMany, STORES, type StoreName } from './db';
import { dayKey, type Day } from './date';
import { totalsByDay } from './stats';
import { fromDisplayWeight, type WeightUnit } from './units';

export interface BackupFile { app: 'tally'; version: 1; exportedAt: string; data: Record<StoreName, unknown[]> }

export async function buildBackup(): Promise<BackupFile> {
  const data = {} as Record<StoreName, unknown[]>;
  for (const s of STORES) data[s] = await all(s);
  return { app: 'tally', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function restoreBackup(file: BackupFile, mode: 'replace' | 'merge') {
  if (file?.app !== 'tally' || !file.data) throw new Error("This doesn't look like a Tally backup file.");
  if (mode === 'replace') await clearAll();
  for (const s of STORES) {
    const rows = file.data[s];
    if (Array.isArray(rows) && rows.length) await putMany(s, rows as any);
  }
}

/** Save a file: share sheet on iOS (lets you pick Files / iCloud Drive), download elsewhere. */
export async function saveFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportBackup() {
  const b = await buildBackup();
  await saveFile(`tally-backup-${dayKey()}.json`, JSON.stringify(b), 'application/json');
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv() {
  const [entries, weights] = await Promise.all([all('entries'), all('weights')]);
  const totals = totalsByDay(entries);
  const wmap = new Map(weights.map((w) => [w.date, w.kg]));
  const dates = [...new Set([...totals.keys(), ...wmap.keys()])].sort();
  const keys = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'] as const;
  const rows = [['date', 'weight_kg', ...keys].join(',')];
  for (const d of dates) {
    const n = totals.get(d) ?? {};
    rows.push([d, wmap.get(d)?.toFixed(2) ?? '', ...keys.map((k) => (n[k] != null ? n[k]!.toFixed(1) : ''))].map(csvCell).join(','));
  }
  await saveFile(`tally-daily-${dayKey()}.csv`, rows.join('\n'), 'text/csv');
}

/** Parse "date,weight" lines (YYYY-MM-DD, MM/DD/YYYY or DD.MM.YYYY). Header lines are skipped. */
export function parseWeightCsv(text: string, unit: WeightUnit): { date: Day; kg: number }[] {
  const out: { date: Day; kg: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) continue;
    const date = parseDate(cells[0]);
    const w = Number(cells[1].replace(/[^\d.]/g, ''));
    if (!date || !(w > 0)) continue;
    out.push({ date, kg: fromDisplayWeight(w, unit) });
  }
  return out;
}

function parseDate(s: string): Day | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
