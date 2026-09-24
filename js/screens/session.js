import { el, fmtDate, todayISO, loadText, toast, confirmDialog, debounce, prText, fmtNum, mount } from '../ui.js';
import { getProfile, listSessions, activeSession, latestBodyweight, bandsById, listExtras, ensureSeeds, saveSession, deleteSession } from '../db.js';
import { nextDay, suggestMain, suggestSecond, MAIN_BY_DAY, SECOND_BY_DAY, EXERCISES, computePRs, detectNewPRs, makeSet, needsBodyweightPrompt } from '../model.js';
import { newSession, BLOCK_META, WARMUP_ITEMS, sessionDuration, uid } from '../templates.js';
import { put } from '../db.js';
import { setRow } from '../setrow.js';

let c = null;
let navigate = () => {};
let profile = null;
let bands = {};
let extras = [];
let doneSessions = [];
let session = null;
let bwLatest = null;
let bwPromptDismissedFor = null;

function bodyweightPrompt() {
  if (!needsBodyweightPrompt(bwLatest, todayISO()) || bwPromptDismissedFor === session.id) return null;
  const input = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'kg', 'aria-label': 'Peso corporal de hoy' });
  const card = el('section', { class: 'card', dataset: { bwPrompt: '' } },
    el('p', { class: 'label-caps gold' }, bwLatest ? 'Hace más de una semana que no cargás tu peso' : 'Peso corporal'),
    el('p', { class: 'muted small' }, 'Con el peso de hoy la carga total y el 1RM salen bien. Podés omitirlo.'),
    el('div', { class: 'row' },
      input,
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: async () => {
        const kg = Number(input.value);
        if (!(kg > 20 && kg < 300)) { toast('Ingresá un peso válido', 'error'); return; }
        const row = { id: uid('bw'), date: todayISO(), kg: Math.round(kg * 10) / 10 };
        try { await put('bodyweight', row); } catch { toast('No se pudo guardar', 'error'); return; }
        bwLatest = row;
        session.bodyweightKg = row.kg;
        persist();
        card.remove();
      } }, 'Guardar'),
      el('button', { type: 'button', class: 'link', onclick: () => { bwPromptDismissedFor = session.id; card.remove(); } }, 'Omitir'),
    ),
  );
  return card;
}

const persist = debounce(() => {
  if (!session) return;
  saveSession(session).catch(() => toast('No se pudo guardar', 'error'));
}, 300);

export async function render(container, ctx) {
  c = container;
  navigate = ctx.navigate;
  await ensureSeeds();
  [profile, bands, extras, bwLatest] = await Promise.all([getProfile(), bandsById(), listExtras(), latestBodyweight()]);
  doneSessions = (await listSessions()).filter((s) => s.status === 'done');
  session = await activeSession();
  if (session) return workout();
  const wanted = ctx.query?.day === 'push' || ctx.query?.day === 'pull' ? ctx.query.day : null;
  if (wanted) {
    // Limpia la URL: una recarga no debe volver a arrancar una sesión.
    try { history.replaceState(null, '', '#/entrenar'); } catch {}
    return start(wanted);
  }
  chooser(nextDay(doneSessions[0]));
}

export function destroy() {
  persist.flush();
}

function lastBlock(kind, exerciseId) {
  const s = doneSessions.find((x) => x.blocks?.[kind]?.exerciseId === exerciseId);
  return s?.blocks[kind] || null;
}
function prevBlock(kind, exerciseId) {
  const list = doneSessions.filter((x) => x.blocks?.[kind]?.exerciseId === exerciseId);
  return list[1]?.blocks[kind] || null;
}

function chooser(suggested) {
  c.replaceChildren(
    el('h1', {}, 'Entrenar'),
    el('p', { class: 'muted' }, `Te sugiero ${suggested.toUpperCase()}. Elegí el día.`),
    el('div', { class: 'daypick' },
      ...['push', 'pull'].map((day) => el('button', {
        type: 'button',
        class: 'daycard' + (day === suggested ? ' suggested' : ''),
        onclick: () => start(day),
      },
      el('b', {}, day.toUpperCase()),
      el('span', { class: 'muted small' }, EXERCISES[MAIN_BY_DAY[day]].name),
      el('span', { class: 'muted small' }, EXERCISES[SECOND_BY_DAY[day]].name),
      day === suggested ? el('span', { class: 'chip chip-gold' }, 'Sugerido') : null,
      )),
    ),
  );
}

async function start(day) {
  const mainEx = MAIN_BY_DAY[day];
  const secondEx = SECOND_BY_DAY[day];
  const mainSuggestion = suggestMain(mainEx, lastBlock('main', mainEx), {
    incrementKg: profile.incrementKg[mainEx], previousBlock: prevBlock('main', mainEx), bandsById: bands,
  });
  const secondSuggestion = suggestSecond(secondEx, lastBlock('second', secondEx), { incrementKg: profile.incrementKg.second });
  session = newSession({ day, dateISO: todayISO(), bodyweightKg: bwLatest?.kg ?? null, mainSuggestion, secondSuggestion });
  try {
    await saveSession(session);
  } catch {
    toast('No se pudo guardar la sesión', 'error');
  }
  if (mainSuggestion.switchTo2_5) toast('Con 5 kg cayeron las reps: considerá pasar a 2,5 kg en Ajustes');
  workout();
}

