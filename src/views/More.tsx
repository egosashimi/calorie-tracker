import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, Field, Segmented, NumInput, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../router';
import { saveSettings, useAppState, loadState, type Settings } from '../lib/store';
import { all, clearAll } from '../lib/db';
import { buildBackup, exportBackup, exportCsv, restoreBackup, saveFile, type BackupFile } from '../lib/backup';
import { analyze, averageOver } from '../lib/stats';
import { addDays, dayKey, today } from '../lib/date';
import { lastCheckIn, targetsFor } from '../lib/program';
import { fmtWeight, ML_PER_FLOZ } from '../lib/units';
import { PROVIDERS, type AiProvider } from '../lib/ai';
import { copyText, openExternal } from './Ai';

function Row({ icon, label, sub, onClick }: { icon: string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button class="item" onClick={onClick}>
      <Icon name={icon} class="muted" />
      <div class="grow"><div class="title">{label}</div>{sub && <div class="sub">{sub}</div>}</div>
      <Icon name="chevron" class="chev" size={18} />
    </button>
  );
}

export function More() {
  const { settings, profile, program } = useAppState();
  const daysSinceBackup = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 86400000) : null;

  const coachPrompt = async (provider: AiProvider) => {
    const a = await analyze(profile);
    const end = addDays(today(), -1);
    const unit = settings.weightUnit;
    const lines: string[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = addDays(end, -i);
      const n = a.intake.get(d);
      const w = a.weights.find((x) => x.date === d);
      const t = targetsFor(program, d);
      lines.push(`${d}: ${a.tracked.has(d) && n ? `${Math.round(n.kcal ?? 0)} kcal, P${Math.round(n.protein ?? 0)} F${Math.round(n.fat ?? 0)} C${Math.round(n.carbs ?? 0)}` : 'not tracked'}${t ? ` (target ${t.kcal})` : ''}${w ? `, scale ${fmtWeight(w.kg, unit)} ${unit}` : ''}, trend ${fmtWeight(a.trend.get(d), unit)} ${unit}`);
    }
    const avg = averageOver(a.intake, a.tracked, end, 28);
    const ci = program && lastCheckIn(program);
    const text = [
      'You are my nutrition coach. Review the last 4 weeks of my food and weight data and give me short, specific, practical feedback: what is working, what to adjust, and whether my targets look right. Be honest and evidence-based.',
      '',
      profile ? `Me: ${profile.sex}, born ${profile.birthYear}, ${Math.round(profile.heightCm)} cm.` : '',
      program ? `Goal: ${program.mode === 'manual' ? 'manual targets' : `${program.goal}${program.goal !== 'maintain' ? ` at ${program.ratePct}% body weight per week` : ''}`}, ${program.diet} diet, protein ${program.proteinGPerKg} g/kg.` : '',
      a.expenditureNow ? `Estimated expenditure (adaptive, from intake vs. weight trend): ${Math.round(a.expenditureNow)} kcal/day.` : '',
      ci ? `Current targets: ${ci.week.map((t) => t.kcal).join('/')} kcal (Sun–Sat), protein ${ci.week[0].protein} g.` : '',
      `Average over tracked days: ${Math.round(avg.n.kcal ?? 0)} kcal, ${Math.round(avg.n.protein ?? 0)} g protein, ${Math.round(avg.n.fiber ?? 0)} g fiber (${avg.count} of 28 days tracked).`,
      '',
      'Daily log:',
      ...lines,
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
    await copyText(text);
    openExternal(PROVIDERS[provider].withPrompt(text));
  };

  return (
    <Screen>
      <h1 class="page-title">More</h1>
      {daysSinceBackup == null || daysSinceBackup >= 14 ? (
        <button class="banner" style={{ width: '100%', border: 0, textAlign: 'left' }} onClick={() => go('/data')}>
          <div class="grow"><div class="bold">{daysSinceBackup == null ? 'Make your first backup' : `Last backup ${daysSinceBackup} days ago`}</div><div class="hint">Your data lives only on this device. Save a copy to iCloud Drive or Files.</div></div>
          <Icon name="chevron" class="faint" />
        </button>
      ) : null}
      <div class="list">
        <Row icon="plan" label="Plan & check-ins" sub={program ? undefined : 'Not set up'} onClick={() => go('/plan')} />
        <Row icon="scale" label="Weight & body" onClick={() => go('/weight')} />
        <Row icon="leaf" label="Nutrients" sub="Vitamins, minerals and daily values" onClick={() => go('/nutrients?range=7')} />
      </div>
      <div class="list">
        <Row icon="food" label="My foods" onClick={() => go('/foods')} />
        <Row icon="book" label="Recipes & meals" onClick={() => go('/recipes')} />
      </div>
      <div class="section-label">AI coach</div>
      <div class="list">
        <Row icon="chat" label={`Review my last 4 weeks with ${PROVIDERS[settings.ai].label}`} sub="Sends a summary of your data to the app you choose" onClick={() => coachPrompt(settings.ai)} />
      </div>
      <div class="list">
        <Row icon="gear" label="Settings" onClick={() => go('/settings')} />
        <Row icon="download" label="Backup & data" onClick={() => go('/data')} />
        <Row icon="lock" label="Privacy & how it works" onClick={() => go('/about')} />
      </div>
    </Screen>
  );
}

