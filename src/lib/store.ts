import { useEffect, useState } from 'preact/hooks';
import { getKV, setKV, onChange, type StoreName } from './db';
import type { Profile, Program } from './program';
import type { AiProvider } from './ai';
import type { WeightUnit } from './units';

export interface Settings {
  weightUnit: WeightUnit;
  heightUnit: 'in' | 'cm';
  waterUnit: 'oz' | 'ml';
  meals: string[];
  theme: 'system' | 'light' | 'dark';
  fdcKey: string;
  ai: AiProvider;
  waterGoalMl: number;
  showMicros: boolean;
  lastBackup?: number;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  weightUnit: 'lb',
  heightUnit: 'in',
  waterUnit: 'oz',
  meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
  theme: 'system',
  fdcKey: '',
  ai: 'claude',
  waterGoalMl: 2400,
  showMicros: true,
  onboarded: false,
};

interface State { settings: Settings; profile?: Profile; program?: Program; ready: boolean }

let state: State = { settings: DEFAULT_SETTINGS, ready: false };
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export async function loadState() {
  const [settings, profile, program] = await Promise.all([
    getKV<Settings>('settings'), getKV<Profile>('profile'), getKV<Program>('program'),
  ]);
  state = { settings: { ...DEFAULT_SETTINGS, ...settings }, profile, program, ready: true };
  applyTheme(state.settings.theme);
  notify();
}

export function getState() {
  return state;
}

export async function saveSettings(patch: Partial<Settings>) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  if (patch.theme) applyTheme(patch.theme);
  notify();
  await setKV('settings', state.settings);
}

export async function saveProfile(profile: Profile) {
  state = { ...state, profile };
  notify();
  await setKV('profile', profile);
}

export async function saveProgram(program: Program) {
  state = { ...state, program };
  notify();
  await setKV('program', program);
}

export function useAppState(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return state;
}

function applyTheme(theme: Settings['theme']) {
  if (typeof document === 'undefined') return;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Run an async query and re-run it whenever one of the given stores changes.
 * Returns undefined until the first result arrives.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[], stores: StoreName[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const run = () => {
      const my = ++seq;
      fn().then((v) => alive && my === seq && setValue(() => v)).catch((e) => console.error(e));
    };
    run();
    const off = onChange((s) => stores.includes(s) && run());
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
