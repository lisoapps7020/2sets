// Formulario de mediciones corporales: cinta métrica o balanza de bioimpedancia.
import { el, todayISO, toast, fmtNum } from './ui.js';
import { navyBodyFat } from './body.js';
import { put } from './db.js';
import { uid } from './templates.js';

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

export function validateMeasurement(m, profile) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))) return { ok: false, error: 'Ingresá una fecha válida.' };
  if (m.date > todayISO()) return { ok: false, error: 'La fecha no puede ser futura.' };
  if (m.source === 'balanza') {
    if (!(m.bodyFatPct >= 2 && m.bodyFatPct <= 60)) return { ok: false, error: 'La grasa tiene que estar entre 2 y 60 %.' };
    return { ok: true };
  }
  const cm = (v) => v !== null && v >= 20 && v <= 200;
  if (!cm(m.waistCm) || !cm(m.neckCm)) return { ok: false, error: 'Cintura y cuello en centímetros, entre 20 y 200.' };
  if (m.waistCm <= m.neckCm) return { ok: false, error: 'La cintura tiene que ser mayor que el cuello.' };
  if (profile?.sex === 'f' && !cm(m.hipCm)) return { ok: false, error: 'Cadera en centímetros, entre 20 y 200.' };
  return { ok: true };
}

export function measureForm({ profile, onSaved = () => {}, onCancel = () => {} }) {
  const state = { date: todayISO(), source: 'cinta', waistCm: null, neckCm: null, hipCm: null, bodyFatPct: null };
  const host = el('section', { class: 'card', dataset: { measure: '' } });
  const canEstimate = !!(profile?.heightCm && (profile?.sex === 'm' || profile?.sex === 'f'));

  const draw = () => {
    const preview = el('p', { class: 'bold', dataset: { preview: '' } });
    const updatePreview = () => {
      if (state.source === 'balanza') { preview.textContent = ''; return; }
      const bf = canEstimate ? navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, waistCm: state.waistCm, neckCm: state.neckCm, hipCm: state.hipCm }) : null;
      preview.textContent = bf === null ? (canEstimate ? 'Completá las medidas para estimar la grasa.' : 'Cargá altura y sexo en Ajustes para estimar la grasa.') : `Grasa estimada: ${fmtNum(bf)} %`;
    };
    const cmInput = (key, label) => el('div', { class: 'field' }, el('label', {}, label),
      el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.5', min: '20', max: '200', placeholder: 'cm', dataset: { m: key }, value: state[key] ?? '',
        oninput: (e) => { state[key] = num(e.target.value); updatePreview(); } }));
    const dateInput = el('input', { class: 'input', type: 'date', value: state.date, max: todayISO(), dataset: { m: 'date' }, onchange: (e) => { state.date = e.target.value; } });
    const seg = el('div', { class: 'seg', dataset: { m: 'source' } }, ...[['cinta', 'Cinta métrica'], ['balanza', 'Balanza']].map(([k, l]) => el('button', {
      type: 'button', class: 'seg-btn' + (state.source === k ? ' on' : ''), onclick: () => { if (state.source !== k) { state.source = k; draw(); } },
    }, l)));
    const fields = state.source === 'cinta'
      ? el('div', { class: 'list' },
        el('div', { class: 'grid-2' }, cmInput('waistCm', 'Cintura (cm)'), cmInput('neckCm', 'Cuello (cm)')),
        profile?.sex === 'f' ? cmInput('hipCm', 'Cadera (cm)') : null,
        preview,
        el('p', { class: 'muted small' }, 'Cintura a la altura del ombligo, cuello debajo de la nuez. Estimación con margen de unos 3 puntos.'),
      )
      : el('div', { class: 'list' },
        el('div', { class: 'field' }, el('label', {}, 'Grasa corporal (%)'),
          el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', min: '2', max: '60', placeholder: '%', dataset: { m: 'bodyFatPct' }, value: state.bodyFatPct ?? '',
            oninput: (e) => { state.bodyFatPct = num(e.target.value); } })),
        el('p', { class: 'muted small' }, 'El valor que marca la balanza de bioimpedancia, a la misma hora y en las mismas condiciones cada vez.'),
      );
    host.replaceChildren(
      el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, 'Medición'), el('span', { class: 'label-caps' }, 'Cuerpo')),
      el('div', { class: 'field' }, el('label', {}, 'Fecha'), dateInput),
      el('div', { class: 'field' }, el('label', {}, 'Cómo medís'), seg),
      fields,
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
          const m = { ...state };
          if (m.source === 'cinta') m.bodyFatPct = null; else { m.waistCm = null; m.neckCm = null; m.hipCm = null; }
          const v = validateMeasurement(m, profile);
          if (!v.ok) { toast(v.error, 'error'); return; }
          const row = { id: uid('mea'), ...m };
          try { await put('measurements', row); } catch { toast('No se pudo guardar', 'error'); return; }
          toast('Medición guardada', 'ok');
          onSaved(row);
        } }, 'Guardar'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: onCancel }, 'Cancelar'),
      ),
    );
    updatePreview();
  };
  draw();
  return host;
}
