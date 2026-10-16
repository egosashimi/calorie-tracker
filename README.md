# Tally

A private calorie, macro and weight tracker that runs as a web app on your iPhone. It's modelled on MacroFactor: adaptive expenditure, weekly check-ins, a food database, barcode scanning and recipes. There's no account and no server. **Your data never leaves your device.**

## Privacy: how a public GitHub Pages site keeps your data private

GitHub Pages only hosts the app's *code*, which contains no personal data. Everything you log (food, weights, measurements, settings) is saved in the browser's private on-device database (IndexedDB) on your phone. Nothing is ever uploaded. Someone who opens the same URL gets an empty app of their own.

The only network requests are:
- **Food search and barcode lookups**, which send just the search text or barcode number to Open Food Facts and USDA FoodData Central.
- **AI features**, which send only what you choose, to the Claude or ChatGPT app you pick.

Because the data lives only on the phone, back it up: **More → Backup & data → Save backup**. This writes one JSON file you can save to iCloud Drive or Files. Restore it on any device.

## Install on iPhone

1. Open the site in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Always launch it from the Home Screen icon.

Notes:
- Home Screen web apps get their own storage, and Safari's 7-day cleanup of website data doesn't apply to them.
- That storage is separate from Safari tabs, so don't switch between the two.
- Deleting the Home Screen icon deletes its data, so keep backups.
- After the first launch, the app and its built-in food database work offline.

## Deploying (one-time)

1. Merge this branch into `main`.
2. On GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow builds, tests and publishes to `https://<user>.github.io/<repo>/` on every push to `main`.

## Features

**Logging**
- Search the built-in USDA database (8,789 foods, offline), your own foods and recipes, and online Open Food Facts plus USDA Branded data.
- Barcode scanning with the camera, from a photo, or by typing the number. It checks Open Food Facts, then USDA Branded. Products you scan are saved for offline reuse.
- Quick add for calories and macros, with a check that the macros add up.
- Custom foods entered like a nutrition label, with known or unknown serving weight, liquids in ml, full micronutrients and a barcode.
- Recipes with cooked-weight support so portions are weighed accurately. Any logged meal can be saved as a reusable meal.
- Recent, frequent and saved foods. The ＋ button re-logs a food at the amount you used last time.
- Copy the previous day, copy a meal to today or tomorrow, mark a day incomplete, add day notes, and track water.
- Meal names are customizable.

**Coaching (MacroFactor-style)**
- **Trend weight:** an exponentially smoothed average that filters out daily water swings.
- **Adaptive expenditure:** average intake − (least-squares weight slope × 7,700 kcal/kg) over a rolling 21-day window. It starts from Mifflin-St Jeor × activity and blends toward your real data gradually, so it can't jump. Simulated diets converge to within about 50 kcal of the true value in 3–4 weeks (see `tests/`).
- **Weekly check-ins** recompute calorie and macro targets for your goal: lose, maintain or gain at a % of body weight per week.
- Diet styles (balanced, low fat, low carb, keto), protein levels with a BMI-27 cap, calorie shifting across weekdays, and a manual-targets mode.

**Insights**
- Weight, expenditure and intake charts (1M, 3M, 6M, 1Y, All) with touch readouts.
- Nutrition averages and energy balance.
- 35 tracked nutrients with FDA Daily Values. A "partial" flag appears when some logged foods lack data for a nutrient.
- Body fat and body measurements, plus CSV import of weights.

**Data**
- JSON backup and restore (replace or merge).
- CSV exports of daily totals and the full food log.

## Using your Claude / ChatGPT subscription (no API key)

Subscriptions can't be called by other apps; only the paid APIs can. So Tally uses the official app as the "engine":

1. On **Describe a meal**, type what you ate (or choose Photo) and tap **Ask Claude**. The app or claude.ai opens with a prompt already filled in that asks for a strict JSON answer.
2. Send it, then tap **Copy** on the reply.
3. Back in Tally, tap **Paste reply**. Review and edit the items, then add them.

The same bridge works in two other places:
- **Fill from a photo of the label** (when creating a food) reads a Nutrition Facts panel.
- **More → Review my last 4 weeks** sends a summary of your data for coaching.

## Food data accuracy

| Source | What it is |
| --- | --- |
| USDA SR28 (built in) | Lab-analyzed reference data, public domain. Includes many chains (McDonald's, Subway, Taco Bell, Pizza Hut, KFC, Chick-fil-A…) and brands (Kellogg's, General Mills, Campbell's…). |
| USDA FoodData Central Branded | Manufacturer label data for US packaged foods. Add a free API key in Settings to lift the shared demo-key limit. |
| Open Food Facts | Crowd-sourced labels, very broad coverage. Values are shown with their source so you can double-check. |

Every log entry stores a snapshot of the food's values. Editing a food later never rewrites your history.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # algorithm, search, parser tests
npm run build    # production build in dist/
```

The app uses Preact, TypeScript and Vite. A PWA service worker comes from vite-plugin-pwa, barcode decoding uses ZXing (WASM, served locally), and storage uses IndexedDB via `idb`. `scripts/build-foods.mjs` builds the offline food database from the USDA SR28 files in the `fda-nutrient-database` package, with sanity checks against known values.
