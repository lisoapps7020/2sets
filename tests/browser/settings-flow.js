// Ajustes: perfil, peso, descansos, incrementos, bandas, complementarios, tema e import.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v) => { input.value = String(v); input.dispatchEvent(new Event('change', { bubbles: true })); };
const sec = (title) => $(`[data-section="${title}"]`);
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');

location.hash = '#/ajustes';
await sleep(900);
res.sections = $$('[data-section]').map((s) => s.dataset.section);

setInput(sec('Perfil').querySelector('input'), '  Julián ');
await sleep(300);
res.name = (await db.getProfile()).name;

const [kg, date] = sec('Peso corporal').querySelectorAll('input');
setInput(kg, '80.4'); setInput(date, '2026-09-20');
sec('Peso corporal').querySelector('.btn').click();
await sleep(500);
res.latestBw = await db.latestBodyweight();
res.bwListed = sec('Peso corporal').innerText.includes('80,4');

res.timerCard = !!sec('Temporizador') && !!sec('Temporizador').querySelector('[data-test-alarm]');

const incDips = sec('Incrementos').querySelectorAll('select')[0];
setInput(incDips, '2.5'); await sleep(300);
res.incDips = (await db.getProfile()).incrementKg.dips;

const [bName, , bAssist] = sec('Bandas elásticas').querySelectorAll('input');
setInput(bName, 'Verde'); setInput(bAssist, '20');
sec('Bandas elásticas').querySelector('.btn').click();
await sleep(500);
res.bandsAfterAdd = (await db.getAll('bands')).length;
sec('Bandas elásticas').querySelector('.list-item .link').click();
await sleep(500);
res.bandsAfterDelete = (await db.getAll('bands')).length;

setInput(sec('Complementarios').querySelector('input'), 'Plancha');
sec('Complementarios').querySelector('.btn').click();
await sleep(500);
res.extrasAfterAdd = (await db.getAll('extras')).length;
$$('[data-section="Complementarios"] .link').find((b) => b.textContent === 'Archivar').click();
await sleep(500);
res.archivedCount = (await db.getAll('extras')).filter((x) => x.archived).length;

$$('[data-section="Tema"] .seg-btn').find((b) => b.textContent === 'Oscuro').click();
await sleep(300);
res.theme = document.documentElement.dataset.theme;
res.themeStored = localStorage.getItem('theme');

// Import: reemplaza todo por un backup con una sesión
const backup = { app: '2sets', schemaVersion: 1, settings: [{ key: 'profile', value: { name: 'Importado' } }], bodyweight: [], bands: [], extras: [],
  sessions: [{ id: 'ses_imp', date: '2026-09-10', day: 'push', status: 'done', startedAt: 1, finishedAt: 2, bodyweightKg: 79, notes: '',
    blocks: { warmup: { items: [true, true, true] }, approach: { sets: [] }, main: { exerciseId: 'dips', sets: [{ load: { mode: 'weight', kg: 20, bandId: null }, reps: 10, done: true }] }, second: { exerciseId: 'decline_pushups', sets: [] }, extra: [] } }] };
const input = $('[data-section="Datos"] input[type=file]');
const dt = new DataTransfer();
dt.items.add(new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' }));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(1200);
res.afterImport = { name: (await db.getProfile()).name, sessions: (await db.listSessions()).map((s) => s.id), bands: (await db.getAll('bands')).length, hash: location.hash };

// Import inválido: rechazado sin tocar datos
location.hash = '#/ajustes';
await sleep(700);
const input2 = $('[data-section="Datos"] input[type=file]');
const dt2 = new DataTransfer();
dt2.items.add(new File(['{"app":"otra"}'], 'bad.json', { type: 'application/json' }));
input2.files = dt2.files;
input2.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(600);
res.afterBadImport = { sessions: (await db.listSessions()).length, toast: $('#toasts')?.innerText };
return res;
