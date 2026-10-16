import { useEffect } from 'preact/hooks';
import { useRoute, go, qs } from './router';
import { useAppState } from './lib/store';
import { Icon } from './ui/icons';
import { Toaster } from './ui/components';
import { Today } from './views/Today';
import { Log } from './views/Log';
import { AddFood } from './views/AddFood';
import { FoodDetail } from './views/FoodDetail';
import { Scan } from './views/Scan';
import { QuickAdd } from './views/QuickAdd';
import { AiLog } from './views/Ai';
import { CustomFood } from './views/CustomFood';
import { MyFoods } from './views/MyFoods';
import { RecipeList, RecipeEditor } from './views/Recipes';
import { Progress } from './views/Progress';
import { WeightLog } from './views/Weight';
import { PlanView, CheckInView, Setup } from './views/Plan';
import { NutrientsView } from './views/Nutrients';
import { More, SettingsView, DataView, AboutView } from './views/More';

const TABS = [
  { id: '', label: 'Today', icon: 'today' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'add', label: '', icon: 'plus' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'more', label: 'More', icon: 'more' },
];
const TAB_ROUTES = ['', 'log', 'progress', 'more', 'plan'];

export function App() {
  const route = useRoute();
  const { settings } = useAppState();
  const [head = ''] = route.path;

  useEffect(() => {
    if (!settings.onboarded && head !== 'setup' && head !== 'about' && head !== 'data') go('/setup?first=1', { replace: true });
  }, [settings.onboarded, head]);

  let view;
  switch (head) {
    case '': view = <Today />; break;
    case 'log': view = <Log day={route.path[1]} />; break;
    case 'add': view = <AddFood q={route.query} />; break;
    case 'food': view = <FoodDetail q={route.query} />; break;
    case 'scan': view = <Scan q={route.query} />; break;
    case 'quick': view = <QuickAdd q={route.query} />; break;
    case 'ai': view = <AiLog q={route.query} />; break;
    case 'custom-food': view = <CustomFood id={route.path[1]} q={route.query} />; break;
    case 'foods': view = <MyFoods />; break;
    case 'recipes': view = <RecipeList />; break;
    case 'recipe': view = <RecipeEditor id={route.path[1]} />; break;
    case 'progress': view = <Progress />; break;
    case 'weight': view = <WeightLog />; break;
    case 'plan': view = <PlanView />; break;
    case 'checkin': view = <CheckInView />; break;
    case 'setup': view = <Setup q={route.query} />; break;
    case 'nutrients': view = <NutrientsView q={route.query} />; break;
    case 'more': view = <More />; break;
    case 'settings': view = <SettingsView />; break;
    case 'data': view = <DataView />; break;
    case 'about': view = <AboutView />; break;
    default: view = <Today />;
  }

  const showTabs = TAB_ROUTES.includes(head) && settings.onboarded;
  return (
    <>
      {view}
      {showTabs && (
        <nav class="tabbar" aria-label="Main">
          <div class="tabbar-inner">
            {TABS.map((t) => t.id === 'add' ? (
              <button key="add" class="tab tab-add" aria-label="Add" onClick={() => go('/add' + qs({ date: head === 'log' && /^\d{4}-\d{2}-\d{2}$/.test(route.path[1] ?? '') ? route.path[1] : undefined }))}>
                <span><Icon name="plus" size={24} /></span>
              </button>
            ) : (
              <button key={t.id} class={`tab${head === t.id || (t.id === 'more' && head === 'plan') ? ' active' : ''}`} onClick={() => go('/' + t.id, { replace: true })}>
                <Icon name={t.icon} />
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <Toaster />
    </>
  );
}