function blockCard(key, extraHead, ...children) {
  const meta = BLOCK_META[key];
  return el('section', { class: `card block block-${key}`, dataset: { block: key } },
    el('div', { class: 'card-head' },
      el('h2', { class: 'card-title' }, meta.title),
      el('div', { class: 'row', style: { gap: '8px' } }, el('span', { class: 'label-caps' }, meta.subtitle), extraHead),
    ),
    ...children,
  );
}

function lastText(block, i) {
  const s = block?.sets?.[i];
  if (!s || !(Number(s.reps) > 0)) return null;
  return `${loadText(s.load, bands)} × ${fmtNum(s.reps)}`;
}

function workout() {
  const b = session.blocks;
  const mainEx = b.main.exerciseId;
  const secondEx = b.second.exerciseId;
  const [r1, r2] = EXERCISES[mainEx].ranges;
  const [lo, hi] = EXERCISES[secondEx].range;
  const lastMain = lastBlock('main', mainEx);
  const lastSecond = lastBlock('second', secondEx);

  const header = el('div', { class: 'row-between' },
    el('div', {},
      el('div', { class: 'row' }, el('span', { class: `chip chip-${session.day}` }, session.day), el('span', { class: 'muted small' }, fmtDate(session.date))),
      el('h1', {}, EXERCISES[mainEx].name),
      el('p', { class: 'muted small' }, 'Para los descansos usá el Temporizador de abajo.'),
    ),
    el('button', { type: 'button', class: 'link', onclick: discard }, 'Descartar'),
  );

  const warmup = blockCard('warmup', null,
    el('div', { class: 'list' }, ...WARMUP_ITEMS.map((name, i) => el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: !!b.warmup.items[i], onchange: (e) => { b.warmup.items[i] = e.target.checked; persist(); } }),
      el('span', {}, name),
    ))),
  );

  const approach = blockCard('approach', null,
    ...b.approach.sets.map((set, i) => setRow({
      set, bands, label: `Aprox ${i + 1} · 5 reps`, onChange: persist,
    })),
  );

  const main = blockCard('main', null,
    el('p', { class: 'muted small' }, `${EXERCISES[mainEx].name}. Las dos series al fallo, con el peso que te haga fallar dentro del rango.`),
    ...b.main.sets.map((set, i) => setRow({
      set, bands,
      label: `Serie ${i + 1} · ${i === 0 ? `${r1[0]} a ${r1[1]}` : `${r2[0]} a ${r2[1]}`} reps`,
      hint: i === 0 ? `Entre ${r1[0]} y ${r1[1]} repeticiones. Con ${r1[1]} o más, la próxima subís peso.` : `Entre ${r2[0]} y ${r2[1]} repeticiones. Con ${r2[1]} o más, la próxima subís peso.`,
      last: lastText(lastMain, i), onChange: persist,
    })),
  );

  const second = blockCard('second', null,
    el('p', { class: 'muted small' }, `${EXERCISES[secondEx].name}. ${lo} a ${hi} reps al fallo.`),
    ...b.second.sets.map((set, i) => setRow({
      set, bands, label: `Serie ${i + 1} · ${lo} a ${hi} reps`, hint: `Entre ${lo} y ${hi} repeticiones al fallo. Con ${hi} o más en las dos series, subís carga.`, last: lastText(lastSecond, i), onChange: persist,
    })),
  );

  const extraHost = el('div', { class: 'list' });
  const drawExtras = () => {
    extraHost.replaceChildren(...b.extra.map((item, idx) => {
      const ex = extras.find((e) => e.id === item.exerciseId);
      const name = item.name || ex?.name || 'Complementario';
      return el('div', { class: 'extra-item' },
        el('div', { class: 'row-between' },
          el('h3', {}, name),
          el('button', { type: 'button', class: 'link', onclick: () => { b.extra.splice(idx, 1); persist(); drawExtras(); } }, 'Quitar'),
        ),
        ...item.sets.map((set, i) => setRow({
          set, bands, label: `Serie ${i + 1}`, onChange: persist,
        })),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { item.sets.push(makeSet(item.sets[item.sets.length - 1]?.load)); persist(); drawExtras(); } }, '+ serie'),
      );
    }));
  };
  drawExtras();
  const available = extras.filter((e) => !e.archived && (e.day === 'any' || e.day === session.day));
  const picker = el('select', { class: 'select', 'aria-label': 'Agregar complementario' },
    el('option', { value: '' }, '+ Agregar complementario'),
    ...available.map((e) => el('option', { value: e.id }, e.name)),
  );
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    const chosen = extras.find((e) => e.id === picker.value);
    b.extra.push({ exerciseId: picker.value, name: chosen?.name || 'Complementario', sets: [makeSet()] });
    picker.value = '';
    persist();
    drawExtras();
  });
  const extra = blockCard('extra', null, extraHost, available.length ? picker : el('p', { class: 'muted small' }, 'No hay complementarios para este día. Agregalos en Ajustes.'));

  const notes = el('section', { class: 'card' },
    el('p', { class: 'label-caps' }, 'Notas'),
    el('textarea', { class: 'notes', placeholder: 'Cómo dormiste, molestias, energía…', dataset: { notes: '' }, oninput: (e) => { session.notes = e.target.value; persist(); } }, session.notes || ''),
  );

  const footer = el('div', { class: 'btn-row' },
    el('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: finish }, 'Terminar sesión'),
  );

  mount(c, header, bodyweightPrompt(), warmup, approach, main, second, extra, notes, footer);
}

