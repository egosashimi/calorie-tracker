import { useEffect, useState } from 'preact/hooks';
import { Screen, TopBar, NumInput, Segmented, toast } from '../ui/components';
import { Icon } from '../ui/icons';
import { exitFlow, go } from '../router';
import { useAppState } from '../lib/store';
import { relativeDay, today } from '../lib/date';
import { mealPrompt, parseMeal, PROVIDERS, type AiItem, type AiProvider } from '../lib/ai';
import { perServingFood, uid, type Food } from '../lib/foods';
import { scale } from '../lib/nutrients';
import { defaultMeal, logFood } from '../lib/actions';

const DRAFT = 'tally.aiDraft';
interface Draft { text: string; photo: boolean; reply: string; at: number }

function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null') as Draft | null;
    return d && Date.now() - d.at < 6 * 3600e3 ? d : null;
  } catch { return null; }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Open the assistant. A real link click is used because iOS home-screen apps block window.open without one. */
export function openExternal(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function AiLog({ q }: { q: URLSearchParams }) {
  const { settings } = useAppState();
  const draft = loadDraft();
  const [text, setText] = useState(q.get('text') ?? draft?.text ?? '');
  const [photo, setPhoto] = useState(draft?.photo ?? false);
  const [reply, setReply] = useState(draft?.reply ?? '');
  const [items, setItems] = useState<(AiItem & { on: boolean })[] | null>(null);
  const [error, setError] = useState('');
  const [meal, setMeal] = useState(q.has('meal') ? Number(q.get('meal')) : defaultMeal());
  const date = q.get('date') ?? today();

  useEffect(() => {
    try { localStorage.setItem(DRAFT, JSON.stringify({ text, photo, reply, at: Date.now() })); } catch { /* ignore */ }
  }, [text, photo, reply]);

  const ask = async (p: AiProvider) => {
    const prompt = mealPrompt(text, photo);
    const copied = await copyText(prompt);
    if (photo) {
      toast(copied ? 'Prompt copied — paste it and attach your photo' : 'Copy the prompt below first');
      openExternal(PROVIDERS[p].home);
    } else {
      openExternal(PROVIDERS[p].withPrompt(prompt));
    }
  };

  const parse = (raw: string) => {
    setError('');
    try {
      setItems(parseMeal(raw).map((i) => ({ ...i, on: true })));
    } catch (e: any) {
      setItems(null);
      setError(e.message);
    }
  };

  const paste = async () => {
    const clip = await readClipboard();
    if (clip == null) { setError('Clipboard access was blocked. Long-press the box below and choose Paste.'); return; }
    setReply(clip);
    parse(clip);
  };

  const logAll = async () => {
    if (!items) return;
    const chosen = items.filter((i) => i.on);
    for (const it of chosen) {
      const base = { id: `ai:${uid()}`, name: it.name, source: 'ai' as const, note: text.slice(0, 200) };
      let food: Food;
      if (it.grams) food = { ...base, per100: scale(it.n, 100 / it.grams), servings: [{ label: it.amount || 'portion', g: it.grams }] };
      else food = perServingFood(base, it.n, it.amount || 'portion');
      await logFood(food, 1, food.servings[0].label, date, meal);
    }
    try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
    toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'}`);
    exitFlow(`/log/${date}`);
  };

  const update = (i: number, patch: Partial<AiItem & { on: boolean }>) =>
    setItems((list) => list!.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const setN = (i: number, k: 'kcal' | 'protein' | 'fat' | 'carbs', v: number | null) =>
    setItems((list) => list!.map((it, j) => (j === i ? { ...it, n: { ...it.n, [k]: v ?? 0 } } : it)));

  const primary = settings.ai;
  const secondary: AiProvider = primary === 'claude' ? 'chatgpt' : 'claude';
  const total = items?.filter((i) => i.on).reduce((s, i) => s + (i.n.kcal ?? 0), 0) ?? 0;

  return (
    <Screen tabs={false}>
      <TopBar title="Describe a meal" backTo="/log" right={<button class="icon-btn" aria-label="How this works" onClick={() => go('/about#ai')}><Icon name="info" /></button>} />

      <div class="section-label">1 · Ask your assistant</div>
      <Segmented<'text' | 'photo'> value={photo ? 'photo' : 'text'} onChange={(v) => setPhoto(v === 'photo')} options={[['text', 'Describe'], ['photo', 'Photo']]} />
      <textarea class="textarea" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        placeholder={photo ? 'Optional notes, e.g. "about half the rice"' : 'e.g. Chipotle chicken burrito bowl with white rice, black beans, fajita veggies, mild salsa, cheese and guac'} />
      <div class="btn-row" style={{ marginTop: 10 }}>
        <button class="btn" disabled={!photo && !text.trim()} onClick={() => ask(primary)}>Ask {PROVIDERS[primary].label}</button>
        <button class="btn ghost" disabled={!photo && !text.trim()} onClick={() => ask(secondary)}>{PROVIDERS[secondary].label}</button>
      </div>
      <p class="hint pad" style={{ marginTop: 8 }}>
        {photo
          ? 'The prompt is copied for you. In the app, paste it, attach your photo, and send.'
          : 'Opens the app with the prompt filled in, using your own subscription. No API key needed.'}
        {' '}<button class="link" onClick={async () => toast((await copyText(mealPrompt(text, photo))) ? 'Prompt copied' : "Couldn't copy")}>Copy prompt</button>
      </p>

      <div class="section-label">2 · Bring the reply back</div>
      <button class="btn secondary block" onClick={paste}><Icon name="clipboard" size={18} />Paste reply from clipboard</button>
      <textarea class="textarea" style={{ marginTop: 8, minHeight: 80 }} value={reply} placeholder="…or paste it here"
        onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setReply(v); if (v.includes('{')) parse(v); }} />
      {error && <p class="hint pad" style={{ color: 'var(--warn)' }}>{error}</p>}

      {items && (
        <>
          <div class="section-label">3 · Review <span class="num">{Math.round(total)} kcal</span></div>
          <div class="list">
            {items.map((it, i) => (
              <div class="item" key={i} style={{ display: 'block', opacity: it.on ? 1 : 0.45 }}>
                <div class="row">
                  <input type="checkbox" checked={it.on} onChange={(e) => update(i, { on: (e.target as HTMLInputElement).checked })} style={{ width: 20, height: 20 }} />
                  <input class="input grow" style={{ height: 36 }} value={it.name} onInput={(e) => update(i, { name: (e.target as HTMLInputElement).value })} />
                </div>
                <div class="small muted" style={{ margin: '6px 0 6px 30px' }}>{it.amount}{it.grams ? ` · ${Math.round(it.grams)} g` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginLeft: 30 }}>
                  {(['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => (
                    <label key={k} class="tiny muted">{k === 'kcal' ? 'kcal' : k[0].toUpperCase() + ' g'}
                      <NumInput class="inline-input" style={{ width: '100%', marginTop: 2 }} value={it.n[k] ?? null} decimals={1} onChange={(v) => setN(i, k, v)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div class="chips" style={{ margin: '4px 0 6px' }}>
            {settings.meals.map((m, i) => <button key={m} class={`chip${i === meal ? ' on' : ''}`} onClick={() => setMeal(i)}>{m}</button>)}
          </div>
          <div class="hint pad">{relativeDay(date)} · AI numbers are estimates; adjust anything that looks off.</div>
          <div class="footer-bar"><div><button class="btn block" disabled={!items.some((i) => i.on)} onClick={logAll}>Add {items.filter((i) => i.on).length} to {settings.meals[meal]}</button></div></div>
        </>
      )}
    </Screen>
  );
}
