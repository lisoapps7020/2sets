// Progreso: gráfico, PRs e hitos con datos importados.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');
const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, halfReps: 0, failedReps: 0, toFailure: true, done: true, source: 'manual' });
const mk = (id, date, day, main, second, bw) => ({
  id, date, day, status: 'done', startedAt: 1, finishedAt: 2, bodyweightKg: bw, notes: '',
  blocks: { warmup: { items: [true, true, true] }, approach: { sets: [BW(5), BW(5)] },
    main: { exerciseId: day === 'push' ? 'dips' : 'pullups', sets: main },
    second: { exerciseId: day === 'push' ? 'decline_pushups' : 'australian_rows', sets: second }, extra: [] },
});
await db.importAll({ app: '2sets', schemaVersion: 1,
  bodyweight: [{ id: 'bw_1', date: '2026-08-01', kg: 80 }],
  sessions: [
    mk('ses_a', '2026-08-20', 'push', [W(20, 9), W(15, 13)], [BW(12), BW(12)], 80),
    mk('ses_b', '2026-09-01', 'pull', [W(10, 8), W(5, 12)], [BW(15), BW(15)], null),
    mk('ses_c', '2026-09-08', 'push', [W(20, 10), W(15, 15)], [BW(15), BW(15)], 80),
  ] });

location.hash = '#/progreso';
await sleep(800);
res.defaultEx = $('#screen select').value;
res.dipsAddedDots = $$('.chart circle').length;
res.dipsAddedPolyline = !!$('.chart polyline');
res.chartLabels = $$('.chart text').map((t) => t.textContent);

$$('.seg-btn').find((b) => b.textContent === 'Total').click();
await sleep(200);
res.totalLabels = $$('.chart text').map((t) => t.textContent);

$$('.seg-btn').find((b) => b.textContent === 'Serie 2').click();
await sleep(200);
res.slot2Dots = $$('.chart circle').length;
res.prsSlot2 = $$('#screen .card').find((c) => /^PRS/i.test(c.innerText.trim())).innerText.replace(/\s+/g, ' ').trim();

const sel = $('#screen select');
sel.value = 'pullups';
sel.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(200);
res.pullupsDots = $$('.chart circle').length;
res.pullupsPolyline = !!$('.chart polyline');
res.prsPullups = $$('#screen .card').find((c) => /^PRS/i.test(c.innerText.trim())).innerText.replace(/\s+/g, ' ').trim();
res.milestones = $$('[data-milestone]').map((x) => x.textContent);
res.barWidths = $$('.bar > i').map((i) => i.style.width);
res.savedSel = localStorage.getItem('progress.sel');

location.hash = '#/inicio';
await sleep(300);
location.hash = '#/progreso';
await sleep(600);
res.restoredEx = $('#screen select').value;
return res;
