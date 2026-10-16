import { useState } from 'preact/hooks';
import { Screen, TopBar, Empty } from '../ui/components';
import { Icon } from '../ui/icons';
import { go, qs } from '../router';
import { useQuery } from '../lib/store';
import { all } from '../lib/db';
import { displayServing, kcalPerServing } from '../lib/foods';
import { normalize } from '../lib/usda';
import { foodCache } from '../lib/actions';

export function MyFoods() {
  const foods = useQuery(() => all('foods'), [], ['foods']) ?? [];
  const [filter, setFilter] = useState('');
  const list = foods
    .filter((f) => f.source === 'custom' || f.source === 'off' || f.source === 'fdc')
    .filter((f) => !filter || normalize(`${f.name} ${f.brand ?? ''}`).includes(normalize(filter)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const custom = list.filter((f) => f.source === 'custom');
  const scanned = list.filter((f) => f.source !== 'custom');

  return (
    <Screen tabs={false}>
      <TopBar title="My foods" backTo="/more" right={<button class="icon-btn" aria-label="New food" onClick={() => go('/custom-food')}><Icon name="plus" /></button>} />
      <div class="search"><Icon name="search" /><input class="input" type="search" placeholder="Filter" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} /></div>
      {!list.length && <Empty title="No foods yet">Create foods from nutrition labels, or scan a barcode — scanned products are saved here for offline use.</Empty>}
      {custom.length > 0 && <div class="section-label">Created by you</div>}
      {custom.length > 0 && (
        <div class="list">
          {custom.map((f) => (
            <button class="item" key={f.id} onClick={() => go(`/custom-food/${f.id.slice(5)}`)}>
              <div class="grow"><div class="title ellipsis">{f.name}</div><div class="sub ellipsis">{f.brand ? `${f.brand} · ` : ''}{displayServing(f)}</div></div>
              <div class="value">{Math.round(kcalPerServing(f))}<span class="unit">kcal</span></div>
            </button>
          ))}
        </div>
      )}
      {scanned.length > 0 && <div class="section-label">Scanned &amp; saved</div>}
      {scanned.length > 0 && (
        <div class="list">
          {scanned.map((f) => (
            <button class="item" key={f.id} onClick={() => { foodCache.set(f.id, f); go('/food' + qs({ key: f.id })); }}>
              <div class="grow"><div class="title ellipsis">{f.name}</div><div class="sub ellipsis">{f.brand ? `${f.brand} · ` : ''}{f.barcode ?? ''}</div></div>
              <div class="value">{Math.round(f.servings.length ? kcalPerServing(f) : f.per100.kcal ?? 0)}<span class="unit">kcal</span></div>
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}
