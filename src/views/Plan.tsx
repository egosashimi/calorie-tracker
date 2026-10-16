import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, Field, Segmented, Empty, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { back, go } from '../router';
import { saveProfile, saveProgram, saveSettings, useAppState, useQuery } from '../lib/store';
import { get, put } from '../lib/db';
import { analyze, averageOver } from '../lib/stats';
import { addDays, fmtDay, today, weekday, WEEKDAYS, WEEKDAYS_LONG } from '../lib/date';
import {
  ACTIVITY, DIETS, RATE_PRESETS, computeWeek, dailyEnergyDelta, estimateTdee, lastCheckIn, checkInDue,
  type Activity, type CheckIn, type Diet, type Goal, type MacroTargets, type Profile, type Program, type Sex,
} from '../lib/program';
import { CM_PER_IN, LB_PER_KG, fmtSigned, fmtWeight, fromDisplayWeight, toDisplayWeight, trimNum, type WeightUnit } from '../lib/units';

const avgKcal = (week: MacroTargets[]) => Math.round(week.reduce((s, d) => s + d.kcal, 0) / week.length);

function goalLabel(p: Program, kg: number | null, unit: WeightUnit) {
  if (p.mode === 'manual') return 'Manual targets';
  if (p.goal === 'maintain') return 'Maintain weight';
  const perWeek = kg ? ` ≈ ${trimNum(toDisplayWeight((kg * p.ratePct) / 100, unit), 2)} ${unit}/week` : '';
  return `${p.goal === 'lose' ? 'Lose' : 'Gain'} ${p.ratePct}% of body weight per week${perWeek}`;
}

