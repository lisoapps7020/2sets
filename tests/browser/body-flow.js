// Cuerpo: perfil corporal, objetivo, mediciones con cinta y balanza, validación.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const setInput = (input, v, ev = 'change') => { input.value = String(v); input.dispatchEvent(new Event(ev, { bubbles: true })); };
const sec = (title) => $(`[data-section="${title}"]`);
const res = {};

await new Promise((resolve) => { const r = indexedDB.deleteDatabase('twosets'); r.onsuccess = r.onerror = r.onblocked = resolve; });
localStorage.clear();
const db = await import('../../js/db.js');
const body = await import('../../js/body.js');
await db.put('bodyweight', { id: 'bw_1', date: '2026-09-20', kg: 80 });

location.hash = '#/ajustes';
await sleep(900);
res.hasCuerpo = !!sec('Cuerpo');

// Sexo y altura
$$('[data-section="Cuerpo"] [data-body=sex] .seg-btn').find((b) => b.textContent === 'Hombre').click();
await sleep(200);
setInput($('[data-section="Cuerpo"] [data-body=height]'), 178);
await sleep(300);
const p1 = await db.getProfile();
res.profile = { sex: p1.sex, heightCm: p1.heightCm };

const d = new Date();
const todayLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Peso objetivo sin tocar la dirección: ancla el punto de partida igual
setInput($('[data-section="Cuerpo"] [data-body=targetWeight]'), 76);
await sleep(400);
const p2 = await db.getProfile();
res.goalFromTarget = { direction: p2.goal.direction, targetWeightKg: p2.goal.targetWeightKg, startWeightKg: p2.goal.startWeightKg, setAtIsToday: p2.goal.setAt === todayLocal };

// Tocar Bajar fija la dirección
$$('[data-section="Cuerpo"] [data-body=goal] .seg-btn').find((b) => b.textContent === 'Bajar').click();
await sleep(400);
const p3 = await db.getProfile();
res.goal = { direction: p3.goal.direction, targetWeightKg: p3.goal.targetWeightKg, startWeightKg: p3.goal.startWeightKg, setAtIsToday: p3.goal.setAt === todayLocal };

// Con un peso nuevo, re-tocar la misma dirección no reinicia el punto de partida
await db.put('bodyweight', { id: 'bw_2', date: todayLocal, kg: 85 });
location.hash = '#/inicio';
await sleep(300);
location.hash = '#/ajustes';
await sleep(800);
$$('[data-section="Cuerpo"] [data-body=goal] .seg-btn').find((b) => b.textContent === 'Bajar').click();
await sleep(400);
res.retapKeepsStart = (await db.getProfile()).goal.startWeightKg === 80;

// Medición con cinta: preview y guardado
$$('[data-section="Cuerpo"] .btn').find((b) => b.textContent === 'Registrar medidas').click();
await sleep(300);
res.formOpen = !!$('[data-measure]');
setInput($('[data-m=waistCm]'), 85, 'input');
setInput($('[data-m=neckCm]'), 38, 'input');
await sleep(100);
res.preview = $('[data-preview]').textContent;
$$('[data-measure] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(600);
const m1 = await db.listMeasurements();
res.cinta = { count: m1.length, source: m1[0]?.source, waist: m1[0]?.waistCm, bf: body.bodyFatOf(m1[0], await db.getProfile()) };
res.listed = sec('Cuerpo').innerText.includes('16,4');

// Medición inválida: cintura menor que cuello
$$('[data-section="Cuerpo"] .btn').find((b) => b.textContent === 'Registrar medidas').click();
await sleep(300);
setInput($('[data-m=waistCm]'), 30, 'input');
setInput($('[data-m=neckCm]'), 38, 'input');
$$('[data-measure] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(400);
res.invalid = { count: (await db.listMeasurements()).length, toast: $('#toasts').innerText.split('\n').pop() };

// Balanza
$$('[data-measure] [data-m=source] .seg-btn').find((b) => b.textContent === 'Balanza').click();
await sleep(200);
setInput($('[data-m=bodyFatPct]'), 18, 'input');
$$('[data-measure] .btn').find((b) => b.textContent === 'Guardar').click();
await sleep(600);
const m2 = await db.listMeasurements();
res.balanza = { count: m2.length, sources: m2.map((m) => m.source).sort(), pct: m2.find((m) => m.source === 'balanza')?.bodyFatPct };
res.formClosed = !$('[data-measure]');

// Export incluye mediciones
res.exportMeasurements = (await db.exportAll()).measurements.length;
return res;
