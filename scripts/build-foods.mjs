// Builds the bundled offline food database from the official USDA National
// Nutrient Database for Standard Reference, Release 28 (public domain).
// Output: public/data/usda-sr28.json — per-100 g values plus household measures.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/data/usda-sr28.json');
const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('fda-nutrient-database/package.json'));
const src = (f) => readFileSync(join(pkgDir, 'data', f), 'latin1');

if (existsSync(out) && statSync(out).mtimeMs > statSync(join(pkgDir, 'data/ABBREV.txt')).mtimeMs
    && statSync(out).mtimeMs > statSync(fileURLToPath(import.meta.url)).mtimeMs) {
  console.log('usda-sr28.json is up to date');
  process.exit(0);
}

// SR28 field order (sr28_doc.pdf, ABBREV file). Index -> app nutrient key.
const ABBREV_MAP = {
  3: 'kcal', 4: 'protein', 5: 'fat', 7: 'carbs', 8: 'fiber', 9: 'sugar',
  10: 'calcium', 11: 'iron', 12: 'magnesium', 13: 'phosphorus', 14: 'potassium',
  15: 'sodium', 16: 'zinc', 17: 'copper', 18: 'manganese', 19: 'selenium',
  20: 'vitC', 21: 'thiamin', 22: 'riboflavin', 23: 'niacin', 24: 'pantothenic',
  25: 'vitB6', 29: 'folate', 30: 'choline', 31: 'vitB12', 33: 'vitA', 40: 'vitE',
  41: 'vitD', 43: 'vitK', 44: 'satFat', 45: 'monoFat', 46: 'polyFat', 47: 'cholesterol',
};
const KEYS = Object.values(ABBREV_MAP);

const GROUPS = {
  '0100': 'Dairy & eggs', '0200': 'Spices & herbs', '0300': 'Baby foods', '0400': 'Fats & oils',
  '0500': 'Poultry', '0600': 'Soups & sauces', '0700': 'Sausages & deli meats', '0800': 'Breakfast cereals',
  '0900': 'Fruits', '1000': 'Pork', '1100': 'Vegetables', '1200': 'Nuts & seeds', '1300': 'Beef',
  '1400': 'Beverages', '1500': 'Fish & shellfish', '1600': 'Legumes', '1700': 'Lamb, veal & game',
  '1800': 'Baked goods', '1900': 'Sweets', '2000': 'Grains & pasta', '2100': 'Fast food',
  '2200': 'Meals & entrees', '2500': 'Snacks', '3500': 'Traditional foods', '3600': 'Restaurant foods',
};
const groupCodes = Object.keys(GROUPS);

const parse = (text) => text.split(/\r?\n/).filter(Boolean).map((line) =>
  line.split('^').map((f) => f.replace(/^~|~$/g, '')));

const des = new Map();
for (const r of parse(src('FOOD_DES.txt'))) des.set(r[0], { group: r[1], name: r[2], common: r[4], maker: r[5] });

const num = (s) => (s === '' || s == null ? null : Number(s));
const foods = [];
for (const r of parse(src('ABBREV.txt'))) {
  if (r.length < 53) throw new Error(`Unexpected ABBREV row length ${r.length} for ${r[0]}`);
  const d = des.get(r[0]);
  if (!d) continue;
  const values = Object.keys(ABBREV_MAP).map((i) => num(r[i]));
  if (values[0] == null) continue; // no energy value
  while (values.length && values[values.length - 1] == null) values.pop();
  const portions = [];
  for (const [g, label] of [[r[48], r[49]], [r[50], r[51]]]) {
    const grams = num(g);
    if (grams && label) portions.push([grams, label.trim()]);
  }
  const row = [Number(r[0]), d.name, groupCodes.indexOf(d.group), values, portions];
  if (d.common) row.push(d.common);
  foods.push(row);
}

