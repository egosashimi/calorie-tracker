import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string[]; query: URLSearchParams; raw: string }

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q ?? ''), raw };
}

// Navigation depth lives in history.state so "back" knows whether there is an in-app page to return to
// (a home-screen app has no browser back button, and history.back() with no history does nothing).
const depth = (): number => (history.state && typeof history.state.d === 'number' ? history.state.d : 0);

// Paths by depth, so a multi-step flow (search → scan → food) can return to where it started.
const STACK_KEY = 'tally.nav';
function loadStack(): string[] {
  try { return JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]'); } catch { return []; }
}
function saveStack(d: number, path: string) {
  const s = loadStack().slice(0, d);
  s[d] = path;
  try { sessionStorage.setItem(STACK_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
if (typeof window !== 'undefined') saveStack(depth(), location.hash.replace(/^#/, '') || '/');

export function go(to: string, opts: { replace?: boolean } = {}) {
  const url = '#' + to;
  if (opts.replace) history.replaceState({ d: depth() }, '', url);
  else history.pushState({ d: depth() + 1 }, '', url);
  saveStack(depth(), to);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

const FLOW = ['add', 'food', 'scan', 'quick', 'ai', 'custom-food'];

/** Leave an add-food flow, returning to the page that started it (log, dashboard, recipe…). */
export function exitFlow(fallback = '/log') {
  const d = depth();
  const stack = loadStack();
  for (let i = d - 1; i >= 0; i--) {
    const head = (stack[i] ?? '').split('?')[0].split('/').filter(Boolean)[0] ?? '';
    if (stack[i] != null && !FLOW.includes(head)) {
      history.go(i - d);
      return;
    }
  }
  go(fallback, { replace: true });
}

export function back(fallback = '/') {
  if (depth() > 0) history.back();
  else go(fallback, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const f = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}
