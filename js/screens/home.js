import { el, fmtDate, todayISO, loadText, prText, mount } from '../ui.js';
import { getProfile, listSessions, activeSession, latestBodyweight, bandsById, ensureSeeds } from '../db.js';
import { nextDay, suggestMain, MAIN_BY_DAY, EXERCISES, computePRs, detectNewPRs } from '../model.js';
import { quoteFor } from '../quotes.js';

function mondayISO(d = new Date()) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - dow);
  return todayISO(x);
}

export async function render(c, { navigate }) {
  await ensureSeeds();
  const [profile, sessions, active, bw, bands] = await Promise.all([
    getProfile(), listSessions(), activeSession(), latestBodyweight(), bandsById(),
  ]);
  const done = sessions.filter((s) => s.status === 'done');
  const q = quoteFor(todayISO());

  const hero = el('section', { class: 'hero' },
    el('h1', {}, `Hola${profile.name ? ', ' + profile.name : ''}`),
    el('p', { class: 'muted' }, fmtDate(todayISO())),
  );
  const quote = el('blockquote', { class: 'quote' }, `“${q.text}”`, el('cite', {}, q.author));

  const cardHost = el('div');
  const drawCard = (day) => {
    cardHost.replaceChildren(active ? sessionCard(active, navigate) : nextCard(day));
  };
  const nextCard = (day) => {
    const ex = MAIN_BY_DAY[day];
    const ofEx = done.filter((s) => s.blocks?.main?.exerciseId === ex);
    const lastMain = ofEx[0]?.blocks.main || null;
    const prevMain = ofEx[1]?.blocks.main || null;
    const sug = suggestMain(ex, lastMain, { incrementKg: profile.incrementKg[ex], previousBlock: prevMain, bandsById: bands });
    const other = day === 'push' ? 'pull' : 'push';
    return el('section', { class: 'card card-dark' },
      el('p', { class: 'label-caps' }, 'Hoy toca'),
      el('div', { class: 'row-between' },
        el('h2', { class: 'card-title', style: { fontStyle: 'normal', letterSpacing: '0.12em' } }, day.toUpperCase()),
        el('span', { class: `chip chip-${day}` }, EXERCISES[ex].short),
      ),
      el('div', { class: 'list' },
        el('div', {}, el('b', {}, 'Serie 1 · '), loadText(sug.sets[0].load, bands), el('span', { class: 'muted small' }, ` · ${sug.sets[0].hint}`)),
        el('div', {}, el('b', {}, 'Serie 2 · '), loadText(sug.sets[1].load, bands), el('span', { class: 'muted small' }, ` · ${sug.sets[1].hint}`)),
      ),
      sug.switchTo2_5 ? el('p', { class: 'small', style: { color: 'var(--gold)' } }, 'Con 5 kg cayeron las reps: considerá pasar a 2,5 kg en Ajustes.') : null,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', onclick: () => navigate(`#/entrenar?day=${day}`) }, 'Empezar'),
        el('button', { class: 'btn btn-ghost btn-dark', onclick: () => drawCard(other) }, `Cambiar a ${other}`),
      ),
    );
  };
  drawCard(nextDay(done[0]));

  const weekStart = mondayISO();
  const thisWeek = done.filter((s) => s.date >= weekStart).length;
  let lastPr = '—';
  if (done.length) {
    const latest = done[0];
    const opts = { bandsById: bands, bodyweightFor: () => bw?.kg ?? null };
    const before = computePRs(done.slice(1), opts);
    const news = detectNewPRs(before, latest, opts);
    if (news.length) lastPr = prText(news[0]);
  }
  const stats = el('section', { class: 'stats' },
    el('div', { class: 'stat' }, el('b', {}, String(done.length)), el('span', {}, 'Sesiones')),
    el('div', { class: 'stat' }, el('b', {}, String(thisWeek)), el('span', {}, 'Esta semana')),
    el('div', { class: 'stat' }, el('b', { style: { fontSize: '14px', lineHeight: '30px' } }, lastPr), el('span', {}, 'Último PR')),
  );

  mount(c, hero, quote, cardHost, stats,
    !bw ? el('p', { class: 'notice' }, 'Cargá tu peso corporal en Ajustes para calcular la carga total y el 1RM.') : null,
  );
}

function sessionCard(active, navigate) {
  const started = new Date(active.startedAt || Date.now());
  const hh = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
  return el('section', { class: 'card card-dark' },
    el('p', { class: 'label-caps' }, 'Sesión en curso'),
    el('div', { class: 'row-between' },
      el('h2', { class: 'card-title', style: { fontStyle: 'normal', letterSpacing: '0.12em' } }, active.day.toUpperCase()),
      el('span', { class: 'muted' }, `desde las ${hh}`),
    ),
    el('button', { class: 'btn btn-primary btn-wide', onclick: () => navigate('#/entrenar') }, 'Continuar'),
  );
}
