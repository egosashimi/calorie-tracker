import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { back } from '../router';
import { NUTRIENTS, fmtAmount, type NutrientKey, type Nutrients } from '../lib/nutrients';
import type { MacroTargets } from '../lib/program';
import { parseNum, trimNum } from '../lib/units';

export function Screen({ children, tabs = true }: { children: ComponentChildren; tabs?: boolean }) {
  return <main class={`screen${tabs ? '' : ' no-tabs'}`}>{children}</main>;
}

export function TopBar({ title, backTo, left, right }: { title?: ComponentChildren; backTo?: string; left?: ComponentChildren; right?: ComponentChildren }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <header class={`topbar${scrolled ? ' scrolled' : ''}`}>
      <div class="left">
        {backTo != null ? (
          <button class="icon-btn" aria-label="Back" onClick={() => back(backTo)}><Icon name="back" /></button>
        ) : left}
      </div>
      <div class="title">{title}</div>
      <div class="right">{right}</div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="grabber" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </>
  );
}

// ---------- toast ----------
type ToastMsg = { text: string; action?: { label: string; run: () => void }; id: number };
let toastSet: ((t: ToastMsg | null) => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, action?: ToastMsg['action']) {
  clearTimeout(toastTimer);
  toastSet?.({ text, action, id: Date.now() });
  toastTimer = setTimeout(() => toastSet?.(null), action ? 5000 : 2400);
}
export function Toaster() {
  const [t, setT] = useState<ToastMsg | null>(null);
  toastSet = setT;
  if (!t) return null;
  return (
    <div class="toast" role="status" key={t.id}>
      <span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.run(); setT(null); }}>{t.action.label}</button>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ComponentChildren; children: ComponentChildren; hint?: ComponentChildren }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <div class="hint" style={{ marginTop: 6 }}>{hint}</div>}
    </label>
  );
}

/** Numeric text input that keeps the user's raw text while editing. */
export function NumInput({ value, onChange, class: cls = 'input', placeholder, autoFocus, decimals = 2, ...rest }: {
  value: number | null | undefined; onChange: (v: number | null) => void; class?: string; placeholder?: string; autoFocus?: boolean; decimals?: number;
} & Omit<JSX.HTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'class'>) {
  const fmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : trimNum(v, decimals));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 60);
  }, []);
  return (
    <input
      ref={ref}
      {...rest}
      class={cls}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onFocus={(e) => { focused.current = true; (e.target as HTMLInputElement).select(); }}
      onBlur={() => { focused.current = false; setText(fmt(value)); }}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        onChange(parseNum(t));
      }}
    />
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={String(v)} role="tab" aria-selected={v === value} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Bar({ value, max, color, thin }: { value: number; max: number; color?: string; thin?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div class={`bar${thin ? ' thin' : ''}`}><i class={color} style={{ width: `${pct}%` }} /></div>;
}

const MACROS: { key: 'protein' | 'fat' | 'carbs'; label: string }[] = [
  { key: 'protein', label: 'Protein' }, { key: 'fat', label: 'Fat' }, { key: 'carbs', label: 'Carbs' },
];

export function MacroBars({ n, t }: { n: Nutrients; t: MacroTargets | null }) {
  return (
    <div class="kv">
      {MACROS.map((m) => {
        const v = n[m.key] ?? 0;
        const target = t?.[m.key];
        return (
          <div key={m.key}>
            <div class="k row" style={{ gap: 6 }}><span class={`macro-dot bg-${m.key}`} />{m.label}</div>
            <div class="v">{Math.round(v)}<span class="unit">{target ? `/ ${target} g` : 'g'}</span></div>
            {target ? <div style={{ marginTop: 6 }}><Bar value={v} max={target} color={`bg-${m.key}`} thin /></div> : null}
          </div>
        );
      })}
    </div>
  );
}

export function MacroLine({ n }: { n: Nutrients }) {
  return (
    <div class="macro-line">
      <span><b class="c-protein">P</b> {Math.round(n.protein ?? 0)}</span>
      <span><b class="c-fat">F</b> {Math.round(n.fat ?? 0)}</span>
      <span><b class="c-carbs">C</b> {Math.round(n.carbs ?? 0)}</span>
    </div>
  );
}

/** Proportion of calories from each macro. */
export function MacroSplit({ n }: { n: Nutrients }) {
  const p = (n.protein ?? 0) * 4, f = (n.fat ?? 0) * 9, c = (n.carbs ?? 0) * 4;
  const total = p + f + c;
  if (!total) return <div class="split"><i style={{ flex: 1, background: 'var(--track)' }} /></div>;
  return (
    <div class="split">
      {p > 0 && <i class="bg-protein" style={{ flex: p }} />}
      {f > 0 && <i class="bg-fat" style={{ flex: f }} />}
      {c > 0 && <i class="bg-carbs" style={{ flex: c }} />}
    </div>
  );
}

const INDENT: NutrientKey[] = ['fiber', 'sugar', 'addedSugar', 'satFat', 'monoFat', 'polyFat', 'transFat'];

export function NutrientTable({ n, groups, showMissing = false }: { n: Nutrients; groups: string[]; showMissing?: boolean }) {
  const rows = NUTRIENTS.filter((d) => groups.includes(d.group) && (showMissing || n[d.key] != null));
  if (!rows.length) return <div class="list-empty">No data for these nutrients.</div>;
  return (
    <div>
      {rows.map((d) => {
        const v = n[d.key];
        const pct = d.dv && v != null ? (v / d.dv) * 100 : null;
        return (
          <div class={`nt-row${INDENT.includes(d.key) ? ' indent' : ''}`} key={d.key}>
            <span>{d.label}</span>
            <span class="amt">{v == null ? '—' : `${fmtAmount(v, d.unit)} ${d.unit}`}</span>
            <span class="dv">{pct == null ? '' : `${Math.round(pct)}%`}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ComponentChildren }) {
  return <div class="empty-state"><div class="bold">{title}</div><div class="small">{children}</div></div>;
}

export function useWidth<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