export function PlanView() {
  const { settings, profile, program } = useAppState();
  const a = useQuery(() => analyze(profile), [profile], ['entries', 'weights', 'days']);
  if (!program) {
    return (
      <Screen>
        <TopBar title="Plan" backTo="/more" />
        <Empty title="No plan yet">Set up your goal to get adaptive calorie and macro targets.<div class="spacer" /><button class="btn" onClick={() => go('/setup')}>Set up plan</button></Empty>
      </Screen>
    );
  }
  const unit = settings.weightUnit;
  const ci = lastCheckIn(program);
  const week = program.mode === 'manual' ? program.manual : ci?.week ?? [];
  const wd = weekday(today());
  const due = checkInDue(program, today());

  return (
    <Screen>
      <TopBar title="Plan" backTo="/more" right={<button class="text-btn" onClick={() => go('/setup')}>Edit</button>} />
      <div class="card">
        <div class="bold">{goalLabel(program, a?.trendNow ?? null, unit)}</div>
        <div class="hint">
          {program.mode === 'coached' && <>{DIETS[program.diet].label} · protein {trimNum(program.proteinGPerKg / (unit === 'lb' ? LB_PER_KG : 1), 2)} g per {unit} · check-ins on {WEEKDAYS_LONG[program.checkInDay]}s</>}
          {program.targetKg ? <><br />Goal weight {fmtWeight(program.targetKg, unit)} {unit}</> : null}
        </div>
        {program.mode === 'coached' && (
          <button class={`btn block ${due ? '' : 'ghost'}`} style={{ marginTop: 12 }} onClick={() => go('/checkin')}>{due ? 'Weekly check-in ready' : 'Check in early'}</button>
        )}
      </div>

      <div class="section-label">This week's targets</div>
      <div class="list">
        {week.map((t, i) => (
          <div class="item" key={i} style={{ fontWeight: i === wd ? 600 : 400 }}>
            <span style={{ width: 44 }}>{WEEKDAYS[i]}</span>
            <span class="grow num small muted">P {t.protein} · F {t.fat} · C {t.carbs}</span>
            <span class="value">{t.kcal.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {program.shiftDays.length > 0 && program.mode === 'coached' && <p class="hint pad">Calorie shifting: +{program.shiftKcal} kcal on {program.shiftDays.map((d) => WEEKDAYS[d]).join(', ')}, balanced across the other days.</p>}

      {program.checkIns.length > 0 && program.mode === 'coached' && (
        <>
          <div class="section-label">Check-in history</div>
          <div class="list">
            {[...program.checkIns].reverse().slice(0, 52).map((c) => (
              <div class="item" key={c.date}>
                <div class="grow">
                  <div>{fmtDay(c.date, { year: c.date.slice(0, 4) !== today().slice(0, 4) })}</div>
                  <div class="sub num">Expenditure {Math.round(c.expenditure).toLocaleString()} · trend {fmtWeight(c.trendKg, unit)} {unit}</div>
                </div>
                <span class="value">{avgKcal(c.week).toLocaleString()}<span class="unit">avg</span></span>
              </div>
            ))}
          </div>
        </>
      )}
      <p class="hint pad">
        Your targets adapt weekly: the app estimates your real expenditure from what you eat and how your trend weight moves, then sets calories to hit your chosen rate. Log consistently (even imperfect days) and weigh in most mornings for the best estimate.
      </p>
    </Screen>
  );
}

export function CheckInView() {
  const { settings, profile, program } = useAppState();
  const a = useQuery(() => analyze(profile), [profile], ['entries', 'weights', 'days']);
  if (!program || !profile) return <Screen tabs={false}><TopBar backTo="/plan" /><Empty title="Set up your plan first" /></Screen>;
  if (!a) return <Screen tabs={false}><TopBar title="Check-in" backTo="/plan" /></Screen>;
  const unit = settings.weightUnit;
  const prev = lastCheckIn(program);
  const day = today();
  if (!a.trendNow || !a.expenditureNow) {
    return <Screen tabs={false}><TopBar title="Check-in" backTo="/plan" /><Empty title="Log a weigh-in first">The check-in needs at least one weight entry.</Empty></Screen>;
  }
  const week = computeWeek(program, a.expenditureNow, a.trendNow, profile);
  const avg7 = averageOver(a.intake, a.tracked, addDays(day, -1), 7);
  const trackedLast = a.expenditure.filter((p) => p.raw != null).length;
  const reached = program.targetKg && ((program.goal === 'lose' && a.trendNow <= program.targetKg) || (program.goal === 'gain' && a.trendNow >= program.targetKg));
  const weekAgoTrend = a.trend.get(addDays(day, -7));

  const apply = async () => {
    const ci: CheckIn = { date: day, expenditure: Math.round(a.expenditureNow!), trendKg: a.trendNow!, week };
    const checkIns = [...program.checkIns.filter((c) => c.date !== day), ci].sort((x, y) => (x.date < y.date ? -1 : 1));
    await saveProgram({ ...program, checkIns });
    toast('Targets updated');
    back('/plan');
  };

  const row = (label: string, before: string | null, after: string) => (
    <div class="item"><span class="grow">{label}</span>{before != null && <span class="muted small num">{before} →</span>}<span class="value bold">{after}</span></div>
  );

  return (
    <Screen tabs={false}>
      <TopBar title="Weekly check-in" backTo="/plan" />
      {trackedLast < 14 && <div class="banner"><div class="small">Your expenditure estimate is still calibrating ({trackedLast} of 14 days of data). It gets sharper with each logged day and weigh-in.</div></div>}
      {reached && <div class="banner"><div class="small">You've reached your goal weight. Consider <button class="link" onClick={() => go('/setup')}>switching to maintenance</button>.</div></div>}
      <div class="list">
        {row('Expenditure', prev ? Math.round(prev.expenditure).toLocaleString() : null, `${Math.round(a.expenditureNow).toLocaleString()} kcal`)}
        {row('Trend weight', prev ? fmtWeight(prev.trendKg, unit) : null, `${fmtWeight(a.trendNow, unit)} ${unit}`)}
        {weekAgoTrend != null && row('Change this week', null, `${fmtSigned(toDisplayWeight(a.trendNow - weekAgoTrend, unit), 2)} ${unit}`)}
        {row('Average intake (7 days)', null, avg7.count ? `${Math.round(avg7.n.kcal ?? 0).toLocaleString()} kcal` : '—')}
      </div>
      <div class="section-label">New daily targets</div>
      <div class="list">
        {row('Calories (average)', prev ? avgKcal(prev.week).toLocaleString() : null, `${avgKcal(week).toLocaleString()} kcal`)}
        {row('Protein', prev ? String(prev.week[0].protein) : null, `${week[0].protein} g`)}
        {row('Fat', prev ? String(Math.round(prev.week.reduce((s, d) => s + d.fat, 0) / 7)) : null, `${Math.round(week.reduce((s, d) => s + d.fat, 0) / 7)} g`)}
        {row('Carbs', prev ? String(Math.round(prev.week.reduce((s, d) => s + d.carbs, 0) / 7)) : null, `${Math.round(week.reduce((s, d) => s + d.carbs, 0) / 7)} g`)}
      </div>
      <p class="hint pad">{goalLabel(program, a.trendNow, unit)}. Targets = expenditure {program.goal === 'maintain' ? '' : `${program.goal === 'lose' ? '−' : '+'} ${Math.abs(Math.round(dailyEnergyDelta(program.goal, program.ratePct, a.trendNow)))} kcal/day `}for your goal rate.</p>
      <div class="footer-bar"><div><button class="btn block" onClick={apply}>Apply new targets</button></div></div>
    </Screen>
  );
}

type Step = 'units' | 'body' | 'goal' | 'diet' | 'schedule' | 'summary';
const STEPS: Step[] = ['units', 'body', 'goal', 'diet', 'schedule', 'summary'];
const PROTEIN_LEVELS: [number, string][] = [[1.6, 'Moderate'], [2.0, 'High'], [2.4, 'Very high']];

export function Setup({ q }: { q: URLSearchParams }) {
  const { settings, profile, program } = useAppState();
  const first = q.get('first') === '1' || !settings.onboarded;
  const [step, setStep] = useState<Step>(first ? 'units' : 'body');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(settings.weightUnit);
  const [heightUnit, setHeightUnit] = useState(settings.heightUnit);
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'female');
  const [birthYear, setBirthYear] = useState<number | null>(profile?.birthYear ?? null);
  const [heightCm, setHeightCm] = useState<number | null>(profile?.heightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity>(profile?.activity ?? 'light');
  const [mode, setMode] = useState<Program['mode']>(program?.mode ?? 'coached');
  const [goal, setGoal] = useState<Goal>(program?.goal ?? 'lose');
  const [ratePct, setRatePct] = useState(program?.ratePct ?? 0.5);
  const [targetKg, setTargetKg] = useState<number | null>(program?.targetKg ?? null);
  const [diet, setDiet] = useState<Diet>(program?.diet ?? 'balanced');
  const [protein, setProtein] = useState(program?.proteinGPerKg ?? 1.6);
  const [checkInDay, setCheckInDay] = useState(program?.checkInDay ?? 1);
  const [shiftDays, setShiftDays] = useState<number[]>(program?.shiftDays ?? []);
  const [shiftKcal, setShiftKcal] = useState(program?.shiftKcal ?? 300);
  const [tdeeOverride, setTdeeOverride] = useState<number | null>(profile?.initialTdee ?? null);
  const [manual, setManual] = useState<MacroTargets>(program?.manual?.[0] ?? { kcal: 2000, protein: 150, fat: 65, carbs: 200 });
  const a = useQuery(() => analyze(profile), [profile], ['weights']);

  useEffect(() => {
    if (weightKg == null && a?.trendNow) setWeightKg(a.trendNow);
  }, [a?.trendNow]);

  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  const bodyOk = birthYear && age! >= 13 && age! < 100 && heightCm && heightCm > 100 && heightCm < 250 && weightKg && weightKg > 30;
  const draftProfile: Profile | null = bodyOk ? { sex, birthYear: birthYear!, heightCm: heightCm!, activity, initialTdee: tdeeOverride ?? undefined } : null;
  const formulaTdee = draftProfile ? Math.round(estimateTdee({ ...draftProfile }, weightKg!)) : null;
  const hasHistory = (a?.expenditure.filter((p) => p.raw != null).length ?? 0) >= 14;
  const expenditure = hasHistory && a?.expenditureNow ? a.expenditureNow : tdeeOverride ?? formulaTdee ?? 2000;

  const draftProgram: Program = {
    mode, goal, ratePct: goal === 'maintain' ? 0 : ratePct, targetKg: targetKg ?? undefined, diet, proteinGPerKg: protein,
    shiftDays, shiftKcal, checkInDay,
    manual: Array.from({ length: 7 }, () => ({ ...manual, kcal: Math.round(manual.protein * 4 + manual.carbs * 4 + manual.fat * 9) })),
    checkIns: program?.checkIns ?? [], startDate: program?.startDate ?? today(), startKg: program?.startKg ?? weightKg ?? 0,
  };
  const week = draftProfile && weightKg ? computeWeek(draftProgram, expenditure, weightKg, draftProfile) : null;

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const prev = () => (idx === 0 || (!first && step === 'body') ? back('/plan') : setStep(STEPS[idx - 1]));

  const finish = async () => {
    if (!draftProfile || !week || !weightKg) return;
    await saveSettings({ weightUnit, heightUnit, onboarded: true });
    await saveProfile(draftProfile);
    const day = today();
    const existing = await get('weights', day);
    if (!existing && (!a?.trendNow || Math.abs(a.trendNow - weightKg) > 0.05)) await put('weights', { date: day, kg: weightKg, time: Date.now() });
    const ci: CheckIn = { date: day, expenditure: Math.round(expenditure), trendKg: a?.trendNow ?? weightKg, week };
    const checkIns = mode === 'coached' ? [...draftProgram.checkIns.filter((c) => c.date !== day), ci] : draftProgram.checkIns;
    await saveProgram({ ...draftProgram, checkIns });
    toast(program ? 'Plan updated' : "You're all set");
    go('/', { replace: true });
  };

  const wDisp = (kg: number) => toDisplayWeight(kg, weightUnit);
  const hDisplay = heightCm == null ? null : heightUnit === 'in' ? heightCm / CM_PER_IN : heightCm;

  return (
    <Screen tabs={false}>
      <TopBar
        title={first ? 'Welcome' : 'Edit plan'}
        left={idx > 0 || !first ? <button class="icon-btn" aria-label="Back" onClick={prev}><Icon name="back" /></button> : undefined}
        right={<span class="small muted num" style={{ paddingRight: 8 }}>{idx + 1}/{STEPS.length}</span>}
      />

      {step === 'units' && (
        <>
          <h2 style={{ margin: '8px 4px 6px' }}>Tally</h2>
          <p class="hint pad" style={{ fontSize: 15 }}>A private calorie, macro and weight tracker. Everything you enter stays on this device — no account, no server.</p>
          <div class="section-label">Units</div>
          <Segmented<WeightUnit> value={weightUnit} onChange={setWeightUnit} options={[['lb', 'Pounds'], ['kg', 'Kilograms']]} />
          <Segmented<'in' | 'cm'> value={heightUnit} onChange={setHeightUnit} options={[['in', 'Feet & inches'], ['cm', 'Centimeters']]} />
          <p class="hint pad">Have a backup from another device? <button class="link" onClick={() => go('/data')}>Restore it</button>.</p>
        </>
      )}

      {step === 'body' && (
        <>
          <div class="section-label">About you</div>
          <p class="hint pad" style={{ marginTop: -4 }}>Used to estimate your starting expenditure. After a couple of weeks of logging, your real data takes over.</p>
          <Segmented<Sex> value={sex} onChange={setSex} options={[['female', 'Female'], ['male', 'Male']]} />
          <div class="card">
            <Field label="Year of birth"><NumInput class="input" value={birthYear} decimals={0} onChange={setBirthYear} placeholder="e.g. 1994" /></Field>
            {heightUnit === 'in' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Height (ft)"><NumInput class="input" decimals={0} value={hDisplay != null ? Math.floor(hDisplay / 12 + 1e-6) : null} onChange={(ft) => setHeightCm(((ft ?? 0) * 12 + ((hDisplay ?? 0) % 12)) * CM_PER_IN)} /></Field>
                <Field label="(in)"><NumInput class="input" decimals={1} value={hDisplay != null ? Math.round((hDisplay % 12) * 10) / 10 : null} onChange={(inch) => setHeightCm((Math.floor((hDisplay ?? 0) / 12 + 1e-6) * 12 + (inch ?? 0)) * CM_PER_IN)} /></Field>
              </div>
            ) : (
              <Field label="Height (cm)"><NumInput class="input" value={heightCm} decimals={1} onChange={setHeightCm} /></Field>
            )}
            <Field label={`Current weight (${weightUnit})`}><NumInput class="input" value={weightKg != null ? Number(wDisp(weightKg).toFixed(1)) : null} onChange={(v) => setWeightKg(v ? fromDisplayWeight(v, weightUnit) : null)} /></Field>
          </div>
          <div class="section-label">Activity outside of logged food</div>
          <div class="list">
            {(Object.keys(ACTIVITY) as Activity[]).map((k) => (
              <button class="item" key={k} onClick={() => setActivity(k)}>
                <div class="grow"><div class="title">{ACTIVITY[k].label}</div><div class="sub">{ACTIVITY[k].hint}</div></div>
                {activity === k && <Icon name="check" />}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'goal' && (
        <>
          <div class="section-label">Approach</div>
          <Segmented<Program['mode']> value={mode} onChange={setMode} options={[['coached', 'Adaptive (recommended)'], ['manual', 'Manual targets']]} />
          {mode === 'coached' ? (
            <>
              <div class="section-label">Goal</div>
              <Segmented<Goal> value={goal} onChange={(g) => { setGoal(g); if (g !== 'maintain' && !RATE_PRESETS[g].includes(ratePct)) setRatePct(RATE_PRESETS[g][1] ?? RATE_PRESETS[g][0]); }} options={[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']]} />
              {goal !== 'maintain' && weightKg && (
                <div class="list">
                  {RATE_PRESETS[goal].map((r) => (
                    <button class="item" key={r} onClick={() => setRatePct(r)}>
                      <div class="grow">
                        <div class="title">{r}% per week · {trimNum(wDisp((weightKg * r) / 100), 2)} {weightUnit}/week</div>
                        <div class="sub">{Math.abs(Math.round(dailyEnergyDelta(goal, r, weightKg)))} kcal/day {goal === 'lose' ? 'deficit' : 'surplus'}{
                          goal === 'lose' ? (r <= 0.25 ? ' · gentle' : r <= 0.5 ? ' · moderate, easiest to sustain' : r <= 0.75 ? ' · faster' : ' · aggressive') : (r <= 0.1 ? ' · lean gain' : r <= 0.25 ? ' · moderate' : ' · fast')}</div>
                      </div>
                      {ratePct === r && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              )}
              {goal !== 'maintain' && (
                <Field label={`Goal weight (${weightUnit}, optional)`}>
                  <NumInput class="input" value={targetKg != null ? Number(wDisp(targetKg).toFixed(1)) : null} onChange={(v) => setTargetKg(v ? fromDisplayWeight(v, weightUnit) : null)} />
                </Field>
              )}
            </>
          ) : (
            <>
              <p class="hint pad">Set fixed daily targets. You can switch to adaptive targets any time.</p>
              <div class="card">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <Field label={<span class="c-protein">Protein g</span>}><NumInput class="input" value={manual.protein} onChange={(v) => setManual({ ...manual, protein: v ?? 0 })} /></Field>
                  <Field label={<span class="c-fat">Fat g</span>}><NumInput class="input" value={manual.fat} onChange={(v) => setManual({ ...manual, fat: v ?? 0 })} /></Field>
                  <Field label={<span class="c-carbs">Carbs g</span>}><NumInput class="input" value={manual.carbs} onChange={(v) => setManual({ ...manual, carbs: v ?? 0 })} /></Field>
                </div>
                <div class="row between"><span class="muted">Calories</span><span class="mid">{Math.round(manual.protein * 4 + manual.carbs * 4 + manual.fat * 9).toLocaleString()}</span></div>
              </div>
            </>
          )}
        </>
      )}

      {step === 'diet' && (
        mode === 'manual' ? <p class="hint pad">Macro preferences only apply to adaptive plans. Continue.</p> : (
          <>
            <div class="section-label">Diet style</div>
            <div class="list">
              {(Object.keys(DIETS) as Diet[]).map((d) => (
                <button class="item" key={d} onClick={() => setDiet(d)}>
                  <div class="grow"><div class="title">{DIETS[d].label}</div><div class="sub">{DIETS[d].hint}</div></div>
                  {diet === d && <Icon name="check" />}
                </button>
              ))}
            </div>
            <div class="section-label">Protein</div>
            <div class="list">
              {PROTEIN_LEVELS.map(([g, label]) => (
                <button class="item" key={g} onClick={() => setProtein(g)}>
                  <div class="grow">
                    <div class="title">{label}</div>
                    <div class="sub">{weightUnit === 'lb' ? `${trimNum(g / LB_PER_KG, 2)} g per lb` : `${g} g per kg`} of body weight{weightKg ? ` · about ${Math.round(g * Math.min(weightKg, heightCm ? 27 * (heightCm / 100) ** 2 : weightKg))} g/day` : ''}</div>
                  </div>
                  {protein === g && <Icon name="check" />}
                </button>
              ))}
            </div>
            <p class="hint pad">1.6 g/kg covers most people's needs for keeping or building muscle; higher intakes help with fullness during a diet. Above a BMI of 27, protein is based on the weight at BMI 27.</p>
          </>
        )
      )}

      {step === 'schedule' && (
        <>
          {mode === 'coached' && (
            <>
              <div class="section-label">Weekly check-in day</div>
              <div class="chips">{WEEKDAYS.map((d, i) => <button key={d} class={`chip${checkInDay === i ? ' on' : ''}`} onClick={() => setCheckInDay(i)}>{d}</button>)}</div>
              <p class="hint pad">Each week the app re-estimates your expenditure and proposes new targets.</p>
            </>
          )}
          <div class="section-label">Calorie shifting (optional)</div>
          <p class="hint pad" style={{ marginTop: -4 }}>Eat more on chosen days (e.g. weekends) and a little less on the others. Your weekly total stays the same.</p>
          <div class="chips">{WEEKDAYS.map((d, i) => (
            <button key={d} class={`chip${shiftDays.includes(i) ? ' on' : ''}`} onClick={() => setShiftDays(shiftDays.includes(i) ? shiftDays.filter((x) => x !== i) : [...shiftDays, i].sort())}>{d}</button>
          ))}</div>
          {shiftDays.length > 0 && <Field label="Extra calories on those days"><NumInput class="input" value={shiftKcal} decimals={0} onChange={(v) => setShiftKcal(v ?? 0)} /></Field>}
        </>
      )}

      {step === 'summary' && (
        !week ? <p class="hint pad">Some details are missing — go back and fill in your age, height and weight.</p> : (
          <>
            {mode === 'coached' && (
              <>
                <div class="section-label">Starting expenditure</div>
                <div class="card">
                  <div class="row between">
                    <div class="mid">{Math.round(expenditure).toLocaleString()}<span class="unit">kcal/day</span></div>
                    <span class="small muted">{hasHistory ? 'From your logged data' : tdeeOverride ? 'Your number' : 'Estimated'}</span>
                  </div>
                  {!hasHistory && (
                    <Field label="Know your maintenance calories? (optional)" hint={`Formula estimate (Mifflin-St Jeor × activity): ${formulaTdee?.toLocaleString()} kcal. Either way, it's refined from your data.`}>
                      <NumInput class="input" value={tdeeOverride} decimals={0} onChange={setTdeeOverride} placeholder={String(formulaTdee ?? '')} />
                    </Field>
                  )}
                </div>
              </>
            )}
            <div class="section-label">Your targets</div>
            <div class="list">
              {week.map((t, i) => (
                <div class="item" key={i}>
                  <span style={{ width: 44 }}>{WEEKDAYS[i]}</span>
                  <span class="grow num small muted">P {t.protein} · F {t.fat} · C {t.carbs}</span>
                  <span class="value">{t.kcal.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {mode === 'coached' && week.some((t) => t.kcal <= (sex === 'male' ? 1500 : 1200)) && <p class="hint pad">Calories are held at a safe minimum. Consider a slower rate.</p>}
          </>
        )
      )}

      <div class="footer-bar"><div>
        {step === 'summary'
          ? <button class="btn block" disabled={!week} onClick={finish}>{program ? 'Save plan' : 'Start tracking'}</button>
          : <button class="btn block" disabled={step === 'body' && !bodyOk} onClick={next}>Continue</button>}
      </div></div>
    </Screen>
  );
}

