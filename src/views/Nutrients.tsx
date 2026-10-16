import { useState } from 'preact/hooks';
import { Screen, TopBar, Segmented } from '../ui/components';
import { useQuery } from '../lib/store';
import { entriesBetween, all } from '../lib/db';
import { addDays, fmtDay, relativeDay, today, type Day } from '../lib/date';
import { NUTRIENTS, addInto, fmtAmount, type NutrientKey, type Nutrients } from '../lib/nutrients';

const GROUPS: [string, string][] = [['macro', 'Macronutrients'], ['carb', 'Carbohydrates'], ['fat', 'Fats'], ['mineral', 'Minerals'], ['vitamin', 'Vitamins'], ['other', 'Other']];

export function NutrientsView({ q }: { q: URLSearchParams }) {
  const date: Day = q.get('date') ?? today();
  const [range, setRange] = useState<number>(Number(q.get('range')) || 1);
  const end = range === 1 ? date : addDays(today(), -1);
  const start = range === 1 ? date : addDays(end, -(range - 1));
  const data = useQuery(async () => {
    const [entries, days] = await Promise.all([entriesBetween(start, end), all('days')]);
    const incomplete = new Set(days.filter((d) => d.incomplete).map((d) => d.date));
    const used = entries.filter((e) => range === 1 || !incomplete.has(e.date));
    const dayCount = new Set(used.map((e) => e.date)).size;
    const totals: Nutrients = {};
    const coverage: Partial<Record<NutrientKey, number>> = {};
    for (const e of used) {
      addInto(totals, e.n);
      for (const k in e.n) coverage[k as NutrientKey] = (coverage[k as NutrientKey] ?? 0) + (e.n.kcal ?? 0);
    }
    const kcal = totals.kcal ?? 0;
    if (dayCount > 1) for (const k in totals) (totals as any)[k] /= dayCount;
    return { totals, coverage, kcal, dayCount };
  }, [start, end, range], ['entries', 'days']);

  return (
    <Screen tabs={false}>
      <TopBar title="Nutrients" backTo="/log" />
      <Segmented<number> value={range} onChange={setRange} options={[[1, relativeDay(date) === 'Today' ? 'Today' : fmtDay(date)], [7, '7 days'], [30, '30 days'], [90, '90 days']]} />
      {range > 1 && <p class="hint pad" style={{ marginTop: -4 }}>Daily average over {data?.dayCount ?? 0} logged day{data?.dayCount === 1 ? '' : 's'} ({fmtDay(start)} – {fmtDay(end)}).</p>}
      {GROUPS.map(([g, label]) => {
        const defs = NUTRIENTS.filter((d) => d.group === g || (g === 'macro' && d.group === 'energy'));
        return (
          <div key={g}>
            <div class="section-label">{label}</div>
            <div class="list">
              {defs.map((d) => {
                const v = data?.totals[d.key];
                const pct = d.dv && v != null ? (v / d.dv) * 100 : null;
                const cov = data && data.kcal > 0 ? (data.coverage[d.key] ?? 0) / data.kcal : 0;
                return (
                  <div class="nt-row" key={d.key} style={{ display: 'block' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 48px', gap: 10 }}>
                      <span>{d.label}{cov > 0 && cov < 0.9 && <span class="pill" style={{ marginLeft: 6 }} title="Some logged foods have no data for this nutrient">partial</span>}</span>
                      <span class="amt">{v == null ? '—' : `${fmtAmount(v, d.unit)} ${d.unit}`}</span>
                      <span class="dv">{pct == null ? '' : `${Math.round(pct)}%`}</span>
                    </div>
                    {pct != null && (
                      <div class="bar thin" style={{ marginTop: 6 }}>
                        <i style={{ width: `${Math.min(100, pct)}%`, background: d.limit ? (pct > 100 ? 'var(--warn)' : 'var(--ink-2)') : pct >= 100 ? 'var(--good)' : 'var(--ink-2)' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p class="hint pad">Percentages are FDA Daily Values. Saturated fat, sodium, cholesterol and added sugars are upper limits. “Partial” means some foods you logged (often quick adds, AI estimates or package labels) don't list that nutrient, so the true total is likely higher.</p>
    </Screen>
  );
}
