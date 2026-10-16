import { render } from 'preact';
import { App } from './app';
import { loadState } from './lib/store';
import './styles.css';

async function boot() {
  await loadState();
  render(<App />, document.getElementById('app')!);
  // Ask the browser not to evict our database under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }
}

boot();
