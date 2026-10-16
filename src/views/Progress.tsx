import { useState } from 'preact/hooks';
import { Screen, Segmented, MacroSplit } from '../ui/components';
import { TimeChart } from '../ui/chart';
import { Icon } from '../ui/icons';
import { go } from '../router';
import { useAppState, useQuery } from '../lib/store';
import { analyze, averageOver } from '../lib/stats';
import { addDays, daysBetween, today, type Day } from '../lib/date';
import { targetsFor } from '../lib/program';
import { trendRate } from '../lib/trend';
import { fmtSigned, fmtWeight, toDisplayWeight } from '../lib/units';
import { KCAL_PER_KG } from '../lib/expenditure';

type Range = 30 | 90 | 182 | 365 | 0;

export function Progress() {
  const { settings, profile, program } = useAppState();
  const a = useQuery(() => analyze(profile), [profile], ['entries', 'weights', 'days']);
  const [range, setRange] = useState<Range>(30);
  const unit = settings.weightUnit;
  const end = today();

  if (!a) return <Screen><h1 class="page-title">Progress</h1></Screen>;

  const firstData = [a.weights[0]?.date, [...a.intake.keys()].sort()[0]].filter(Boolean).sort()[0] as Day | undefined;
  const start = range === 0 ? (firstData && firstData < addDays(end, -13) ? firstData : addDays(end, -29)) : addDays(end, -(range - 1));
  const span = daysBetween(start, end) + 1;

  const trendPts = [...a.trend].filter(([d]) => d >= start).map(([d, v]) => ({ d, v: toDisplayWeight(v, unit) }));
  const scalePts = a.weights.filter((w) => w.date >= start).map((w) => ({ d: w.date, v: toDisplayWeight(w.kg, unit) }));
  const trendStart = trendPts[0]?.v;
  const trendEnd = trendPts[trendPts.length - 1]?.v;
  const rate = trendRate(a.trend, end, 14);

  const expPts = a.expenditure.filter((p) => p.date >= start).map((p) => ({ d: p.date, v: p.value }));
  const intakePts = [...a.intake].filter(([d]) => d >= start && a.tracked.has(d)).map(([d, n]) => ({ d, v: n.kcal ?? 0 }));
  const targetPts = program ? Array.from({ length: span }, (_, i) => addDays(start, i)).map((d) => ({ d, v: targetsFor(program, d)?.kcal ?? 0 })).filter((p) => p.v) : [];
  const avg = averageOver(a.intake, a.tracked, addDays(end, -1), Math.min(span, 365 * 5));
  const avgExp = expPts.length ? expPts.reduce((s, p) => s + p.v, 0) / expPts.length : null;
  const balance = avgExp != null && avg.count ? avg.n.kcal! - avgExp : null;
  const toGoal = program?.targetKg && a.trendNow ? a.trendNow - program.targetKg : null;

  return (
    <Screen>
      <h1 class="page-title">Progress</h1>
      <Segmented<Range> value={range} onChange={setRange} options={[[30, '1M'], [90, '3M'], [182, '6M'], [365, '1Y'], [0, 'All']]} />

      <div class="section-label">Weight <button class="text-btn muted" onClick={() => go('/weight')}>Log &amp; history</button></div>
      <div class="card">
        <div class="kv" style={{ marginBottom: 12 }}>
          <div><div class="k">Trend</div><div class="v">{fmtWeight(a.trendNow ?? undefined, unit)} <span class="unit">{unit}</span></div></div>
          <div><div class="k">Change</div><div class="v">{trendStart != null && trendEnd != null ? fmtSigned(trendEnd - trendStart) : '—'} <span class="unit">{unit}</span></div></div>
          <div><div class="k">Rate</div><div class="v">{rate != null ? fmtSigned(toDisplayWeight(rate, unit), 2) : '—'} <span class="unit">/wk</span></div></div>
        </div>
        {scalePts.length ? (
          <TimeChart start={start} end={end} fmt={(v) => v.toFixed(unit === 'lb' && range !== 30 ? 0 : 1)} series={[
            { label: 'Scale weight', kind: 'dots', points: scalePts },
            { label: 'Trend weight', kind: 'line', points: trendPts },
          ]} />
        ) : <div class="hint">Log your weight each morning to see your trend. Daily weigh-ins give the most accurate expenditure.</div>}
        {toGoal != null && (
          <div class="hint" style={{ marginTop: 10 }}>
            Goal {fmtWeight(program!.targetKg, unit)} {unit} · {Math.abs(toDisplayWeight(toGoal, unit)).toFixed(1)} {unit} to go
          </div>
        )}
      </div>

      <div class="section-label">Expenditure</div>
      <div class="card">
        <div class="kv" style={{ marginBottom: 12 }}>
          <div><div class="k">Current</div><div class="v">{a.expenditureNow ? Math.round(a.expenditureNow).toLocaleString() : '—'}</div></div>
          <div><div class="k">Avg intake</div><div class="v">{avg.count ? Math.round(avg.n.kcal ?? 0).toLocaleString() : '—'}</div></div>
          <div><div class="k">Balance</div><div class="v">{balance != null ? fmtSigned(balance, 0) : '—'}</div></div>
        </div>
        {expPts.length > 1 || intakePts.length ? (
          <TimeChart start={start} end={end} zero={false} unit=" kcal" series={[
            { label: 'Intake', kind: 'bars', points: intakePts, color: 'var(--line-strong)' },
            ...(targetPts.length ? [{ label: 'Target', kind: 'step' as const, points: targetPts, color: 'var(--muted)', dashed: true }] : []),
            { label: 'Expenditure', kind: 'line', points: expPts },
          ]} />
        ) : <div class="hint">Expenditure appears once you have a few days of food and weight logged.</div>}
        {balance != null && (
          <p class="hint" style={{ marginBottom: 0 }}>
            An average {balance < 0 ? 'deficit' : 'surplus'} of {Math.abs(Math.round(balance))} kcal/day ≈ {fmtSigned(toDisplayWeight((balance * 7) / KCAL_PER_KG, unit), 2)} {unit}/week.
          </p>
        )}
      </div>

      <div class="section-label">Nutrition averages <span class="num">{avg.count} tracked day{avg.count === 1 ? '' : 's'}</span></div>
      <div class="card">
        {avg.count ? (
          <>
            <div class="kv">
              <div><div class="k">Calories</div><div class="v">{Math.round(avg.n.kcal ?? 0).toLocaleString()}</div></div>
              <div><div class="k">Fiber</div><div class="v">{Math.round(avg.n.fiber ?? 0)} g</div></div>
              <div><div class="k">Sodium</div><div class="v">{Math.round(avg.n.sodium ?? 0).toLocaleString()} mg</div></div>
            </div>
            <div style={{ margin: '14px 0 10px' }}><MacroSplit n={avg.n} /></div>
            <div class="kv">
              <div><div class="k c-protein">Protein</div><div class="v">{Math.round(avg.n.protein ?? 0)} g</div></div>
              <div><div class="k c-fat">Fat</div><div class="v">{Math.round(avg.n.fat ?? 0)} g</div></div>
              <div><div class="k c-carbs">Carbs</div><div class="v">{Math.round(avg.n.carbs ?? 0)} g</div></div>
            </div>
          </>
        ) : <div class="hint">No completed days in this range yet.</div>}
      </div>
      <div class="list">
        <button class="item" onClick={() => go(`/nutrients?range=${Math.min(span, 90)}`)}>
          <Icon name="leaf" class="muted" /><span class="grow">Micronutrient averages</span><Icon name="chevron" class="chev" size={18} />
        </button>
        <button class="item" onClick={() => go('/plan')}>
          <Icon name="plan" class="muted" /><span class="grow">Plan &amp; check-ins</span><Icon name="chevron" class="chev" size={18} />
        </button>
      </div>
    </Screen>
  );
}
