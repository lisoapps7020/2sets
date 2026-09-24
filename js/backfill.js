// Carga manual de sesiones pasadas (las anotadas en papel).
import { el, todayISO, toast } from './ui.js';
import { MAIN_BY_DAY, SECOND_BY_DAY, EXERCISES, makeSet } from './model.js';
import { WARMUP_ITEMS, uid } from './templates.js';
import { setRow } from './setrow.js';
import { saveSession } from './db.js';

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime());

export function validateBackfill(input, today = todayISO()) {
  if (!isISO(input?.dateISO)) return { ok: false, error: 'Ingresá una fecha válida.' };
  if (input.dateISO > today) return { ok: false, error: 'La fecha no puede ser futura.' };
  if (input.day !== 'push' && input.day !== 'pull') return { ok: false, error: 'Elegí el día: push o pull.' };
  const main = input.main || [];
  if (!main.some((s) => num(s?.reps) > 0)) return { ok: false, error: 'Cargá al menos una serie del principal con reps.' };
  return { ok: true };
}

function fill(sets, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const src = sets?.[i];
    const s = makeSet(src?.load);
    s.reps = Math.max(0, Math.round(num(src?.reps)));
    s.done = s.reps > 0;
    out.push(s);
  }
  return out;
}

export function buildBackfillSession({ dateISO, day, bodyweightKg, main, second }) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const at = new Date(y, m - 1, d, 12, 0, 0).getTime();
  const bw = bodyweightKg === null || bodyweightKg === undefined || bodyweightKg === '' ? null : num(bodyweightKg);
  return {
    id: uid('ses'),
    date: dateISO,
    day,
    status: 'done',
    origin: 'papel',
    startedAt: at,
    finishedAt: at,
    bodyweightKg: bw,
    notes: '',
    blocks: {
      warmup: { items: WARMUP_ITEMS.map(() => false) },
      approach: { sets: [makeSet(), makeSet()] },
      main: { exerciseId: MAIN_BY_DAY[day], sets: fill(main, 2) },
      second: { exerciseId: SECOND_BY_DAY[day], sets: fill(second, 2) },
      extra: [],
    },
  };
}

// Formulario. Devuelve un elemento. onSaved() se llama al cerrar tras guardar; onCancel() al cancelar.
export function backfillForm({ bands = {}, onSaved = () => {}, onCancel = () => {}, defaults = {} }) {
  const state = {
    dateISO: defaults.dateISO || todayISO(),
    day: defaults.day === 'push' ? 'push' : 'pull',
    bodyweightKg: defaults.bodyweightKg ?? '',
    main: [makeSet(), makeSet()],
    second: [makeSet(), makeSet()],
  };
  const host = el('section', { class: 'card', dataset: { backfill: '' } });

  const draw = () => {
    const mainEx = MAIN_BY_DAY[state.day];
    const secondEx = SECOND_BY_DAY[state.day];
    const [t1, t2] = EXERCISES[mainEx].targets;
    const dateInput = el('input', { class: 'input', type: 'date', value: state.dateISO, max: todayISO(), dataset: { bf: 'date' }, onchange: (e) => { state.dateISO = e.target.value; } });
    const daySeg = el('div', { class: 'seg', dataset: { bf: 'day' } }, ...['push', 'pull'].map((d) => el('button', {
      type: 'button', class: 'seg-btn' + (state.day === d ? ' on' : ''), onclick: () => { if (state.day !== d) { state.day = d; draw(); } },
    }, d.toUpperCase())));
    const bwInput = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'opcional', value: state.bodyweightKg === '' ? '' : String(state.bodyweightKg), dataset: { bf: 'bw' },
      onchange: (e) => { state.bodyweightKg = e.target.value === '' ? '' : num(e.target.value); } });

    const mainRows = el('div', { dataset: { bf: 'main' } },
      ...state.main.map((set, i) => setRow({ set, bands, label: `Serie ${i + 1} · meta ${i === 0 ? t1 : t2}`, showDone: false })));
    const secondRows = el('details', { dataset: { bf: 'second' } },
      el('summary', { class: 'label-caps', style: { cursor: 'pointer', padding: '8px 0' } }, `${EXERCISES[secondEx].name} (opcional)`),
      ...state.second.map((set, i) => setRow({ set, bands, label: `Serie ${i + 1} · 12 a 15`, showDone: false })));

    const save = async (another) => {
      const v = validateBackfill(state);
      if (!v.ok) { toast(v.error, 'error'); return; }
      const session = buildBackfillSession(state);
      try {
        await saveSession(session);
      } catch {
        toast('No se pudo guardar', 'error');
        return;
      }
      toast('Sesión cargada', 'ok');
      if (another) {
        state.day = state.day === 'push' ? 'pull' : 'push';
        state.main = [makeSet(), makeSet()];
        state.second = [makeSet(), makeSet()];
        draw();
      } else {
        onSaved(session);
      }
    };

    host.replaceChildren(
      el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, 'Sesión pasada'), el('span', { class: 'label-caps' }, 'Desde el papel')),
      el('div', { class: 'grid-2' },
        el('div', { class: 'field' }, el('label', {}, 'Fecha'), dateInput),
        el('div', { class: 'field' }, el('label', {}, 'Peso corporal (kg)'), bwInput),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Día'), daySeg),
      el('p', { class: 'label-caps gold' }, EXERCISES[mainEx].name),
      mainRows,
      secondRows,
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => save(false) }, 'Guardar'),
        el('button', { type: 'button', class: 'btn', onclick: () => save(true) }, 'Guardar y cargar otra'),
      ),
      el('button', { type: 'button', class: 'link', onclick: onCancel }, 'Cancelar'),
    );
  };
  draw();
  return host;
}
