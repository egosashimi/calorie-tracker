import { addDays, WEEKDAYS, weekday, type Day } from './date';
import { averageOver, type Analysis } from './stats';
import { lastCheckIn, targetsFor, type Profile, type Program } from './program';
import { fmtWeight, type WeightUnit } from './units';

/**
 * Compact 4-week summary for an AI coaching review. Kept short because it travels in a URL
 * (chatgpt.com/?q=… / claude.ai/new?q=…), where very long prompts can be cut off or rejected.
 */
export function buildCoachPrompt(a: Analysis, profile: Profile | undefined, program: Program | undefined, unit: WeightUnit, end: Day): string {
  const weights = new Map(a.weights.map((w) => [w.date, w.kg]));
  const lines: string[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = addDays(end, -i);
    const n = a.intake.get(d);
    const t = targetsFor(program, d);
    const w = weights.get(d);
    const trend = a.trend.get(d);
    const food = a.tracked.has(d) && n
      ? `${Math.round(n.kcal ?? 0)} kcal${t ? `/${t.kcal}` : ''} P${Math.round(n.protein ?? 0)} F${Math.round(n.fat ?? 0)} C${Math.round(n.carbs ?? 0)}`
      : 'not logged';
    const body = [w != null ? `wt ${fmtWeight(w, unit)}` : '', trend != null ? `trend ${fmtWeight(trend, unit)}` : ''].filter(Boolean).join(' ');
    lines.push(`${d.slice(5)} ${WEEKDAYS[weekday(d)]}: ${food}${body ? ` | ${body}` : ''}`);
  }
  const avg = averageOver(a.intake, a.tracked, end, 28);
  const ci = program && lastCheckIn(program);
  const goal = program
    ? program.mode === 'manual' ? 'manual targets'
      : `${program.goal}${program.goal !== 'maintain' ? ` ${program.ratePct}% body weight/week` : ''}, ${program.diet} diet, protein ${program.proteinGPerKg} g/kg`
    : '';
  return [
    'Act as my nutrition coach. Review my last 4 weeks of food and weight data below. Give short, specific, practical feedback: what is working, what to adjust, and whether my targets look right. Be honest and evidence-based.',
    '',
    profile ? `Me: ${profile.sex}, born ${profile.birthYear}, ${Math.round(profile.heightCm)} cm. Weights in ${unit}.` : `Weights in ${unit}.`,
    goal ? `Goal: ${goal}.` : '',
    a.expenditureNow ? `Estimated expenditure (adaptive, from intake vs weight trend): ${Math.round(a.expenditureNow)} kcal/day.` : '',
    ci ? `Current targets: ${[...new Set(ci.week.map((t) => t.kcal))].join('/')} kcal, protein ${ci.week[0].protein} g.` : '',
    `Average on logged days: ${Math.round(avg.n.kcal ?? 0)} kcal, ${Math.round(avg.n.protein ?? 0)} g protein, ${Math.round(avg.n.fiber ?? 0)} g fiber (${avg.count}/28 days logged).`,
    '',
    'Daily (kcal eaten/target, macros g):',
    ...lines,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}
