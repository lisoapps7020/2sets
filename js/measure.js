// Formulario de mediciones corporales: peso, altura, sexo y, según el método, cinta métrica o balanza.
import { el, todayISO, toast, fmtNum } from './ui.js';
import { navyBodyFat } from './body.js';
import { put, saveProfile, latestBodyweight, getAll } from './db.js';
import { uid } from './templates.js';

const num = (x) => { const n = Number(x); return Number.isFinite(n) && String(x).trim() !== '' ? n : null; };

export function validateMeasurement(m, profile) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))) return { ok: false, error: 'Ingresá una fecha válida.' };
  if (m.date > todayISO()) return { ok: false, error: 'La fecha no puede ser futura.' };
  if (m.weightKg !== null && m.weightKg !== undefined && !(m.weightKg > 20 && m.weightKg < 300)) return { ok: false, error: 'Peso en kilos, entre 20 y 300.' };
  if (m.heightCm !== null && m.heightCm !== undefined && !(m.heightCm >= 100 && m.heightCm <= 250)) return { ok: false, error: 'Altura en centímetros, entre 100 y 250.' };
  if (m.source === 'balanza') {
    if (!(m.bodyFatPct >= 2 && m.bodyFatPct <= 60)) return { ok: false, error: 'La grasa tiene que estar entre 2 y 60 %.' };
    return { ok: true };
  }
  const cm = (v) => v !== null && v !== undefined && v >= 20 && v <= 200;
  if (!cm(m.waistCm) || !cm(m.neckCm)) return { ok: false, error: 'Cintura y cuello en centímetros, entre 20 y 200.' };
  if (m.waistCm <= m.neckCm) return { ok: false, error: 'La cintura tiene que ser mayor que el cuello.' };
  const sex = m.sex || profile?.sex;
  if (sex === 'f' && !cm(m.hipCm)) return { ok: false, error: 'Cadera en centímetros, entre 20 y 200.' };
  const height = m.heightCm ?? profile?.heightCm ?? null;
  if (!(height >= 100 && height <= 250)) return { ok: false, error: 'Falta la altura para estimar la grasa.' };
  return { ok: true };
}

