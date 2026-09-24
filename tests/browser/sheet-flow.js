// Ficha de progreso: nivel, radar, fuerza, estancamiento, constancia y cuerpo con datos importados.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v, ev = 'change') => { input.value = String(v); input.dispatchEvent(new Event(ev, { bubbles: true })); };
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');
const { addDays } = await import('../../js/body.js');
const today = new Date();
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const mk = (i, date, day, main) => ({
  id: `ses_${i}`, date, day, status: 'done', startedAt: 1, finishedAt: 2, bodyweightKg: 80, notes: i === 9 ? 'dormí mal' : '',
  blocks: { warmup: { items: [true, true, true] }, approach: { sets: [BW(5), BW(5)] },
    main: { exerciseId: day === 'push' ? 'dips' : 'pullups', sets: main },
    second: { exerciseId: day === 'push' ? 'decline_pushups' : 'australian_rows', sets: [BW(12), BW(12)] }, extra: [] },
});
// 10 sesiones en ~6 semanas: dominadas crecen; fondos mejoran una vez y después se estancan 4 sesiones
const sessions = [];
for (let i = 0; i < 10; i++) {
  const date = addDays(todayISO, -(40 - 4 * i));
  if (i % 2 === 0) sessions.push(mk(i, date, 'pull', [W(10 + 2.5 * (i / 2), 8), W(5 + 2.5 * (i / 2), 12)]));
  else sessions.push(mk(i, date, 'push', [W(20, i === 1 ? 10 : 9), W(15, 13)]));
}
await db.importAll({ app: '2sets', schemaVersion: 2, bodyweight: [{ id: 'bw_1', date: addDays(todayISO, -45), kg: 82 }, { id: 'bw_2', date: addDays(todayISO, -2), kg: 80 }], sessions, settings: [{ key: 'profile', value: { name: 'Julián' } }], measurements: [] });

location.hash = '#/progreso';
await sleep(1000);
res.sections = $$('[data-sheet]').map((x) => x.dataset.sheet);
res.level = Number($('[data-level]')?.textContent);
res.ficha = $('[data-sheet=ficha]')?.innerText.replace(/\s+/g, ' ').trim();
res.radarPolygon = !!$('[data-sheet=radar] polygon[fill="var(--primary)"]');
res.radarLabels = $$('[data-sheet=radar] text').map((t) => t.textContent.replace(/\s+/g, ' ').trim());
res.pullTier = $('[data-tier=pullups]')?.textContent;
res.pullNext = $('[data-next=pullups]')?.textContent;
res.dipsStagnation = $('[data-stagnation=dips]')?.textContent;
res.pullStagnation = $('[data-stagnation=pullups]')?.textContent;
res.weeks = $$('[data-week]').length;
res.weeksOn = $$('[data-week].on').length;
res.fatBefore = $('[data-fat] b')?.textContent;
res.reminder = !!$('[data-reminder]');
res.cuerpoBefore = $('[data-sheet=cuerpo]')?.innerText.replace(/\s+/g, ' ').trim();

// Perfil corporal y una medición con cinta desde la propia ficha
const prof = await db.getProfile();
await db.saveProfile({ ...prof, sex: 'm', heightCm: 178 });
location.hash = '#/inicio';
await sleep(300);
location.hash = '#/progreso';
await sleep(900);
$$('[data-sheet=cuerpo] .btn').find((b) => b.textContent === 'Registrar medidas').click();
await sleep(300);
setInput($('[data-m=waistCm]'), 85, 'input');
setInput($('[data-m=neckCm]'), 38, 'input');
$$('[data-measure] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(1000);
res.fatAfter = $('[data-fat] b')?.textContent;
res.reminderAfter = !!$('[data-reminder]');
res.cuerpoAttr = $$('[data-sheet=radar] text').map((t) => t.textContent.replace(/\s+/g, ' ').trim()).find((t) => t.startsWith('Cuerpo'));
res.leanMass = $('[data-sheet=cuerpo]')?.innerText.includes('kg magros');
return res;
