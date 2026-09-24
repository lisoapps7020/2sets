// Historial: lista agrupada por mes, detalle, edición y borrado.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v) => { input.value = String(v); input.dispatchEvent(new Event('change', { bubbles: true })); };
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');
const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const mk = (id, date, day, main, second) => ({
  id, date, day, status: 'done', startedAt: 1, finishedAt: 1 + 50 * 60000, bodyweightKg: 80, notes: '',
  blocks: {
    warmup: { items: [true, true, false] },
    approach: { sets: [BW(5), BW(5)] },
    main: { exerciseId: day === 'push' ? 'dips' : 'pullups', sets: main },
    second: { exerciseId: day === 'push' ? 'decline_pushups' : 'australian_rows', sets: second },
    extra: [],
  },
});
await db.importAll({ app: '2sets', schemaVersion: 1, sessions: [
  mk('ses_a', '2026-08-20', 'push', [W(20, 9), W(15, 13)], [BW(12), BW(12)]),
  mk('ses_b', '2026-09-01', 'pull', [W(10, 8), W(5, 12)], [BW(15), BW(15)]),
  mk('ses_c', '2026-09-08', 'push', [W(20, 10), W(15, 15)], [BW(15), BW(15)]),
] });

location.hash = '#/historial';
await sleep(800);
res.months = $$('.section-title').map((h) => h.textContent);
res.items = $$('.list-item').length;
res.firstItem = $('.list-item')?.innerText.replace(/\s+/g, ' ').trim();

$('.list-item').click();
await sleep(600);
res.detailTitle = $('#screen h1')?.textContent;
res.detailBlocks = $$('[data-block]').map((x) => x.dataset.block);
res.detailMain = $('[data-block=main]').innerText.replace(/\s+/g, ' ').trim();

$$('#screen .btn').find((b) => b.textContent === 'Editar').click();
await sleep(300);
res.editRows = $$('[data-block=main] .setrow').length;
setInput($$('[data-block=main] .setrow')[0].querySelector('.stepper-big input'), 11);
$$('#screen .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(500);
res.savedReps = (await db.get('sessions', 'ses_c')).blocks.main.sets[0].reps;
res.afterSaveMain = $('[data-block=main]').innerText.replace(/\s+/g, ' ').trim();

$$('#screen .btn').find((b) => b.textContent === 'Eliminar').click();
await sleep(800);
res.itemsAfterDelete = $$('.list-item').length;
res.remaining = (await db.listSessions()).map((s) => s.id).sort();
return res;
