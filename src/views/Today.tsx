import { useState } from 'preact/hooks';
import { Screen, Bar, MacroBars, NumInput, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { TimeChart } from '../ui/chart';
import { go, qs } from '../router';
import { useAppState, useQuery } from '../lib/store';
import { entriesOn, get, put } from '../lib/db';
import { addDays, fmtDay, today, WEEKDAYS } from '../lib/date';
import { sum } from '../lib/nutrients';
import { analyze, averageOver } from '../lib/stats';
import { checkInDue, targetsFor } from '../lib/program';
import { fmtSigned, fmtWeight, fromDisplayWeight, toDisplayWeight, ML_PER_FLOZ } from '../lib/units';
import { trendRate } from '../lib/trend';
import { defaultMeal } from '../lib/actions';

export function Today() {
  const { settings, profile, program } = useAppState();
  const day = today();
  const entries = useQuery(() => entriesOn(day), [day], ['entries']);
  const a = useQuery(() => analyze(profile), [profile], ['entries', 'weights', 'days']);
  const dayRec = useQuery(() => get('days', day), [day], ['days']);
  const todayWeight = useQuery(() => get('weights', day), [day], ['weights']);
  const [weightInput, setWeightInput] = useState<number | null>(null);

  const n = sum((entries ?? []).map((e) => e.n));
  const t = targetsFor(program, day);
  const eaten = n.kcal ?? 0;
  const left = t ? t.kcal - eaten : null;
  const unit = settings.weightUnit;
  const due = program ? checkInDue(program, day) : false;
  const rate = a ? trendRate(a.trend, day, 14) : null;
  const meal = defaultMeal();

  const saveWeight = async () => {
    if (!weightInput || weightInput <= 0) return;
    await put('weights', { date: day, kg: fromDisplayWeight(weightInput, unit), time: Date.now() });
    setWeightInput(null);
    toast('Weight saved');
  };

  const waterMl = dayRec?.waterMl ?? 0;
  const waterStep = settings.waterUnit === 'oz' ? 8 * ML_PER_FLOZ : 250;
  const addWater = async (ml: number) => {
    const cur = (await get('days', day)) ?? { date: day };
    await put('days', { ...cur, waterMl: Math.max(0, (cur.waterMl ?? 0) + ml) });
  };
  const fmtWater = (ml: number) => settings.waterUnit === 'oz' ? `${Math.round(ml / ML_PER_FLOZ)} oz` : `${(ml / 1000).toFixed(1)} L`;

  const weekStart = addDays(day, -6);
  const weekIntake = a ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => ({ d, v: a.intake.get(d)?.kcal ?? 0 })) : [];
  const weekTargets = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => ({ d, v: targetsFor(program, d)?.kcal ?? 0 })).filter((p) => p.v);
  const avg7 = a ? averageOver(a.intake, a.tracked, addDays(day, -1), 7) : null;
  const trackedDays = a?.expenditure.filter((p) => p.raw != null).length ?? 0;

  return (
    <Screen>
      <div class="row between" style={{ marginTop: 6 }}>
        <div>
          <div class="muted small">{WEEKDAYS[new Date().getDay()]}, {fmtDay(day)}</div>
          <h1 class="page-title" style={{ margin: '2px 0 14px' }}>Today</h1>
        </div>
        <button class="icon-btn" aria-label="Plan" onClick={() => go('/plan')}><Icon name="plan" /></button>
      </div>

      {due && (
        <button class="banner" style={{ width: '100%', border: 0, textAlign: 'left' }} onClick={() => go('/checkin')}>
          <div class="grow">
            <div class="bold">Weekly check-in is ready</div>
            <div class="hint">Review your expenditure and update this week's targets.</div>
          </div>
          <Icon name="chevron" class="faint" />
        </button>
      )}
      {!program && (
        <button class="banner" style={{ width: '100%', border: 0, textAlign: 'left' }} onClick={() => go('/setup')}>
          <div class="grow"><div class="bold">Set up your plan</div><div class="hint">Get calorie and macro targets that adapt to you.</div></div>
          <Icon name="chevron" class="faint" />
        </button>
      )}

      <button class="card" style={{ width: '100%', border: 0, textAlign: 'left', display: 'block' }} onClick={() => go('/log')}>
        <div class="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div class="muted small">{left == null ? 'Eaten' : left >= 0 ? 'Remaining' : 'Over target'}</div>
            <div class="big" style={{ marginTop: 6 }}>{Math.abs(Math.round(left ?? eaten)).toLocaleString()}<span class="unit">kcal</span></div>
          </div>
          <div class="right small muted num" style={{ textAlign: 'right' }}>
            {Math.round(eaten).toLocaleString()} eaten
            {t && <><br />{t.kcal.toLocaleString()} target</>}
          </div>
        </div>
        <div style={{ margin: '14px 0 16px' }}><Bar value={eaten} max={t?.kcal ?? Math.max(eaten, 1)} /></div>
        <MacroBars n={n} t={t} />
      </button>

      <div class="actions">
        <button class="action" onClick={() => go('/add' + qs({ date: day, meal }))}><Icon name="search" />Search</button>
        <button class="action" onClick={() => go('/scan' + qs({ date: day, meal }))}><Icon name="barcode" />Scan</button>
        <button class="action" onClick={() => go('/quick' + qs({ date: day, meal }))}><Icon name="quick" />Quick add</button>
        <button class="action" onClick={() => go('/ai' + qs({ date: day, meal }))}><Icon name="chat" />Describe</button>
      </div>

      <div class="card">
        <div class="row between">
          <div>
            <div class="muted small">Trend weight</div>
            <div class="mid" style={{ marginTop: 4 }}>{a?.trendNow ? fmtWeight(a.trendNow, unit) : '—'}<span class="unit">{unit}</span></div>
            {rate != null && <div class="small muted num" style={{ marginTop: 2 }}>{fmtSigned(toDisplayWeight(rate, unit), 2)} {unit}/week</div>}
          </div>
          {todayWeight ? (
            <div style={{ textAlign: 'right' }}>
              <div class="muted small">Today's weigh-in</div>
              <div class="mid" style={{ marginTop: 4 }}>{fmtWeight(todayWeight.kg, unit)}<span class="unit">{unit}</span></div>
            </div>
          ) : (
            <div class="row" style={{ gap: 6 }}>
              <NumInput class="inline-input" value={weightInput} onChange={setWeightInput} placeholder={unit} aria-label={`Weight in ${unit}`} />
              <button class="btn sm" disabled={!weightInput} onClick={saveWeight}>Log</button>
            </div>
          )}
        </div>
        {a && a.weights.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <TimeChart
              height={120}
              start={addDays(day, -29)} end={day}
              fmt={(v) => v.toFixed(unit === 'lb' ? 0 : 1)}
              series={[
                { label: 'Scale', kind: 'dots', points: a.weights.map((w) => ({ d: w.date, v: toDisplayWeight(w.kg, unit) })) },
                { label: 'Trend', kind: 'line', points: [...a.trend].map(([d, v]) => ({ d, v: toDisplayWeight(v, unit) })) },
              ]}
            />
          </div>
        )}
      </div>

      <div class="card">
        <div class="row between">
          <div>
            <div class="muted small">Expenditure</div>
            <div class="mid" style={{ marginTop: 4 }}>{a?.expenditureNow ? Math.round(a.expenditureNow).toLocaleString() : '—'}<span class="unit">kcal/day</span></div>
          </div>
          <div class="small muted" style={{ textAlign: 'right', maxWidth: '55%' }}>
            {!profile ? 'Finish setup to estimate' : trackedDays < 14 ? `Calibrating · ${trackedDays} of 14 days of data` : 'Based on your intake and weight trend'}
          </div>
        </div>
        {avg7 && avg7.count > 0 && (
          <>
            <div class="divider" />
            <div class="kv">
              <div><div class="k">7-day avg intake</div><div class="v">{Math.round(avg7.n.kcal ?? 0).toLocaleString()}</div></div>
              <div><div class="k">Avg protein</div><div class="v">{Math.round(avg7.n.protein ?? 0)} g</div></div>
              <div><div class="k">Days tracked</div><div class="v">{avg7.count} / 7</div></div>
            </div>
          </>
        )}
        {weekIntake.some((p) => p.v > 0) && (
          <div style={{ marginTop: 14 }}>
            <TimeChart height={110} zero start={weekStart} end={day} series={[
              { label: 'Intake', kind: 'bars', points: weekIntake, color: 'var(--ink-2)' },
              ...(weekTargets.length ? [{ label: 'Target', kind: 'step' as const, points: weekTargets, color: 'var(--muted)', dashed: true }] : []),
            ]} />
          </div>
        )}
      </div>

      <div class="card">
        <div class="row between">
          <div class="row" style={{ gap: 8 }}>
            <Icon name="water" class="muted" />
            <div>
              <div class="bold num">{fmtWater(waterMl)}<span class="unit">of {fmtWater(settings.waterGoalMl)}</span></div>
            </div>
          </div>
          <div class="row" style={{ gap: 6 }}>
            <button class="btn sm secondary" aria-label="Remove water" onClick={() => addWater(-waterStep)} disabled={!waterMl}>−</button>
            <button class="btn sm secondary" onClick={() => addWater(waterStep)}>+ {settings.waterUnit === 'oz' ? '8 oz' : '250 ml'}</button>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><Bar value={waterMl} max={settings.waterGoalMl} thin color="bg-carbs" /></div>
      </div>
    </Screen>
  );
}
