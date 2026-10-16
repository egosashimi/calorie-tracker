import { describe, expect, it } from 'vitest';
import { fdcToFood, offProductToFood } from '../src/lib/online';
import { extractJson, parseLabel, parseMeal } from '../src/lib/ai';
import { normalizeScan, upcEtoA, validGtin } from '../src/lib/barcode-utils';
import { fmtQty } from '../src/lib/foods';

describe('Open Food Facts', () => {
  it('maps per-100 g nutriments and servings', () => {
    const f = offProductToFood({
      code: '0049000028911', product_name: 'Coca-Cola Classic', brands: 'Coca-Cola,The Coca-Cola Company',
      serving_size: '12 fl oz (355 ml)', serving_quantity: 355, quantity: '355 ml',
      nutriments: { 'energy-kcal_100g': 39.4, carbohydrates_100g: 10.99, sugars_100g: 10.99, sodium_100g: 0.0127, proteins_100g: 0, fat_100g: 0 },
    })!;
    expect(f.per100.kcal).toBeCloseTo(39.4);
    expect(f.per100.sodium).toBeCloseTo(12.7);
    expect(f.servings[0]).toEqual({ label: '12 fl oz', g: 355 });
    expect(f.liquid).toBe(true);
    expect(f.brand).toBe('Coca-Cola');
  });

  it('falls back to kJ and per-serving values', () => {
    const f = offProductToFood({ code: '1', product_name: 'Bar', serving_quantity: 40, nutriments: { 'energy-kcal_serving': 200, proteins_serving: 10 } })!;
    expect(f.per100.kcal).toBeCloseTo(500);
    expect(f.per100.protein).toBeCloseTo(25);
    const g = offProductToFood({ code: '2', product_name: 'Oats', nutriments: { energy_100g: 1569 } })!;
    expect(g.per100.kcal).toBeCloseTo(375, 0);
  });

  it('rejects products without energy', () => {
    expect(offProductToFood({ code: '3', product_name: 'Mystery', nutriments: {} })).toBeNull();
  });
});

describe('USDA FoodData Central', () => {
  it('maps branded search results', () => {
    const f = fdcToFood({
      fdcId: 123, description: 'GREEK YOGURT, PLAIN', brandName: 'FAGE', gtinUpc: '689544080503', dataType: 'Branded',
      servingSize: 170, servingSizeUnit: 'g', householdServingFullText: '1 container',
      foodNutrients: [
        { nutrientId: 1008, value: 53 }, { nutrientId: 1003, value: 10.6 }, { nutrientId: 1004, value: 0 },
        { nutrientId: 1005, value: 3.5 }, { nutrientId: 1093, value: 38 }, { nutrientId: 1110, value: 40 },
      ],
    })!;
    expect(f.name).toBe('Greek Yogurt, Plain');
    expect(f.brand).toBe('Fage');
    expect(f.per100.protein).toBe(10.6);
    expect(f.per100.vitD).toBeCloseTo(1);
    expect(f.servings[0]).toEqual({ label: '1 container', g: 170 });
  });

  it('uses Atwater energy for Foundation foods', () => {
    const f = fdcToFood({ fdcId: 1, description: 'Apple', foodNutrients: [{ nutrientId: 2047, value: 61 }] })!;
    expect(f.per100.kcal).toBe(61);
  });
});

describe('AI replies', () => {
  const reply = `Here's my estimate:

\`\`\`json
{"tally":1,"items":[{"name":"Burrito bowl","amount":"1 bowl","grams":520,"kcal":"845","protein":52,"carbs":78,"fat":34,},
{"name":"Chips","amount":"small bag","kcal":540,"protein":7,"carbs":73,"fat":25}]}
\`\`\`
Let me know if you want changes.`;

  it('extracts JSON from prose, fences and trailing commas', () => {
    const items = parseMeal(reply);
    expect(items).toHaveLength(2);
    expect(items[0].n.kcal).toBe(845);
    expect(items[0].grams).toBe(520);
    expect(items[1].grams).toBeUndefined();
  });

  it('handles smart quotes and bare arrays', () => {
    expect(extractJson('[{“name”: “Egg”, “kcal”: 72}]')).toEqual([{ name: 'Egg', kcal: 72 }]);
    expect(() => parseMeal('no json here')).toThrow();
  });

  it('parses nutrition labels', () => {
    const l = parseLabel('{"tally":1,"food":{"name":"Granola","servingLabel":"2/3 cup","servingGrams":55,"kcal":240,"fat":9,"sodium":95,"protein":6,"vitD":null}}');
    expect(l.servingGrams).toBe(55);
    expect(l.n.kcal).toBe(240);
    expect(l.n.vitD).toBeUndefined();
  });
});

describe('barcodes', () => {
  it('expands UPC-E and validates check digits', () => {
    expect(upcEtoA('04252614')).toBe('042100005264');
    expect(validGtin('042100005264')).toBe(true);
    expect(validGtin('0049000028911')).toBe(true);
    expect(validGtin('0049000028912')).toBe(false);
    expect(normalizeScan('04252614', 'upc_e')).toBe('042100005264');
  });
});

describe('formatting', () => {
  it('does not double up counts in household measures', () => {
    expect(fmtQty(1, '1 item, 7.6 oz')).toBe('1 item, 7.6 oz');
    expect(fmtQty(2, '1 cup')).toBe('2 × 1 cup');
    expect(fmtQty(150, 'g')).toBe('150 g');
    expect(fmtQty(1.5, 'serving')).toBe('1.5 serving');
  });
});
