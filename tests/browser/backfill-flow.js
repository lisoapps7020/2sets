// Carga de sesiones pasadas desde Progreso: guardar, guardar y otra, validación, chip en Historial.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v) => { input.value = String(v); input.dispatchEvent(new Event('change', { bubbles: true })); };
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');

location.hash = '#/progreso';
await sleep(800);
$$('#screen .btn').find((b) => b.textContent === 'Cargar sesión pasada').click();
await sleep(300);
res.formOpen = !!$('[data-backfill]');
res.defaultDay = $('[data-bf=day] .seg-btn.on')?.textContent;

// Primera: pull, 10 ago, 80 kg, serie 1 lastre 10 × 8, serie 2 PC × 12
setInput($('[data-bf=date]'), '2026-08-10');
$$('[data-bf=day] .seg-btn').find((b) => b.textContent === 'PULL').click();
await sleep(100);
setInput($('[data-bf=bw]'), '80');
$$('[data-bf=main] .setrow')[0].querySelectorAll('.seg-btn')[0].click();
await sleep(100);
setInput($$('[data-bf=main] .setrow')[0].querySelector('.setrow-load input'), 10);
setInput($$('[data-bf=main] .setrow')[0].querySelector('.stepper-big input'), 8);
setInput($$('[data-bf=main] .setrow')[1].querySelector('.stepper-big input'), 12);
res.hasDoneButton = !!$('[data-bf=main] .setrow-body .btn');
$$('[data-backfill] .btn').find((b) => b.textContent === 'Guardar y cargar otra').click();
await sleep(600);
res.afterFirst = { formStillOpen: !!$('[data-backfill]'), day: $('[data-bf=day] .seg-btn.on')?.textContent, bw: $('[data-bf=bw]').value, reps: $$('[data-bf=main] .setrow')[0].querySelector('.stepper-big input').value };
const s1 = (await db.listSessions())[0];
res.first = { origin: s1.origin, status: s1.status, date: s1.date, day: s1.day, bw: s1.bodyweightKg, main0: s1.blocks.main.sets[0], main1reps: s1.blocks.main.sets[1].reps, second0done: s1.blocks.second.sets[0].done };

// Segunda: push, 14 ago, serie 1 lastre 20 × 9, sin serie 2 → Guardar cierra el formulario
setInput($('[data-bf=date]'), '2026-08-14');
$$('[data-bf=main] .setrow')[0].querySelectorAll('.seg-btn')[0].click();
await sleep(100);
setInput($$('[data-bf=main] .setrow')[0].querySelector('.setrow-load input'), 20);
setInput($$('[data-bf=main] .setrow')[0].querySelector('.stepper-big input'), 9);
$$('[data-backfill] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(900);
res.afterSecond = { formClosed: !$('[data-backfill]'), sessions: (await db.listSessions()).length, dipsDots: $$('.chart circle').length, exSel: $('#screen select').value };

// Validación: sin reps no guarda
$$('#screen .btn').find((b) => b.textContent === 'Cargar sesión pasada').click();
await sleep(300);
setInput($('[data-bf=date]'), '2026-08-20');
$$('[data-backfill] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(400);
res.validation = { sessions: (await db.listSessions()).length, toast: $('#toasts').innerText, formOpen: !!$('[data-backfill]') };
setInput($('[data-bf=date]'), '2099-01-01');
setInput($$('[data-bf=main] .setrow')[0].querySelector('.stepper-big input'), 5);
$$('[data-backfill] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(400);
res.futureRejected = { sessions: (await db.listSessions()).length, toast: $('#toasts').innerText };

// Historial muestra el chip papel; Inicio sugiere el día siguiente al último cargado
location.hash = '#/historial';
await sleep(700);
res.history = { items: $$('.list-item').length, papelChips: $$('.chip').filter((c) => c.textContent === 'papel').length, first: $('.list-item')?.innerText.replace(/\s+/g, ' ').trim() };
location.hash = '#/inicio';
await sleep(700);
res.homeSuggests = /HOY TOCA\s+(PUSH|PULL)/i.exec($('#screen').innerText)?.[1];
res.homeSet1 = /Serie 1 · ([^·]+)·/.exec($('#screen').innerText)?.[1]?.trim();
return res;