export function SettingsView() {
  const { settings } = useAppState();
  const [meals, setMeals] = useState(settings.meals.join('\n'));
  const set = (patch: Partial<Settings>) => saveSettings(patch);

  return (
    <Screen tabs={false}>
      <TopBar title="Settings" backTo="/more" />
      <div class="section-label">Units</div>
      <Segmented value={settings.weightUnit} onChange={(v) => set({ weightUnit: v })} options={[['lb', 'Pounds'], ['kg', 'Kilograms']]} />
      <Segmented value={settings.heightUnit} onChange={(v) => set({ heightUnit: v })} options={[['in', 'Inches'], ['cm', 'Centimeters']]} />
      <Segmented value={settings.waterUnit} onChange={(v) => set({ waterUnit: v })} options={[['oz', 'Fluid ounces'], ['ml', 'Milliliters']]} />

      <div class="section-label">Appearance</div>
      <Segmented value={settings.theme} onChange={(v) => set({ theme: v })} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />

      <div class="section-label">Meals</div>
      <div class="card">
        <Field label="One per line" hint="Renaming keeps existing entries in place. Removing a meal moves its entries to the last meal.">
          <textarea class="textarea" style={{ minHeight: 120 }} value={meals} onInput={(e) => setMeals((e.target as HTMLTextAreaElement).value)}
            onBlur={() => { const list = meals.split('\n').map((m) => m.trim()).filter(Boolean).slice(0, 8); if (list.length) set({ meals: list }); }} />
        </Field>
      </div>

      <div class="section-label">Water goal</div>
      <div class="card">
        <Field label={settings.waterUnit === 'oz' ? 'Fluid ounces per day' : 'Milliliters per day'}>
          <NumInput class="input" decimals={0} value={settings.waterUnit === 'oz' ? Math.round(settings.waterGoalMl / ML_PER_FLOZ) : settings.waterGoalMl}
            onChange={(v) => v && v > 0 && set({ waterGoalMl: settings.waterUnit === 'oz' ? v * ML_PER_FLOZ : v })} />
        </Field>
      </div>

      <div class="section-label">AI assistant</div>
      <Segmented<AiProvider> value={settings.ai} onChange={(v) => set({ ai: v })} options={[['claude', 'Claude'], ['chatgpt', 'ChatGPT']]} />
      <p class="hint pad">Used for “Describe”, label reading and coaching. It opens the official app or website with your own subscription — Tally never sees your login.</p>

      <div class="section-label">USDA FoodData Central key</div>
      <div class="card">
        <Field label="API key (optional)" hint={<>Branded-food search and barcode fallback work with a shared demo key that's limited to ~30 searches an hour. A free personal key removes that limit: <button class="link" onClick={() => openExternal('https://fdc.nal.usda.gov/api-key-signup')}>sign up</button> (instant, email only).</>}>
          <input class="input" value={settings.fdcKey} placeholder="DEMO_KEY" autoComplete="off" autoCapitalize="off" spellcheck={false} onChange={(e) => set({ fdcKey: (e.target as HTMLInputElement).value.trim() })} />
        </Field>
      </div>

      <div class="section-label">Plan</div>
      <div class="list">
        <button class="item" onClick={() => go('/setup')}><span class="grow">Edit profile &amp; goal</span><Icon name="chevron" class="chev" size={18} /></button>
      </div>
    </Screen>
  );
}

export function DataView() {
  const { settings } = useAppState();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1e6).toFixed(1)} MB used`)).catch(() => {});
  }, []);

  const backup = async () => {
    try {
      await exportBackup();
      await saveSettings({ lastBackup: Date.now() });
      toast('Backup saved');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast(`Backup failed: ${e.message}`);
    }
  };

  const restore = async (file: File, mode: 'replace' | 'merge') => {
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      if (mode === 'replace' && !confirm('Replace ALL data on this device with this backup?')) return;
      await restoreBackup(data, mode);
      await loadState();
      toast(mode === 'replace' ? 'Backup restored' : 'Backup merged');
      go('/', { replace: true });
    } catch (e: any) {
      toast(e.message || 'Could not read that file');
    }
  };

  const wipe = async () => {
    if (!confirm('Delete all foods, logs, weights and settings on this device? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Consider making a backup first.')) return;
    const safety = await buildBackup();
    await clearAll();
    await loadState();
    toast('All data deleted', { label: 'Undo', run: async () => { await restoreBackup(safety, 'replace'); await loadState(); } });
    go('/setup?first=1', { replace: true });
  };

  return (
    <Screen tabs={false}>
      <TopBar title="Backup & data" backTo="/more" />
      <div class="card">
        <div class="bold">Your data stays on this device</div>
        <p class="hint" style={{ marginBottom: 0 }}>
          Nothing is uploaded anywhere. A backup is a single file you keep — save it to iCloud Drive or Files from the share sheet.
          {settings.lastBackup ? ` Last backup: ${dayKey(new Date(settings.lastBackup))}.` : ' No backup yet.'}
          {usage ? ` ${usage}.` : ''}{persisted === false ? ' Storage is not yet marked persistent; adding the app to your Home Screen protects it.' : ''}
        </p>
      </div>
      <button class="btn block" onClick={backup}><Icon name="download" size={18} />Save backup</button>
      <div class="spacer" />
      <div class="btn-row">
        <label class="btn secondary">Restore<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) restore(f, 'replace'); }} /></label>
        <label class="btn secondary">Merge<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) restore(f, 'merge'); }} /></label>
      </div>
      <p class="hint pad">Restore replaces everything here with the backup. Merge adds the backup's entries and keeps yours (same items are overwritten).</p>

      <div class="section-label">Export</div>
      <div class="list">
        <button class="item" onClick={async () => { try { await exportCsv(); } catch { /* cancelled */ } }}>
          <Icon name="upload" class="muted" /><div class="grow"><div class="title">Daily totals (CSV)</div><div class="sub">Calories, macros and weight per day — opens in Numbers or Excel</div></div>
        </button>
        <button class="item" onClick={async () => { try { const log = await exportCsvLog(); await saveFile(`tally-food-log-${dayKey()}.csv`, log, 'text/csv'); } catch { /* cancelled */ } }}>
          <Icon name="upload" class="muted" /><div class="grow"><div class="title">Full food log (CSV)</div><div class="sub">Every entry with amounts and nutrients</div></div>
        </button>
      </div>

      <div class="section-label">Danger zone</div>
      <button class="btn danger block" onClick={wipe}>Delete all data</button>
    </Screen>
  );
}

async function exportCsvLog(): Promise<string> {
  const entries = await all('entries');
  const keys = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'] as const;
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['date', 'meal', 'time', 'food', 'brand', 'source', 'amount', 'unit', 'grams', ...keys].join(',')];
  for (const e of entries.sort((a, b) => a.time - b.time)) {
    rows.push([e.date, e.meal, new Date(e.time).toISOString(), e.food.name, e.food.brand ?? '', e.food.source, e.qty, e.unit,
      e.food.noGrams ? '' : e.grams.toFixed(1), ...keys.map((k) => (e.n[k] != null ? e.n[k]!.toFixed(1) : ''))].map(cell).join(','));
  }
  return rows.join('\n');
}

export function AboutView() {
  useEffect(() => {
    if (location.hash.includes('#ai')) document.getElementById('ai')?.scrollIntoView();
  }, []);
  return (
    <Screen tabs={false}>
      <TopBar title="Privacy & how it works" backTo="/more" />
      <div class="card prose">
        <h4 style={{ marginTop: 0 }}>Where your data lives</h4>
        <p>Tally is a static web app. The code is public, but your food log, weights and settings are stored only in this browser's private database on your device. There is no account, no server, no analytics and no tracking. Nobody — including whoever hosts the code — can see your data.</p>
        <p>On iPhone, use it from the Home Screen icon (Share → Add to Home Screen). Home Screen apps keep their own storage that Safari's 7-day cleanup doesn't touch. Data is not shared between the Home Screen app and Safari tabs, and deleting the icon deletes its data — so make regular backups (More → Backup &amp; data).</p>

        <h4>What goes over the network</h4>
        <ul>
          <li>Online food search and barcode lookups send only the search text or barcode number to Open Food Facts and USDA FoodData Central.</li>
          <li>The built-in USDA database works offline; the app itself is cached for offline use.</li>
          <li>AI features only send what you choose to the Claude or ChatGPT app.</li>
        </ul>

        <h4>Food data accuracy</h4>
        <ul>
          <li><b>USDA SR28</b> (built in, ~8,800 foods): lab-analyzed reference values from the US Department of Agriculture, including many restaurant chains and brand-name products. Most accurate for whole foods.</li>
          <li><b>USDA FoodData Central – Branded</b>: manufacturer-submitted label data for US packaged foods.</li>
          <li><b>Open Food Facts</b>: crowd-sourced package labels from around the world. Very broad, occasionally wrong — compare with the package.</li>
          <li><b>Your foods</b>: what you enter. Weighing food on a kitchen scale is the single biggest accuracy upgrade.</li>
        </ul>

        <h4>How expenditure is estimated</h4>
        <p>Like MacroFactor, Tally works out how much you actually burn from what you eat and how your weight changes: expenditure ≈ average intake − (weight trend slope × 7,700 kcal/kg) over a rolling 3-week window. The estimate starts from the Mifflin-St Jeor equation and shifts gradually toward your real data as days are logged, so a few odd days can't swing it. Days you mark incomplete are left out. Weekly check-ins turn that estimate into new calorie and macro targets for your goal.</p>

        <h4 id="ai">Using Claude or ChatGPT without an API</h4>
        <p>Subscriptions to Claude and ChatGPT can't be called from other apps — only the paid APIs can. So Tally uses your subscription the only legitimate way: it hands a ready-made prompt to the official app and reads the answer back.</p>
        <ol>
          <li>Describe a meal (or choose Photo). Tap <b>Ask Claude</b> — the app opens with the prompt filled in.</li>
          <li>Send it (attach a photo if you chose Photo — the prompt is already on your clipboard).</li>
          <li>Tap <b>Copy</b> on the reply, come back to Tally and tap <b>Paste reply</b>. Review the items and add them.</li>
        </ol>
        <p>The same flow reads nutrition labels into custom foods, and “Review my last 4 weeks” sends a summary of your data for coaching.</p>

        <h4>Sources &amp; licenses</h4>
        <p class="small">U.S. Department of Agriculture, Agricultural Research Service. USDA National Nutrient Database for Standard Reference, Release 28 (public domain). Open Food Facts data is available under the Open Database License. Daily Values per FDA 21 CFR 101.9.</p>
      </div>
    </Screen>
  );
}
