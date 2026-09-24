import { el, fmtKg, fmtNum, fmtShortDate } from '../ui.js';
import { listSessions, bandsById, getAll } from '../db.js';
import { EXERCISES, computePRs, milestones, seriesFor } from '../model.js';
import { lineChart } from '../charts.js';
import { backfillForm } from '../backfill.js';

const METRICS = [
  ['added', 'Lastre', 'kg'],
  ['total', 'Total', 'kg'],
  ['e1rm', '1RM', 'kg'],
  ['reps', 'Reps', ''],
];
const PR_LABELS = { maxAdded: 'Mejor lastre', maxTotal: 'Mejor carga total', maxE1RM: 'Mejor 1RM estimado', maxBwReps: 'Más reps a peso corporal' };

let sel = { ex: 'dips', slot: 0, metric: 'added' };
let c = null;
let done = [];
let opts = {};

function loadSel() {
  try {
    const saved = JSON.parse(localStorage.getItem('progress.sel') || '{}');
    if (EXERCISES[saved.ex]) sel.ex = saved.ex;
    if (saved.slot === 0 || saved.slot === 1) sel.slot = saved.slot;
    if (METRICS.some(([k]) => k === saved.metric)) sel.metric = saved.metric;
  } catch {}
}
function saveSel() {
  try { localStorage.setItem('progress.sel', JSON.stringify(sel)); } catch {}
}

export async function render(container) {
  c = container;
  loadSel();
  const [sessions, bands, bwRows] = await Promise.all([listSessions(), bandsById(), getAll('bodyweight')]);
  done = sessions.filter((s) => s.status === 'done');
  const rows = bwRows.sort((a, b) => a.date.localeCompare(b.date));
  const bwFor = (date) => {
    let best = null;
    for (const r of rows) if (r.date <= date) best = r;
    return (best || rows[0])?.kg ?? null;
  };
  opts = { bandsById: bands, bodyweightFor: bwFor };
  draw();
}

function seg(items, current, onPick) {
  return el('div', { class: 'seg' }, ...items.map(([key, label]) => el('button', {
    type: 'button', class: 'seg-btn' + (String(key) === String(current) ? ' on' : ''), onclick: () => onPick(key),
  }, label)));
}

function draw() {
  const exSel = el('select', { class: 'select', 'aria-label': 'Ejercicio', onchange: (e) => { sel.ex = e.target.value; saveSel(); draw(); } },
    ...Object.entries(EXERCISES).map(([id, ex]) => el('option', { value: id, selected: id === sel.ex }, ex.name)));
  const slotSeg = seg([[0, 'Serie 1'], [1, 'Serie 2']], sel.slot, (k) => { sel.slot = Number(k); saveSel(); draw(); });
  const metricSeg = seg(METRICS.map(([k, l]) => [k, l]), sel.metric, (k) => { sel.metric = k; saveSel(); draw(); });
  const unit = METRICS.find(([k]) => k === sel.metric)?.[2] || '';
  const pts = seriesFor(done, sel.ex, sel.slot, sel.metric, opts);
  const chart = el('div', { class: 'chart' });
  chart.innerHTML = lineChart(pts, { width: 340, height: 180, unit });

  const prs = computePRs(done, opts)[sel.ex]?.[sel.slot] || {};
  const prItems = Object.entries(PR_LABELS)
    .filter(([type]) => prs[type])
    .map(([type, label]) => el('div', { class: 'list-item' },
      el('span', { class: 'muted small' }, label),
      el('span', { class: 'bold' }, `${type === 'maxBwReps' ? fmtNum(prs[type].value) + ' reps' : fmtKg(Math.round(prs[type].value * 10) / 10)} · ${fmtShortDate(prs[type].date)}`),
    ));

  const ms = milestones(done);
  const bars = Object.entries(ms).map(([ex, m]) => el('div', { class: 'list', style: { gap: '4px' } },
    el('div', { class: 'row-between' },
      el('span', { class: 'bold' }, `${EXERCISES[ex].short} +${m.targetKg} kg × 10`),
      el('span', { class: 'muted small', dataset: { milestone: ex } }, `${fmtNum(m.bestKg)} / ${m.targetKg} kg`),
    ),
    el('div', { class: 'bar' }, el('i', { style: { width: `${m.pct}%` } })),
  ));

  const formHost = el('div');
  const openForm = () => {
    const last = done[0];
    formHost.replaceChildren(backfillForm({
      bandsById: opts.bandsById,
      bands: opts.bandsById,
      defaults: { day: last ? (last.day === 'pull' ? 'push' : 'pull') : 'pull', bodyweightKg: last?.bodyweightKg ?? '' },
      onSaved: () => render(c),
      onCancel: () => formHost.replaceChildren(),
    }));
    formHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  c.replaceChildren(
    el('h1', {}, 'Progreso'),
    el('div', { class: 'row-between' },
      el('p', { class: 'muted small' }, '¿Anotabas en papel? Cargá esas sesiones y mirá la curva desde el día 1.'),
      el('button', { type: 'button', class: 'btn btn-sm', onclick: openForm }, 'Cargar sesión pasada'),
    ),
    formHost,
    el('section', { class: 'card' },
      exSel,
      el('div', { class: 'row' }, slotSeg, metricSeg),
      chart,
      el('p', { class: 'muted small' }, pts.length ? `${pts.length} sesión${pts.length > 1 ? 'es' : ''} registrada${pts.length > 1 ? 's' : ''}` : 'Cuando registres sesiones, acá aparece la curva.'),
    ),
    el('section', { class: 'card' },
      el('p', { class: 'label-caps gold' }, `PRs · ${EXERCISES[sel.ex].short} · Serie ${sel.slot + 1}`),
      prItems.length ? el('div', { class: 'list' }, ...prItems) : el('p', { class: 'muted small' }, 'Sin PRs todavía.'),
    ),
    el('section', { class: 'card' },
      el('p', { class: 'label-caps' }, 'Hitos del programa'),
      el('p', { class: 'muted small' }, 'Con fondos +40 kg × 10 y dominadas +20 kg × 10 arranca la fase de skills.'),
      ...bars,
    ),
  );
}
