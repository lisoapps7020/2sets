// Sin acceso al CDN de Three.js (correr con --host-resolver-rules "MAP cdn.jsdelivr.net ~NOTFOUND"):
// la tarjeta avisa que necesita conexión y el resto de Progreso sigue funcionando.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const res = {};
await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
location.hash = '#/progreso';
await sleep(1500);
for (let i = 0; i < 20 && ($('[data-avatar-status]')?.textContent || '').startsWith('Cargando'); i++) await sleep(500);
res.status = $('[data-avatar-status]')?.textContent;
res.sections = $$('[data-sheet]').map((x) => x.dataset.sheet);
res.unlocksListed = $$('[data-unlock]').length;
res.customizerWorks = (() => {
  $$('[data-sheet=avatar] .btn').find((b) => b.textContent === 'Personalizar').click();
  return $$('[data-avatar=hair] .seg-btn').length;
})();
return res;
