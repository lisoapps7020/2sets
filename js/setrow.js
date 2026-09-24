// Fila de una serie: modo de carga, kilos o banda, reps y botón Listo.
import { el } from './ui.js';
import { resolveBandId } from './model.js';

export function stepper(value, step, onSet, unit = '', big = false) {
  const input = el('input', { type: 'number', inputmode: 'decimal', step: String(step), min: '0', value: String(value ?? 0), 'aria-label': unit || 'valor' });
  const set = (v) => {
    const n = Math.max(0, Math.round((Number(v) || 0) * 10) / 10);
    input.value = String(n);
    onSet(n);
  };
  input.addEventListener('change', () => set(input.value));
  const minus = el('button', { type: 'button', 'aria-label': 'menos', onclick: () => set((Number(input.value) || 0) - step) }, '−');
  const plus = el('button', { type: 'button', 'aria-label': 'más', onclick: () => set((Number(input.value) || 0) + step) }, '+');
  return el('div', { class: 'stepper' + (big ? ' stepper-big' : '') }, minus, input, plus, unit ? el('span', { class: 'stepper-unit' }, unit) : null);
}

const MODES = [['weight', 'Lastre'], ['bodyweight', 'PC'], ['band', 'Banda']];

export function setRow({ set, bands = {}, last = null, onChange = () => {}, onDone = () => {}, label = '', hint = '', showDone = true }) {
  const row = el('div', { class: 'setrow' + (set.done && showDone ? ' done' : '') });
  const rerender = () => row.replaceWith(setRow({ set, bands, last, onChange, onDone, label, hint, showDone }));
  const bandList = Object.values(bands);
  if (set.load.mode === 'band') {
    const resolved = resolveBandId(set.load.bandId, bands);
    if (resolved !== set.load.bandId) { set.load.bandId = resolved; onChange(); }
  }

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Modo de carga' },
    ...MODES.map(([m, t]) => el('button', {
      type: 'button',
      class: 'seg-btn' + (set.load.mode === m ? ' on' : ''),
      onclick: () => {
        if (set.load.mode === m) return;
        set.load.mode = m;
        if (m !== 'weight') set.load.kg = 0;
        if (m !== 'band') set.load.bandId = null;
        if (m === 'band' && !set.load.bandId) set.load.bandId = bandList[0]?.id || null;
        onChange();
        rerender();
      },
    }, t)),
  );

  let load;
  if (set.load.mode === 'weight') {
    load = stepper(set.load.kg, 2.5, (v) => { set.load.kg = v; onChange(); }, 'kg');
  } else if (set.load.mode === 'band') {
    load = bandList.length
      ? el('select', { class: 'select', 'aria-label': 'Banda', onchange: (e) => { set.load.bandId = e.target.value; onChange(); } },
        ...bandList.map((b) => el('option', { value: b.id, selected: b.id === set.load.bandId }, `${b.name} (−${b.assistKg} kg)`)))
      : el('span', { class: 'muted small' }, 'Sin bandas: agregá una en Ajustes');
  } else {
    load = el('span', { class: 'muted' }, 'Peso corporal');
  }

  const reps = stepper(set.reps, 1, (v) => { set.reps = Math.round(v); onChange(); }, 'reps', true);
  const doneBtn = el('button', {
    type: 'button',
    class: 'btn ' + (set.done ? 'btn-ghost' : 'btn-primary'),
    onclick: () => {
      set.done = !set.done;
      onChange();
      rerender();
      if (set.done) onDone();
    },
  }, set.done ? 'Hecho ✓' : 'Listo');

  row.append(
    el('div', { class: 'setrow-head' },
      el('span', { class: 'label-caps' }, label),
      last ? el('span', { class: 'muted small' }, `Última: ${last}`) : null,
    ),
    hint ? el('p', { class: 'setrow-hint', dataset: { hint: '' } }, hint) : null,
    seg,
    el('div', { class: 'setrow-body' },
      el('div', { class: 'setrow-load' }, load),
      el('div', { class: 'setrow-act' }, reps, showDone ? doneBtn : null),
    ),
  );
  return row;
}
