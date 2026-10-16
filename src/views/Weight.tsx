import { useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, Field, Sheet, Empty, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { useAppState, useQuery } from '../lib/store';
import { all, del, get, put, putMany, type MetricRecord, type WeightRecord } from '../lib/db';
import { fmtDay, today, type Day } from '../lib/date';
import { computeTrend } from '../lib/trend';
import { CM_PER_IN, fmtWeight, fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { parseWeightCsv } from '../lib/backup';

const MEASURES: { key: keyof Omit<MetricRecord, 'date' | 'bodyFat'>; label: string }[] = [
  { key: 'waist', label: 'Waist' }, { key: 'hips', label: 'Hips' }, { key: 'chest', label: 'Chest' },
  { key: 'neck', label: 'Neck' }, { key: 'arm', label: 'Arm' }, { key: 'thigh', label: 'Thigh' },
];

export function WeightLog() {
  const { settings } = useAppState();
  const unit = settings.weightUnit;
  const lenUnit = settings.heightUnit;
  const weights = useQuery(() => all('weights'), [], ['weights']) ?? [];
  const metrics = useQuery(() => all('metrics'), [], ['metrics']) ?? [];
  const [date, setDate] = useState<Day>(today());
  const [w, setW] = useState<number | null>(null);
  const [bf, setBf] = useState<number | null>(null);
  const [m, setM] = useState<Record<string, number | null>>({});
  const [showMeasures, setShowMeasures] = useState(false);
  const [editing, setEditing] = useState<WeightRecord | null>(null);
  const [editVal, setEditVal] = useState<number | null>(null);

  const trend = computeTrend(weights);
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  const toLen = (cm: number) => (lenUnit === 'in' ? cm / CM_PER_IN : cm);
  const fromLen = (v: number) => (lenUnit === 'in' ? v * CM_PER_IN : v);

  const save = async () => {
    if (w && w > 0) await put('weights', { date, kg: fromDisplayWeight(w, unit), time: Date.now() });
    const hasMetric = bf != null || Object.values(m).some((v) => v != null);
    if (hasMetric) {
      const cur = (await get('metrics', date)) ?? { date };
      const rec: MetricRecord = { ...cur };
      if (bf != null) rec.bodyFat = bf;
      for (const { key } of MEASURES) if (m[key] != null) rec[key] = fromLen(m[key]!);
      await put('metrics', rec);
    }
    setW(null); setBf(null); setM({});
    toast('Saved');
  };

  const importCsv = async (file: File) => {
    const rows = parseWeightCsv(await file.text(), unit);
    if (!rows.length) { toast('No "date,weight" rows found'); return; }
    await putMany('weights', rows);
    toast(`Imported ${rows.length} weigh-ins`);
  };

  const sortedMetrics = [...metrics].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Screen tabs={false}>
      <TopBar title="Weight & body" backTo="/progress" />
      <div class="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Date"><input class="input" type="date" value={date} max={today()} onChange={(e) => setDate((e.target as HTMLInputElement).value || today())} /></Field>
          <Field label={`Weight (${unit})`}><NumInput class="input" value={w} onChange={setW} placeholder={unit} /></Field>
        </div>
        <button class="text-btn muted" style={{ padding: '0 0 8px' }} onClick={() => setShowMeasures(!showMeasures)}>
          {showMeasures ? 'Hide' : 'Add'} body fat &amp; measurements
        </button>
        {showMeasures && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <Field label="Body fat %"><NumInput class="input" value={bf} onChange={setBf} /></Field>
            {MEASURES.map(({ key, label }) => (
              <Field key={key} label={`${label} (${lenUnit})`}><NumInput class="input" value={m[key] ?? null} onChange={(v) => setM({ ...m, [key]: v })} /></Field>
            ))}
          </div>
        )}
        <button class="btn block" disabled={!(w && w > 0) && bf == null && !Object.values(m).some((v) => v != null)} onClick={save}>Save</button>
      </div>
      <p class="hint pad">Weigh yourself first thing in the morning, after the bathroom and before eating. Daily fluctuations are normal — the trend line filters them out.</p>

      <div class="section-label">History <label class="text-btn muted" style={{ cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importCsv(f); }} /></label></div>
      {!sorted.length ? <Empty title="No weigh-ins yet">CSV import expects lines like <code>2026-01-31,182.4</code> in your chosen unit.</Empty> : (
        <div class="list">
          {sorted.slice(0, 400).map((r) => (
            <button class="item" key={r.date} onClick={() => { setEditing(r); setEditVal(Number(toDisplayWeight(r.kg, unit).toFixed(1))); }}>
              <span class="grow">{fmtDay(r.date, { weekday: true, year: r.date.slice(0, 4) !== today().slice(0, 4) })}</span>
              <span class="muted small num">trend {fmtWeight(trend.get(r.date), unit)}</span>
              <span class="value" style={{ minWidth: 64, textAlign: 'right' }}>{fmtWeight(r.kg, unit)}</span>
            </button>
          ))}
        </div>
      )}

      {sortedMetrics.length > 0 && (
        <>
          <div class="section-label">Measurements</div>
          <div class="list">
            {sortedMetrics.map((r) => (
              <div class="item" key={r.date} style={{ display: 'block' }}>
                <div class="row between">
                  <span>{fmtDay(r.date, { year: true })}</span>
                  <button class="icon-btn" aria-label="Delete measurements" onClick={() => del('metrics', r.date)}><Icon name="trash" size={18} /></button>
                </div>
                <div class="small muted num">
                  {[r.bodyFat != null ? `Body fat ${r.bodyFat}%` : null, ...MEASURES.map(({ key, label }) => (r[key] != null ? `${label} ${toLen(r[key]!).toFixed(1)} ${lenUnit}` : null))].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? fmtDay(editing.date, { weekday: true, year: true }) : ''}>
        <Field label={`Weight (${unit})`}><NumInput class="input" value={editVal} onChange={setEditVal} /></Field>
        <div class="btn-row">
          <button class="btn danger" onClick={async () => { const r = editing!; await del('weights', r.date); setEditing(null); toast('Deleted', { label: 'Undo', run: () => void put('weights', r) }); }}>Delete</button>
          <button class="btn" disabled={!editVal} onClick={async () => { await put('weights', { ...editing!, kg: fromDisplayWeight(editVal!, unit) }); setEditing(null); }}>Save</button>
        </div>
      </Sheet>
    </Screen>
  );
}