// onSaved(row) al guardar. profile se actualiza en el lugar (sexo y altura) y se persiste.
export function measureForm({ profile, onSaved = () => {}, onCancel = () => {} }) {
  const state = {
    date: todayISO(), source: 'cinta',
    sex: profile?.sex === 'f' ? 'f' : 'm',
    heightCm: profile?.heightCm ?? null,
    weightKg: null,
    waistCm: null, neckCm: null, hipCm: null, bodyFatPct: null,
  };
  const host = el('section', { class: 'card', dataset: { measure: '' } });
  let lastWeight = null;
  latestBodyweight().then((r) => { lastWeight = r; draw(); }).catch(() => {});

  const draw = () => {
    const preview = el('p', { class: 'bold', dataset: { preview: '' } });
    const updatePreview = () => {
      if (state.source === 'balanza') { preview.textContent = ''; return; }
      if (!(state.heightCm >= 100)) { preview.textContent = 'Cargá la altura para estimar la grasa.'; return; }
      const bf = navyBodyFat({ sex: state.sex, heightCm: state.heightCm, waistCm: state.waistCm, neckCm: state.neckCm, hipCm: state.hipCm });
      preview.textContent = bf === null ? 'Completá las medidas para estimar la grasa.' : `Grasa estimada: ${fmtNum(bf)} %`;
    };
    const numInput = (key, { step, min, max, placeholder }) => el('input', {
      class: 'input', type: 'number', inputmode: 'decimal', step, min, max, placeholder, dataset: { m: key }, value: state[key] ?? '',
      oninput: (e) => { state[key] = num(e.target.value); updatePreview(); },
    });
    const field = (label, input) => el('div', { class: 'field' }, el('label', {}, label), input);
    const dateInput = el('input', { class: 'input', type: 'date', value: state.date, max: todayISO(), dataset: { m: 'date' }, onchange: (e) => { state.date = e.target.value; } });
    const sexSeg = el('div', { class: 'seg', dataset: { m: 'sex' } }, ...[['m', 'Hombre'], ['f', 'Mujer']].map(([k, l]) => el('button', {
      type: 'button', class: 'seg-btn' + (state.sex === k ? ' on' : ''), onclick: () => { if (state.sex !== k) { state.sex = k; draw(); } },
    }, l)));
    const sourceSeg = el('div', { class: 'seg', dataset: { m: 'source' } }, ...[['cinta', 'Cinta métrica'], ['balanza', 'Balanza']].map(([k, l]) => el('button', {
      type: 'button', class: 'seg-btn' + (state.source === k ? ' on' : ''), onclick: () => { if (state.source !== k) { state.source = k; draw(); } },
    }, l)));
    const basics = el('div', { class: 'grid-2' },
      field('Peso (kg)', numInput('weightKg', { step: '0.1', min: '20', max: '300', placeholder: lastWeight ? `último ${fmtNum(lastWeight.kg)}` : 'kg' })),
      field('Altura (cm)', numInput('heightCm', { step: '1', min: '100', max: '250', placeholder: 'cm' })),
    );
    const fields = state.source === 'cinta'
      ? el('div', { class: 'list' },
        el('div', { class: 'grid-2' },
          field('Cintura (cm)', numInput('waistCm', { step: '0.5', min: '20', max: '200', placeholder: 'cm' })),
          field('Cuello (cm)', numInput('neckCm', { step: '0.5', min: '20', max: '200', placeholder: 'cm' })),
        ),
        state.sex === 'f' ? field('Cadera (cm)', numInput('hipCm', { step: '0.5', min: '20', max: '200', placeholder: 'cm' })) : null,
        preview,
        el('p', { class: 'muted small' }, 'Cintura a la altura del ombligo, cuello debajo de la nuez. Estimación con margen de unos 3 puntos.'),
      )
      : el('div', { class: 'list' },
        field('Grasa corporal (%)', numInput('bodyFatPct', { step: '0.1', min: '2', max: '60', placeholder: '%' })),
        el('p', { class: 'muted small' }, 'El valor que marca la balanza de bioimpedancia, a la misma hora y en las mismas condiciones cada vez.'),
      );
    host.replaceChildren(
      el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, 'Medición'), el('span', { class: 'label-caps' }, 'Cuerpo')),
      el('div', { class: 'grid-2' }, field('Fecha', dateInput), el('div', { class: 'field' }, el('label', {}, 'Sexo'), sexSeg)),
      basics,
      el('div', { class: 'field' }, el('label', {}, 'Cómo medís'), sourceSeg),
      fields,
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Guardar'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: onCancel }, 'Cancelar'),
      ),
    );
    updatePreview();
  };

  async function save() {
    const m = { ...state };
    if (m.source === 'cinta') m.bodyFatPct = null; else { m.waistCm = null; m.neckCm = null; m.hipCm = null; }
    const v = validateMeasurement(m, profile);
    if (!v.ok) { toast(v.error, 'error'); return; }
    try {
      if (profile && (profile.sex !== m.sex || (m.heightCm !== null && profile.heightCm !== m.heightCm))) {
        profile.sex = m.sex;
        if (m.heightCm !== null) profile.heightCm = m.heightCm;
        await saveProfile(profile);
      }
      if (m.weightKg !== null) {
        // Un peso por fecha: si ya hay uno ese día, se reemplaza.
        const existing = (await getAll('bodyweight')).find((r) => r.date === m.date);
        await put('bodyweight', { id: existing?.id || uid('bw'), date: m.date, kg: Math.round(m.weightKg * 10) / 10 });
      }
      const row = { id: uid('mea'), date: m.date, source: m.source, waistCm: m.waistCm, neckCm: m.neckCm, hipCm: m.hipCm, bodyFatPct: m.bodyFatPct };
      await put('measurements', row);
      toast('Medición guardada', 'ok');
      onSaved(row);
    } catch {
      toast('No se pudo guardar', 'error');
    }
  }

  draw();
  return host;
}
