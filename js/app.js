import * as home from './screens/home.js';
import * as session from './screens/session.js';
import * as history from './screens/history.js';
import * as progress from './screens/progress.js';
import * as settings from './screens/settings.js';
import { restoreRest } from './timer.js';

const ROUTES = {
  '/inicio': home,
  '/entrenar': session,
  '/historial': history,
  '/progreso': progress,
  '/ajustes': settings,
};

let current = null;

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

export function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('theme') || 'auto'; } catch {}
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function parseHash() {
  const raw = (location.hash || '#/inicio').slice(1);
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/inicio', query: Object.fromEntries(new URLSearchParams(qs)) };
}

async function route() {
  const { path, query } = parseHash();
  const mod = ROUTES[path] || home;
  try { current?.destroy?.(); } catch {}
  const main = document.getElementById('screen');
  main.replaceChildren();
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${path}`));
  current = mod;
  window.scrollTo(0, 0);
  try {
    await mod.render(main, { navigate, query });
  } catch (err) {
    console.error(err);
    main.replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Algo falló al abrir esta pantalla. Probá de nuevo.';
    main.append(p);
  }
}

window.addEventListener('hashchange', route);
applyTheme();
route();
restoreRest();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
