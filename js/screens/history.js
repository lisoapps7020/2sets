import { el, fmtDate, fmtMonth, loadText, toast, confirmDialog, fmtNum } from '../ui.js';
import { listSessions, saveSession, deleteSession, bandsById } from '../db.js';
import { EXERCISES } from '../model.js';
import { BLOCK_META, WARMUP_ITEMS, sessionDuration } from '../templates.js';
import { setRow } from '../setrow.js';

let c = null;
let navigate = () => {};
let bands = {};

export async function render(container, ctx) {
  c = container;
  navigate = ctx.navigate;
  bands = await bandsById();
  const sessions = (await listSessions()).filter((s) => s.status === 'done');
  const id = ctx.query?.id;
  if (id) {
    const s = sessions.find((x) => x.id === id);
    if (s) return detail(s, false);
  }
  list(sessions);
}

function setText(set) {
  return `${loadText(set.load, bands)} × ${fmtNum(set.reps)}`;
}

function list(sessions) {
  c.replaceChildren(el('h1', {}, 'Historial'));
  if (!sessions.length) {
    c.append(el('p', { class: 'empty' }, 'Todavía no hay sesiones. Empezá una desde Entrenar.'));
    return;
  }
  const groups = new Map();
  for (const s of sessions) {
    const ym = s.date.slice(0, 7);
    if (!groups.has(ym)) groups.set(ym, []);
    groups.get(ym).push(s);
  }
  for (const [ym, items] of groups) {
    c.append(
      el('h2', { class: 'section-title' }, fmtMonth(`${ym}-01`)),
      el('section', { class: 'card', style: { gap: 0 } },
        ...items.map((s) => {
          const ex = s.blocks?.main?.exerciseId;
          const main = (s.blocks?.main?.sets || []).filter((x) => Number(x.reps) > 0).map(setText).join(' · ');
          const dur = s.origin === 'papel' ? null : sessionDuration(s);
          return el('button', { type: 'button', class: 'list-item', style: { width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', padding: '12px 0' }, onclick: () => navigate(`#/historial?id=${s.id}`) },
            el('div', { class: 'list', style: { gap: '2px' } },
              el('div', { class: 'row' }, el('span', { class: `chip chip-${s.day}` }, s.day), el('span', { class: 'bold' }, fmtDate(s.date)), s.origin === 'papel' ? el('span', { class: 'chip chip-gold' }, 'papel') : null),
              el('span', { class: 'muted small' }, `${EXERCISES[ex]?.short || ex}: ${main || 'sin series'}`),
            ),
            el('span', { class: 'muted small' }, dur !== null ? `${dur} min` : ''),
          );
        }),
      ),
    );
  }
}

function detail(s, editing) {
  const b = s.blocks || {};
  const ex = b.main?.exerciseId;
  const dur = s.origin === 'papel' ? null : sessionDuration(s);
  const rows = (sets, labelFn) => sets.map((set, i) => editing
    ? setRow({ set, bands, label: labelFn(i), onChange: () => {}, onDone: () => {} })
    : el('div', { class: 'list-item' }, el('span', { class: 'label-caps' }, labelFn(i)), el('span', { class: set.done ? 'bold' : 'muted' }, Number(set.reps) > 0 ? setText(set) : 'sin registrar')));
  const block = (key, ...children) => el('section', { class: 'card', dataset: { block: key } },
    el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, BLOCK_META[key].title), el('span', { class: 'label-caps' }, key === 'main' ? EXERCISES[ex]?.name : key === 'second' ? EXERCISES[b.second?.exerciseId]?.name : BLOCK_META[key].subtitle)),
    ...children);

  const actions = editing
    ? el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
        try { await saveSession(s); toast('Guardado', 'ok'); detail(s, false); } catch { toast('No se pudo guardar', 'error'); }
      } }, 'Guardar'),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => detail(s, false) }, 'Cancelar'),
    )
    : el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn', onclick: () => detail(s, true) }, 'Editar'),
      el('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
        if (!(await confirmDialog('¿Eliminar esta sesión? No se puede deshacer.'))) return;
        try { await deleteSession(s.id); toast('Sesión eliminada'); navigate('#/historial'); } catch { toast('No se pudo eliminar', 'error'); }
      } }, 'Eliminar'),
    );

  c.replaceChildren(
    el('div', { class: 'row-between' },
      el('button', { type: 'button', class: 'link', onclick: () => navigate('#/historial') }, '← Historial'),
      el('span', { class: 'muted small' }, dur !== null ? `${dur} min` : ''),
    ),
    el('div', { class: 'row' }, el('span', { class: `chip chip-${s.day}` }, s.day), el('h1', {}, fmtDate(s.date)), s.origin === 'papel' ? el('span', { class: 'chip chip-gold' }, 'papel') : null),
    s.bodyweightKg ? el('p', { class: 'muted small' }, `Peso corporal: ${fmtNum(s.bodyweightKg)} kg`) : null,
    block('warmup', el('div', { class: 'row' }, ...WARMUP_ITEMS.map((n, i) => el('span', { class: 'chip' + (b.warmup?.items?.[i] ? ' chip-gold' : '') }, n)))),
    block('approach', ...rows(b.approach?.sets || [], (i) => `Aprox ${i + 1}`)),
    block('main', ...rows(b.main?.sets || [], (i) => `Serie ${i + 1}`)),
    block('second', ...rows(b.second?.sets || [], (i) => `Serie ${i + 1}`)),
    (b.extra || []).length ? block('extra', ...(b.extra || []).map((item) => el('div', { class: 'extra-item' },
      el('h3', {}, item.name || 'Complementario'),
      ...rows(item.sets || [], (i) => `Serie ${i + 1}`),
    ))) : null,
    (editing || s.notes) ? el('section', { class: 'card', dataset: { block: 'notes' } },
      el('p', { class: 'label-caps' }, 'Notas'),
      editing
        ? el('textarea', { class: 'notes', dataset: { notes: '' }, oninput: (e) => { s.notes = e.target.value; } }, s.notes || '')
        : el('p', { class: 'small', style: { fontStyle: 'italic' } }, s.notes),
    ) : null,
    actions,
  );
}
