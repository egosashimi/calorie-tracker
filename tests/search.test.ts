import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { searchUsda, stem } from '../src/lib/usda';

beforeAll(() => {
  const data = JSON.parse(readFileSync(new URL('../public/data/usda-sr28.json', import.meta.url), 'utf8'));
  vi.stubGlobal('document', { baseURI: 'http://localhost/' });
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => data }));
});

const top = async (q: string, n = 3) => (await searchUsda(q)).slice(0, n).map((f) => f.name);

describe('local food search', () => {
  it('stems plurals consistently', () => {
    expect(stem('apples')).toBe(stem('apple'));
    expect(stem('berries')).toBe('berry');
    expect(stem('tomatoes')).toBe(stem('tomato'));
    expect(stem('peaches')).toBe(stem('peach'));
  });

  it.each([
    ['apple', 'Apples, raw, with skin'],
    ['banana', 'Bananas, raw'],
    ['egg', 'Egg, whole'],
    ['chicken breast', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'],
    ['whole milk', 'Milk, whole'],
    ['salmon', 'Fish, salmon, Atlantic'],
    ['white rice', 'Rice, white, long-grain'],
    ['big mac', "McDONALD'S, BIG MAC"],
    ['almonds', 'Nuts, almonds'],
    ['oats', 'Cereals, oats'],
    ['greek yogurt', 'Yogurt, Greek'],
    ['peanut butter', 'Peanut butter'],
    ['broccoli', 'Broccoli, raw'],
    ['avocado', 'Avocados, raw'],
    ['steak', 'Beef, top sirloin'],
    ['bacon', 'Pork, cured, bacon'],
  ])('"%s" finds %s near the top', async (q, expected) => {
    const names = await top(q, 3);
    expect(names.some((n) => n.startsWith(expected)), names.join(' | ')).toBe(true);
  });

  it('puts the everyday version first', async () => {
    expect((await top('chicken breast', 1))[0]).toBe('Chicken, broilers or fryers, breast, meat only, cooked, roasted');
    expect((await top('apple', 1))[0]).toBe('Apples, raw, with skin');
    expect((await top('banana', 1))[0]).toBe('Bananas, raw');
  });
});