// Everyday foods ranked first in search when they match (USDA names are verified below).
const COMMON = [
  'Apples, raw, with skin', 'Bananas, raw', 'Oranges, raw, all commercial varieties', 'Strawberries, raw', 'Blueberries, raw',
  'Grapes, red or green (European type, such as Thompson seedless), raw', 'Avocados, raw, all commercial varieties', 'Watermelon, raw',
  'Pineapple, raw, all varieties', 'Mangos, raw', 'Raisins, seedless',
  'Egg, whole, raw, fresh', 'Egg, whole, cooked, hard-boiled', 'Egg, whole, cooked, scrambled', 'Egg, whole, cooked, fried', 'Egg, white, raw, fresh',
  'Milk, whole, 3.25% milkfat, with added vitamin D', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D',
  'Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D', 'Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)',
  'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
  'Chicken, broilers or fryers, thigh, meat only, cooked, roasted',
  'Rice, white, long-grain, regular, enriched, cooked', 'Rice, brown, long-grain, cooked', 'Rice, white, long-grain, regular, raw, enriched',
  'Cereals, oats, regular and quick, not fortified, dry', 'Fish, salmon, Atlantic, farmed, cooked, dry heat', 'Fish, salmon, Atlantic, farmed, raw',
  'Fish, tuna, light, canned in water, drained solids', 'Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled', 'Beef, ground, 90% lean meat / 10% fat, raw',
  'Bread, white, commercially prepared (includes soft bread crumbs)', 'Bread, whole-wheat, commercially prepared',
  'Pasta, cooked, enriched, without added salt', 'Pasta, dry, enriched', 'Potatoes, baked, flesh and skin, without salt',
  'Sweet potato, cooked, baked in skin, flesh, without salt', 'Peanut butter, smooth style, with salt', 'Nuts, almonds', 'Nuts, walnuts, english',
  'Oil, olive, salad or cooking', 'Butter, salted', 'Butter, without salt', 'Cheese, cheddar', 'Cheese, mozzarella, whole milk',
  'Cheese, cottage, lowfat, 2% milkfat', 'Cheese, cream', 'Yogurt, Greek, plain, nonfat', 'Yogurt, Greek, plain, whole milk',
  'Beans, black, mature seeds, cooked, boiled, without salt', 'Lentils, mature seeds, cooked, boiled, without salt',
  'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt', 'Spinach, raw', 'Carrots, raw',
  'Tomatoes, red, ripe, raw, year round average', 'Onions, raw', 'Cucumber, with peel, raw', 'Lettuce, cos or romaine, raw', 'Broccoli, raw',
  'Beverages, coffee, brewed, prepared with tap water', 'Sugars, granulated', 'Honey', 'Quinoa, cooked', 'Hummus, commercial',
  'Mushrooms, white, raw', 'Cauliflower, raw', 'Peppers, sweet, red, raw', 'Peppers, sweet, green, raw', 'Squash, summer, zucchini, includes skin, raw',
  'Beans, snap, green, raw', 'Cream, fluid, heavy whipping', 'Cream, fluid, half and half', 'Wheat flour, white, all-purpose, enriched, bleached',
  'Alcoholic beverage, beer, regular, all', 'Alcoholic beverage, wine, table, red', 'Alcoholic beverage, wine, table, white',
  'Beverages, carbonated, cola, fast-food cola', 'Corn, sweet, yellow, cooked, boiled, drained, without salt',
  'Tortillas, ready-to-bake or -fry, flour, refrigerated', 'Tortillas, ready-to-bake or -fry, corn', 'Fish, cod, Atlantic, cooked, dry heat', 'Fish, tilapia, cooked, dry heat',
  'Salad dressing, mayonnaise, regular', 'Catsup', 'Snacks, popcorn, air-popped', 'Snacks, potato chips, plain, salted', 'Ice creams, vanilla',
  'Candies, milk chocolate', 'Beverages, water, tap, drinking', 'Orange juice, raw', 'Celery, raw', 'Kale, raw', 'Garlic, raw', 'Cabbage, raw',
  'Asparagus, raw', 'Pears, raw', 'Peaches, yellow, raw', 'Cherries, sweet, raw', 'Raspberries, raw', 'Lemons, raw, without peel',
  'Seeds, chia seeds, dried', 'Seeds, flaxseed', 'Nuts, cashew nuts, raw', 'Peanuts, all types, raw', 'Nuts, pistachio nuts, raw',
  'Cheese, parmesan, grated', 'Cheese, feta', 'Cheese, swiss', 'Cream, sour, cultured', 'Turkey, all classes, breast, meat and skin, cooked, roasted',
  'Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted', 'Crustaceans, shrimp, cooked (not previously frozen)', 'Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)',
  'Pork, cured, bacon, cooked, baked', 'Pork, cured, bacon, pre-sliced, cooked, pan-fried',
  'Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, broiled',
  'Oil, canola', 'Oil, coconut', 'Jams and preserves', 'Couscous, cooked', 'Bulgur, cooked', 'Barley, pearled, cooked',
  'Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)', 'English muffins, plain, enriched, with ca prop (includes sourdough)',
];

// Sanity checks against well-known reference values so a field-order bug can never ship.
const byId = new Map(foods.map((f) => [f[0], f]));
const expect = (id, key, value) => {
  const v = byId.get(id)[3][KEYS.indexOf(key)];
  if (Math.abs(v - value) > 0.01) throw new Error(`Sanity check failed: ${id} ${key}=${v}, expected ${value}`);
};
expect(1001, 'kcal', 717); expect(1001, 'fat', 81.11); // butter, salted
expect(1123, 'protein', 12.56); // egg, whole, raw
expect(9003, 'kcal', 52); // apple, raw, with skin

const byName = new Map(foods.map((f) => [f[1], f[0]]));
const missing = COMMON.filter((n) => !byName.has(n));
if (missing.length) {
  for (const m of missing) {
    const head = m.split(',').slice(0, 2).join(',');
    console.error(`Common food not found: "${m}". Similar: ${foods.filter((f) => f[1].startsWith(head)).slice(0, 6).map((f) => JSON.stringify(f[1])).join(', ')}`);
  }
  process.exit(1);
}
const common = COMMON.map((n) => byName.get(n));

mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify({
  source: 'USDA National Nutrient Database for Standard Reference, Release 28 (2015, rev. 2016). Public domain.',
  keys: KEYS, groups: groupCodes.map((c) => GROUPS[c]), common, foods,
});
writeFileSync(out, json);
console.log(`Wrote ${foods.length} foods (${(json.length / 1e6).toFixed(2)} MB) to public/data/usda-sr28.json`);
