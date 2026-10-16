export const LB_PER_KG = 2.2046226218;
export const G_PER_OZ = 28.349523125;
export const ML_PER_FLOZ = 29.5735295625;
export const CM_PER_IN = 2.54;

export type WeightUnit = 'lb' | 'kg';

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}

export function fromDisplayWeight(v: number, unit: WeightUnit): number {
  return unit === 'lb' ? v / LB_PER_KG : v;
}

export function fmtWeight(kg: number | undefined, unit: WeightUnit, decimals = 1): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return toDisplayWeight(kg, unit).toFixed(decimals);
}

export function fmtSigned(v: number, decimals = 1): string {
  const s = Math.abs(v).toFixed(decimals);
  if (Number(s) === 0) return (0).toFixed(decimals);
  return (v > 0 ? '+' : '−') + s;
}

/** Parse a user-entered number that may use a comma decimal separator or simple fractions ("1/2", "1 1/2"). */
export function parseNum(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!s) return null;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function trimNum(v: number, decimals = 2): string {
  return String(Math.round(v * 10 ** decimals) / 10 ** decimals);
}