async function discard() {
  if (!(await confirmDialog('¿Descartar esta sesión? Se borra lo que cargaste.'))) return;
  persist.cancel();
  const doomed = session;
  session = null;
  try {
    await deleteSession(doomed.id);
    chooser(nextDay(doneSessions[0]));
  } catch {
    session = doomed;
    toast('No se pudo descartar', 'error');
  }
}

async function finish() {
  const anyDone = session.blocks.main.sets.some((s) => s.done && s.reps > 0) || session.blocks.second.sets.some((s) => s.done && s.reps > 0);
  const msg = anyDone ? '¿Terminar y guardar la sesión?' : 'No marcaste ninguna serie del principal. ¿Guardar igual?';
  if (!(await confirmDialog(msg))) return;
  persist.cancel();
  session.status = 'done';
  session.finishedAt = Date.now();
  const opts = { bandsById: bands, bodyweightFor: () => session.bodyweightKg ?? bwLatest?.kg ?? null };
  const before = computePRs(doneSessions, opts);
  const news = detectNewPRs(before, session, opts);
  try {
    await saveSession(session);
  } catch {
    toast('No se pudo guardar la sesión', 'error');
    return;
  }
  summary(news);
}

function summary(news) {
  const mainEx = session.blocks.main.exerciseId;
  const secondEx = session.blocks.second.exerciseId;
  const next = suggestMain(mainEx, session.blocks.main, { incrementKg: profile.incrementKg[mainEx], previousBlock: lastBlock('main', mainEx), bandsById: bands });
  const nextSecond = suggestSecond(secondEx, session.blocks.second, { incrementKg: profile.incrementKg.second });
  const dur = sessionDuration(session);
  const saved = session;
  session = null;
  c.replaceChildren(
    el('section', { class: 'card card-dark' },
      el('p', { class: 'label-caps' }, 'Sesión guardada'),
      el('h2', { class: 'card-title' }, `${saved.day.toUpperCase()} · ${fmtDate(saved.date, { weekday: false })}`),
      el('p', { class: 'muted' }, dur !== null ? `${dur} minutos` : ''),
      saved.notes ? el('p', { class: 'small', style: { fontStyle: 'italic' } }, saved.notes) : null,
    ),
    el('section', { class: 'card' + (news.length ? ' card-pr' : '') },
      news.length ? el('h2', { class: 'card-title' }, '¡Nuevo récord!') : null,
      el('p', { class: 'label-caps gold' }, news.length ? `${news.length} PR${news.length > 1 ? 's' : ''} nuevo${news.length > 1 ? 's' : ''}` : 'Sin PRs esta vez'),
      news.length ? el('ul', { class: 'list', style: { margin: 0, paddingLeft: '18px' } }, ...news.map((n) => el('li', {}, `${prText(n)}${n.prev !== null ? ` (antes ${fmtNum(n.prev)})` : ''}`))) : el('p', { class: 'muted small' }, 'Seguí acumulando. El método paga con constancia.'),
    ),
    el('section', { class: 'card' },
      el('p', { class: 'label-caps' }, 'Próxima vez'),
      el('div', {}, el('b', {}, 'Serie 1 · '), loadText(next.sets[0].load, bands), el('span', { class: 'muted small' }, ` · ${next.sets[0].hint}`)),
      el('div', {}, el('b', {}, 'Serie 2 · '), loadText(next.sets[1].load, bands), el('span', { class: 'muted small' }, ` · ${next.sets[1].hint}`)),
      el('div', {}, el('b', {}, `${EXERCISES[secondEx].short} · `), loadText(nextSecond.load, bands), el('span', { class: 'muted small' }, ` · ${nextSecond.hint}`)),
      next.switchTo2_5 ? el('p', { class: 'small', style: { color: 'var(--primary)' } }, 'Con 5 kg cayeron las reps: considerá pasar a 2,5 kg en Ajustes.') : null,
    ),
    el('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: () => navigate('#/inicio') }, 'Volver al inicio'),
  );
}
