// Flujo completo de una sesión pull, ejecutado dentro de la app real por tools/headless.mjs --script.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v) => { input.value = String(v); input.dispatchEvent(new Event('change', { bubbles: true })); };
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
location.hash = '#/entrenar';
await sleep(900);

res.chooser = $$('.daycard b').map((b) => b.textContent);
res.suggested = $('.daycard.suggested b')?.textContent;
$$('.daycard').find((b) => b.textContent.includes('PULL')).click();
await sleep(900);

res.blocks = $$('[data-block]').map((x) => x.dataset.block);
res.title = $('#screen h1')?.textContent;
const noNull = () => ![...$('#screen').childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === 'null');
res.noNullTextWorkout = noNull();
res.blockTitles = $$('[data-block] .card-title').map((x) => x.textContent);

// Sin peso corporal cargado: aparece el pedido; guardar 80 lo cierra y lo aplica a la sesión
res.bwPromptShown = !!$('[data-bw-prompt]');
setInput($('[data-bw-prompt] input'), 80);
$('[data-bw-prompt] .btn').click();
await sleep(400);
res.bwPromptGone = !$('[data-bw-prompt]');
res.bwSaved = (await (await import('../../js/db.js')).latestBodyweight())?.kg;

// Notas
const ta = $('[data-notes]');
ta.value = 'codo molesto';
ta.dispatchEvent(new Event('input', { bubbles: true }));

$('[data-block=warmup] input[type=checkbox]').click();

// Aproximación 1 con banda
$$('[data-block=approach] .setrow')[0].querySelectorAll('.seg-btn')[2].click();
await sleep(60);
const ap1 = $$('[data-block=approach] .setrow')[0];
res.bandOptions = ap1.querySelectorAll('select option').length;
ap1.querySelector('[data-save]').click();
await sleep(60);
res.approxSavedNoOverlay = $('#rest-overlay').hidden === true;
$$('[data-block=approach] .setrow')[0].querySelector('[data-rest]').click();
await sleep(120);
res.overlayAfterApprox = { hidden: $('#rest-overlay').hidden, time: $('#rest-time').textContent, label: $('#rest-label').textContent };
$('#rest-skip').click();

// Serie 1 principal: lastre 10 kg × 8
$$('[data-block=main] .setrow')[0].querySelectorAll('.seg-btn')[0].click();
await sleep(60);
let m1 = $$('[data-block=main] .setrow')[0];
setInput(m1.querySelector('.setrow-load input'), 10);
setInput(m1.querySelector('.stepper-big input'), 8);
m1.querySelector('[data-save]').click();
await sleep(60);
$$('[data-block=main] .setrow')[0].querySelector('[data-rest]').click();
await sleep(120);
res.overlayAfterMain = { hidden: $('#rest-overlay').hidden, time: $('#rest-time').textContent, label: $('#rest-label').textContent };
$('#rest-skip').click();
res.m1DoneText = $$('[data-block=main] .setrow')[0].querySelector('[data-save]').textContent;

// Serie 2 principal: PC × 12
const m2 = $$('[data-block=main] .setrow')[1];
setInput(m2.querySelector('.stepper-big input'), 12);
m2.querySelector('[data-save]').click();
await sleep(60);

// Secundus: 15 y 15 a PC, con su propio descanso (4 min por defecto) y alarma
res.restChips = $$('[data-block] .chip-rest').map((c) => `${c.closest('[data-block]').dataset.block}:${c.dataset.rest}`);
res.blockColors = $$('[data-block]').map((b) => `${b.dataset.block}:${getComputedStyle(b).borderLeftColor}`);
let firstSecond = true;
for (const row of $$('[data-block=second] .setrow')) {
  setInput(row.querySelector('.stepper-big input'), 15);
  row.querySelector('[data-save]').click();
  await sleep(60);
  row.querySelector('[data-rest]').click();
  await sleep(120);
  if (firstSecond) { res.overlayAfterSecond = { hidden: $('#rest-overlay').hidden, time: $('#rest-time').textContent, label: $('#rest-label').textContent }; firstSecond = false; }
  $('#rest-skip').click();
}

// Extra: agregar uno y una serie más
const picker = $('[data-block=extra] select');
res.extraOptions = picker ? picker.options.length : 0;
picker.value = picker.options[1].value;
picker.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(80);
$('[data-block=extra] .extra-item .btn-sm').click();
await sleep(80);
res.extraRows = $$('[data-block=extra] .setrow').length;
$$('[data-block=extra] .setrow')[0].querySelector('[data-save]').click();
await sleep(60);
$$('[data-block=extra] .setrow')[0].querySelector('[data-rest]').click();
await sleep(120);
res.overlayAfterExtra = { hidden: $('#rest-overlay').hidden, time: $('#rest-time').textContent };
$('#rest-skip').click();

// Persistencia: la sesión activa en IndexedDB refleja lo cargado
await sleep(600);
const db = await import('../../js/db.js');
const active = await db.activeSession();
res.persisted = {
  status: active?.status,
  notes: active?.notes,
  bodyweightKg: active?.bodyweightKg,
  warmup0: active?.blocks.warmup.items[0],
  approachMode: active?.blocks.approach.sets[0].load.mode,
  main0: active?.blocks.main.sets[0],
  main1reps: active?.blocks.main.sets[1].reps,
  extraCount: active?.blocks.extra.length,
};

// Salir y volver: retoma la sesión activa
location.hash = '#/inicio';
await sleep(600);
res.homeShowsActive = /sesión en curso/i.test($('#screen').innerText);
location.hash = '#/entrenar';
await sleep(700);
res.resumedMain0Reps = $$('[data-block=main] .setrow')[0].querySelector('.stepper-big input').value;

// Terminar (confirm aceptado por la herramienta)
$$('#screen .btn-primary').find((b) => b.textContent.includes('Terminar')).click();
await sleep(900);
res.summary = $('#screen').innerText;

location.hash = '#/inicio';
await sleep(700);
res.homeAfter = { text: $('#screen').innerText.slice(0, 400), stats: $$('.stat b').map((b) => b.textContent), noNullText: noNull() };

// Extras guardan su nombre en la sesión
const doneSession = (await db.listSessions()).find((s) => s.status === 'done');
res.extraName = doneSession.blocks.extra[0]?.name;

// Empezar desde Inicio con ?day= limpia la URL para que una recarga no re-arranque
location.hash = '#/entrenar?day=push';
await sleep(900);
res.queryStart = { title: $('#screen h1')?.textContent, hash: location.hash, bwPromptShown: !!$('[data-bw-prompt]') };
// Descartar justo después de un cambio: no debe resucitar la sesión
setInput($$('[data-block=main] .setrow')[0].querySelector('.stepper-big input'), 3);
$$('#screen .link').find((b) => b.textContent === 'Descartar').click();
await sleep(900);
res.afterDiscard = { active: await db.activeSession(), chooser: $$('.daycard').length };
return res;
