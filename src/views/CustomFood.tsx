import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, Field, Toggle, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { back, go, qs } from '../router';
import { useAppState } from '../lib/store';
import { del, get, put } from '../lib/db';
import { foodFromServing, perServingFood, uid, type Food } from '../lib/foods';
import { LABEL_ORDER, NUTRIENTS, NUTRIENT_MAP, scale, macroKcal, type NutrientKey, type Nutrients } from '../lib/nutrients';
import { labelPrompt, parseLabel, PROVIDERS } from '../lib/ai';
import { copyText, openExternal, readClipboard } from './Ai';
import { foodCache } from '../lib/actions';

const LABEL_NAMES: Partial<Record<NutrientKey, string>> = { kcal: 'Calories', fat: 'Total fat', carbs: 'Total carbohydrate', sugar: 'Total sugars', addedSugar: 'Incl. added sugars' };
const INDENT = new Set<NutrientKey>(['satFat', 'transFat', 'fiber', 'sugar', 'addedSugar']);

export function CustomFood({ id, q }: { id?: string; q: URLSearchParams }) {
  const { settings } = useAppState();
  const [existing, setExisting] = useState<Food | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(q.get('barcode') ?? '');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [servingG, setServingG] = useState<number | null>(null);
  const [unknownWeight, setUnknownWeight] = useState(false);
  const [liquid, setLiquid] = useState(false);
  const [n, setN] = useState<Nutrients>({});
  const [more, setMore] = useState(false);
  const [aiOpen, setAiOpen] = useState(q.get('ai') === '1');
  const [aiError, setAiError] = useState('');
  const inFlow = q.has('date') || q.has('mode') || q.has('meal');

  useEffect(() => {
    if (!id) return;
    get('foods', `food:${id}`).then((f) => {
      if (!f) return;
      setExisting(f);
      setName(f.name); setBrand(f.brand ?? ''); setBarcode(f.barcode ?? ''); setLiquid(!!f.liquid);
      const s = f.servings[0] ?? { label: '100 g', g: 100 };
      setServingLabel(s.label);
      setUnknownWeight(!!f.noGrams);
      setServingG(f.noGrams ? null : s.g);
      setN(scale(f.per100, s.g / 100));
      if (Object.keys(f.per100).some((k) => !LABEL_ORDER.includes(k as NutrientKey))) setMore(true);
    });
  }, [id]);

  const setVal = (k: NutrientKey, v: number | null) => setN((cur) => {
    const next = { ...cur };
    if (v == null) delete next[k]; else next[k] = v;
    return next;
  });

  const valid = name.trim() && n.kcal != null && (unknownWeight || (servingG ?? 0) > 0);
  const implied = macroKcal(n);
  const mismatch = n.kcal != null && implied > 0 && Math.abs(n.kcal - implied) > Math.max(20, n.kcal * 0.2);

  const save = async () => {
    if (!valid) return;
    const base = {
      id: existing?.id ?? `food:${uid()}`, name: name.trim(), brand: brand.trim() || undefined, source: 'custom' as const,
      barcode: barcode.trim() || undefined, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    const food: Food = unknownWeight
      ? perServingFood(base, n, servingLabel.trim() || 'serving')
      : { ...foodFromServing(base, n, { label: servingLabel.trim() || 'serving', g: servingG! }), liquid };
    await put('foods', food);
    foodCache.set(food.id, food);
    // keep saved/recents in sync with the edited definition
    const h = await get('history', food.id);
    if (h) await put('history', { ...h, food });
    toast(existing ? 'Food updated' : 'Food created');
    if (inFlow && !existing) go('/food' + qs({ key: food.id, date: q.get('date'), meal: q.get('meal'), mode: q.get('mode'), recipe: q.get('recipe') }), { replace: true });
    else back('/foods');
  };

  const remove = async () => {
    if (!existing || !confirm(`Delete "${existing.name}"? Past log entries keep their values.`)) return;
    await del('foods', existing.id);
    await del('history', existing.id);
    toast('Food deleted');
    back('/foods');
  };

  const askAi = async () => {
    const ok = await copyText(labelPrompt());
    toast(ok ? 'Prompt copied — paste it and attach a photo of the label' : 'Copy failed');
    openExternal(PROVIDERS[settings.ai].home);
  };

  const pasteAi = async () => {
    setAiError('');
    const clip = await readClipboard();
    if (clip == null) { setAiError('Clipboard access was blocked.'); return; }
    try {
      const l = parseLabel(clip);
      setName((cur) => cur || l.name);
      setBrand((cur) => cur || l.brand || '');
      setServingLabel(l.servingLabel);
      if (l.servingGrams) { setServingG(l.servingGrams); setUnknownWeight(false); } else setUnknownWeight(true);
      setN(l.n);
      setAiOpen(false);
      toast('Label filled in — double-check against the package');
    } catch (e: any) {
      setAiError(e.message);
    }
  };

  const extraKeys = NUTRIENTS.map((d) => d.key).filter((k) => !LABEL_ORDER.includes(k));
  const row = (k: NutrientKey) => (
    <div class={`nt-row${INDENT.has(k) ? ' indent' : ''}`} key={k}>
      <span>{LABEL_NAMES[k] ?? NUTRIENT_MAP[k].label}</span>
      <NumInput class="inline-input" value={n[k] ?? null} onChange={(v) => setVal(k, v)} placeholder="—" aria-label={NUTRIENT_MAP[k].label} />
      <span class="dv" style={{ textAlign: 'left' }}>{NUTRIENT_MAP[k].unit}</span>
    </div>
  );

  return (
    <Screen tabs={false}>
      <TopBar title={existing ? 'Edit food' : 'New food'} backTo="/foods" />

      {!existing && (
        <div class="card">
          <button class="row text-btn" style={{ width: '100%', padding: 0 }} onClick={() => setAiOpen(!aiOpen)}>
            <Icon name="camera" class="muted" />
            <span class="grow" style={{ textAlign: 'left' }}>Fill from a photo of the label</span>
            <Icon name={aiOpen ? 'down' : 'chevron'} class="faint" size={18} />
          </button>
          {aiOpen && (
            <div style={{ marginTop: 12 }}>
              <p class="hint" style={{ marginTop: 0 }}>{PROVIDERS[settings.ai].label} reads the Nutrition Facts panel for you. Tap below, paste the prompt, attach a photo of the label, send, then copy the whole reply and come back.</p>
              <div class="btn-row">
                <button class="btn" onClick={askAi}>Open {PROVIDERS[settings.ai].label}</button>
                <button class="btn secondary" onClick={pasteAi}>Paste reply</button>
              </div>
              {aiError && <p class="hint" style={{ color: 'var(--warn)' }}>{aiError}</p>}
            </div>
          )}
        </div>
      )}

      <div class="card">
        <Field label="Name"><input class="input" value={name} placeholder="e.g. Greek yogurt, plain" onInput={(e) => setName((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Brand (optional)"><input class="input" value={brand} onInput={(e) => setBrand((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Barcode (optional)"><input class="input" inputMode="numeric" value={barcode} onInput={(e) => setBarcode((e.target as HTMLInputElement).value.replace(/\D/g, ''))} /></Field>
      </div>

      <div class="section-label">Serving</div>
      <div class="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
          <Field label="Serving size"><input class="input" value={servingLabel} placeholder="e.g. 2/3 cup" onInput={(e) => setServingLabel((e.target as HTMLInputElement).value)} /></Field>
          {!unknownWeight && <Field label={liquid ? 'Volume (ml)' : 'Weight (g)'}><NumInput class="input" value={servingG} onChange={setServingG} placeholder={liquid ? 'ml' : 'g'} /></Field>}
        </div>
        <div class="row between" style={{ marginTop: 4 }}>
          <span class="small">I don't know the weight</span>
          <Toggle checked={unknownWeight} onChange={setUnknownWeight} />
        </div>
        {!unknownWeight && (
          <div class="row between" style={{ marginTop: 10 }}>
            <span class="small">Liquid (measured in ml)</span>
            <Toggle checked={liquid} onChange={setLiquid} />
          </div>
        )}
        <p class="hint" style={{ marginBottom: 0 }}>The weight is printed next to the serving size, e.g. “2/3 cup (55g)”. With it you can log by grams or ounces.</p>
      </div>

      <div class="section-label">Nutrition facts per serving</div>
      <div class="list">{LABEL_ORDER.map(row)}</div>
      {mismatch && <p class="hint pad">The macros add up to about {Math.round(implied)} kcal. Labels round values, but a big gap usually means a typo.</p>}
      <button class="text-btn muted" onClick={() => setMore(!more)}>{more ? 'Hide' : 'Show'} vitamins &amp; minerals</button>
      {more && <div class="list" style={{ marginTop: 8 }}>{extraKeys.map(row)}</div>}

      {existing && <button class="btn danger block" style={{ marginTop: 16 }} onClick={remove}>Delete food</button>}
      {existing && <p class="hint pad">Changes apply to future logs. Past entries keep the values they were logged with.</p>}
      <div class="footer-bar"><div><button class="btn block" disabled={!valid} onClick={save}>{existing ? 'Save' : inFlow ? 'Save & continue' : 'Save food'}</button></div></div>
    </Screen>
  );
}
