import { el, fmtKg, fmtNum, fmtShortDate, fmtDate, todayISO, mount, toast } from '../ui.js';
import { listSessions, bandsById, getAll, getProfile, listMeasurements, saveProfile } from '../db.js';
import { EXERCISES, computePRs, milestones, seriesFor } from '../model.js';
import { lineChart, radarChart } from '../charts.js';
import { backfillForm } from '../backfill.js';
import { measureForm } from '../measure.js';
import { characterSheet } from '../sheet.js';
import { needsMeasurementPrompt } from '../body.js';
import { xpForLevel } from '../stats.js';

const METRICS = [
  ['added', 'Lastre', 'kg'],
  ['total', 'Total', 'kg'],
  ['e1rm', '1RM', 'kg'],
  ['reps', 'Reps', ''],
];
const PR_LABELS = { maxAdded: 'Mejor lastre', maxTotal: 'Mejor carga total', maxE1RM: 'Mejor 1RM estimado', maxBwReps: 'Más reps a peso corporal' };
const ATTR_LABELS = [['tiron', 'Tirón'], ['empuje', 'Empuje'], ['base', 'Base'], ['constancia', 'Constancia'], ['volumen', 'Volumen'], ['cuerpo', 'Cuerpo']];

let sel = { ex: 'dips', slot: 0, metric: 'added' };
let c = null;
let done = [];
let opts = {};
let profile = null;
let sheet = null;
let measurements = [];
let avatarApi = null;
let avatarObserver = null;

function releaseAvatar() {
  try { avatarObserver?.disconnect(); } catch {}
  avatarObserver = null;
  try { avatarApi?.dispose(); } catch {}
  avatarApi = null;
}

export function destroy() {
  releaseAvatar();
}

const TINTS = [['blanco', 'Blanco'], ['crema', 'Crema'], ['gris', 'Gris']];
const HAIRS = [['none', 'Sin pelo'], ['short', 'Corto'], ['long', 'Largo'], ['bun', 'Rodete']];
const BEARDS = [['none', 'Sin barba'], ['short', 'Corta'], ['full', 'Completa']];

// Tarjeta del personaje: carga los módulos 3D solo acá, para no frenar el arranque de la app.
function avatarCard() {
  releaseAvatar();
  const canvas = el('canvas', { class: 'avatar-canvas', width: 320, height: 380, 'aria-label': 'Tu personaje en 3D' });
  const status = el('p', { class: 'muted small', dataset: { avatarStatus: '' } }, 'Cargando la figura…');
  const panelHost = el('div');
  const unlocksHost = el('div', { class: 'list' });
  const lv = sheet.level;
  const card = el('section', { class: 'card card-dark', dataset: { sheet: 'avatar' } },
    el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, 'Tu personaje'), el('span', { class: 'label-caps' }, `Nivel ${lv.level} · ${lv.title}`)),
    el('div', { class: 'avatar-wrap' }, canvas),
    status,
    el('p', { class: 'muted small' }, 'Girá la estatua con el dedo. Crece con tus atributos y se adorna con tu nivel.'),
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn btn-ghost btn-dark btn-sm', onclick: () => togglePanel() }, 'Personalizar')),
    panelHost,
    el('p', { class: 'label-caps', style: { marginTop: '8px' } }, 'Desbloqueos'),
    unlocksHost,
  );

  let mods = null;
  let params = null;
  const currentParams = () => mods.avatarParams(sheet, profile);
  const drawUnlocks = () => {
    const u = params?.unlocks || {};
    unlocksHost.replaceChildren(...mods.UNLOCKS.map((it) => {
      const on = !!u[it.key];
      return el('div', { class: 'list-item', dataset: { unlock: it.key, state: on ? 'on' : 'off' } },
        el('span', { class: on ? '' : 'muted' }, it.name),
        el('span', { class: 'chip ' + (on ? 'chip-gold' : ''), style: on ? {} : { opacity: 0.6 } }, on ? 'Listo' : `Nivel ${it.level}`),
      );
    }));
  };
  const seg = (key, options) => el('div', { class: 'seg', dataset: { avatar: key } }, ...options.map(([k, l]) => el('button', {
    type: 'button', class: 'seg-btn' + (profile.avatar[key] === k ? ' on' : ''),
    onclick: async () => {
      if (profile.avatar[key] === k) return;
      profile.avatar[key] = k;
      try { await saveProfile(profile); } catch { toast('No se pudo guardar', 'error'); }
      params = currentParams();
      avatarApi?.update(params);
      drawPanel();
    },
  }, l)));
  const drawPanel = () => {
    if (!panelHost.dataset.open) return;
    panelHost.replaceChildren(
      el('div', { class: 'field' }, el('label', {}, 'Mármol'), seg('tint', TINTS)),
      el('div', { class: 'field' }, el('label', {}, 'Pelo'), seg('hair', HAIRS)),
      el('div', { class: 'field' }, el('label', {}, 'Barba'), seg('beard', BEARDS)),
    );
  };
  const togglePanel = () => {
    if (panelHost.dataset.open) { delete panelHost.dataset.open; panelHost.replaceChildren(); return; }
    panelHost.dataset.open = '1';
    drawPanel();
  };

  (async () => {
    try {
      const [p, s] = await Promise.all([import('../avatar/params.js'), import('../avatar/scene.js')]);
      mods = { avatarParams: p.avatarParams, UNLOCKS: p.UNLOCKS, createAvatar: s.createAvatar };
    } catch {
      status.textContent = 'La figura necesita conexión la primera vez. Volvé a abrir Progreso con internet.';
      return;
    }
    params = currentParams();
    drawUnlocks();
    if (!card.isConnected) return;
    const api = await mods.createAvatar(canvas, params);
    if (!api) { status.textContent = 'Tu navegador no puede mostrar la figura 3D.'; return; }
    if (!card.isConnected) { api.dispose(); return; }
    avatarApi = api;
    card.__avatar = api;
    status.remove();
    if ('IntersectionObserver' in window) {
      avatarObserver = new IntersectionObserver((entries) => { for (const e of entries) api.setVisible(e.isIntersecting); }, { threshold: 0.1 });
      avatarObserver.observe(card);
    } else {
      api.setVisible(true);
    }
  })();

  return card;
}

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
  const [sessions, bands, bwRows, prof, meas] = await Promise.all([listSessions(), bandsById(), getAll('bodyweight'), getProfile(), listMeasurements()]);
  done = sessions.filter((s) => s.status === 'done');
  profile = prof;
  measurements = meas;
  const rows = bwRows.sort((a, b) => a.date.localeCompare(b.date));
  const bwFor = (date) => {
    let best = null;
    for (const r of rows) if (r.date <= date) best = r;
    return (best || rows[0])?.kg ?? null;
  };
  opts = { bandsById: bands, bodyweightFor: bwFor };
  sheet = characterSheet({ sessions: done, bodyweightRows: rows, measurements, profile, bandsById: bands, todayISO: todayISO() });
  draw();
}

function seg(items, current, onPick) {
  return el('div', { class: 'seg' }, ...items.map(([key, label]) => el('button', {
    type: 'button', class: 'seg-btn' + (String(key) === String(current) ? ' on' : ''), onclick: () => onPick(key),
  }, label)));
}

function arrow(delta) {
  if (delta === null || delta === undefined) return '';
  if (delta > 0.05) return `▲ +${fmtNum(delta)}`;
  if (delta < -0.05) return `▼ ${fmtNum(delta)}`;
  return '= 0';
}

function fichaCard() {
  const lv = sheet.level;
  const base = xpForLevel(lv.level);
  const span = lv.nextLevelXp ? lv.nextLevelXp - base : 1;
  const pct = Math.max(0, Math.min(100, Math.round(((sheet.xp.xp - base) / span) * 100)));
  return el('section', { class: 'card card-dark', dataset: { sheet: 'ficha' } },
    el('div', { class: 'row-between' },
      el('div', {},
        el('p', { class: 'label-caps' }, 'Tu ficha'),
        el('h2', { class: 'card-title', style: { fontSize: '34px' } }, lv.title),
      ),
      el('div', { style: { textAlign: 'right' } },
        el('p', { class: 'label-caps' }, 'Nivel'),
        el('b', { style: { fontSize: '40px', lineHeight: 1, color: 'var(--gold)' }, dataset: { level: '' } }, String(lv.level)),
      ),
    ),
    el('div', { class: 'xpbar' }, el('i', { style: { width: `${pct}%` } })),
    el('p', { class: 'muted small' }, `${fmtNum(sheet.xp.xp)} XP · faltan ${fmtNum(lv.xpToNext)} para nivel ${lv.level + 1} · ${sheet.sessionsCount} sesiones`),
  );
}

function radarCard() {
  const values = ATTR_LABELS.map(([k, label]) => ({ label, value: sheet.attributes[k] }));
  const host = el('div', { class: 'chart radar' });
  host.innerHTML = radarChart(values, { size: 320 });
  const missing = ATTR_LABELS.filter(([k]) => sheet.attributes[k] === null).map(([, l]) => l);
  return el('section', { class: 'card', dataset: { sheet: 'radar' } },
    el('p', { class: 'label-caps' }, 'Atributos'),
    host,
    missing.length ? el('p', { class: 'muted small' }, `Sin datos todavía: ${missing.join(', ')}. ${missing.includes('Cuerpo') ? 'Cargá tu peso y mediciones en Ajustes.' : ''}`) : null,
  );
}

function strengthCard(ex) {
  const s = sheet.strength[ex];
  const has = s.ratio !== null;
  const tierChip = el('span', { class: 'chip ' + (has ? 'chip-gold' : ''), dataset: { tier: ex } }, s.tier.name);
  const lines = [];
  if (has) {
    lines.push(el('p', {}, el('b', {}, `${fmtNum(s.ratio)}×`), el('span', { class: 'muted small' }, ` tu peso corporal · 1RM estimado ${fmtKg(Math.round(s.e1rm))}`)));
    if (s.kgToNext !== null && s.tier.nextRatio !== null) {
      lines.push(el('p', { class: 'small', dataset: { next: ex } }, s.kgToNext > 0
        ? `Te faltan ${fmtNum(s.kgToNext)} kg de lastre a ${s.targetReps} reps para ${s.tier.nextName}.`
        : `Llegá a ${s.targetReps} reps a peso corporal para ${s.tier.nextName}.`));
    } else if (s.tier.nextRatio === null) {
      lines.push(el('p', { class: 'small' }, 'Estás en Élite. Ahora es mantener y afinar.'));
    }
    lines.push(el('p', { class: 'small' }, el('span', { class: 'label-caps' }, 'Tendencia '), `${s.trend}${s.slope !== null ? ` · ${s.slope > 0 ? '+' : ''}${fmtNum(s.slope)} kg por sesión` : ''}`));
    const st = s.stagnation;
    lines.push(el('p', { class: 'small', dataset: { stagnation: ex }, style: st.stagnant ? { color: 'var(--danger)', fontWeight: 700 } : {} },
      st.stagnant ? `Estancado: ${st.count} sesiones sin superar tu mejor serie 1. ${st.suggestion}` : (s.sessions ? `En racha: ${st.count === 0 ? 'la última sesión fue tu mejor marca.' : `${st.count} sesión${st.count > 1 ? 'es' : ''} desde tu mejor marca.`}` : '')));
  } else {
    const what = s.short.toLowerCase();
    const msg = s.sessions === 0
      ? `Todavía no registraste ${what}.`
      : sheet.body.currentWeight === null
        ? 'Falta tu peso corporal para calcular la fuerza relativa.'
        : `Sin sesiones de ${what} en las últimas 8 semanas.`;
    lines.push(el('p', { class: 'muted small', dataset: { empty: ex } }, msg));
  }
  return el('section', { class: 'card', dataset: { sheet: ex } },
    el('div', { class: 'row-between' }, el('h3', {}, s.name), tierChip),
    ...lines,
  );
}

function bodyCard(openMeasure) {
  const b = sheet.body;
  const goalText = { bajar: 'Bajar', mantener: 'Mantener', subir: 'Subir' }[b.goal.direction] || 'Mantener';
  const target = [b.goal.targetWeightKg ? `${fmtNum(b.goal.targetWeightKg)} kg` : null, b.goal.targetBodyFatPct ? `${fmtNum(b.goal.targetBodyFatPct)} % grasa` : null].filter(Boolean).join(' · ');
  return el('section', { class: 'card', dataset: { sheet: 'cuerpo' } },
    el('div', { class: 'row-between' }, el('h3', {}, 'Cuerpo'), el('span', { class: 'chip' }, `${goalText}${target ? ' · ' + target : ''}`)),
    el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', {}, b.currentWeight !== null ? fmtNum(b.currentWeight) : '—'), el('span', {}, `kg${b.weight ? ` · 30 d ${arrow(b.weight.delta)}` : ''}`)),
      el('div', { class: 'stat', dataset: { fat: '' } }, el('b', {}, b.currentFat !== null ? `${fmtNum(b.currentFat)} %` : '—'), el('span', {}, `grasa${b.fat ? ` · 30 d ${arrow(b.fat.delta)}` : ''}`)),
      el('div', { class: 'stat' }, el('b', {}, b.leanMass !== null ? fmtNum(b.leanMass) : '—'), el('span', {}, 'kg magros')),
    ),
    b.currentFat === null ? el('p', { class: 'muted small' }, b.hasProfile ? 'Sin datos de grasa: registrá una medición con cinta o balanza.' : 'Cargá sexo y altura en Ajustes y después registrá una medición.') : el('p', { class: 'muted small' }, 'La grasa con cinta es una estimación con margen de unos 3 puntos.'),
    el('button', { type: 'button', class: 'btn btn-sm', onclick: openMeasure }, 'Registrar medidas'),
  );
}

function consistencyCard() {
  const cs = sheet.consistency;
  return el('section', { class: 'card', dataset: { sheet: 'constancia' } },
    el('div', { class: 'row-between' }, el('h3', {}, 'Constancia'), el('span', { class: 'chip chip-gold' }, `${cs.fulfilled} de 8 semanas`)),
    el('div', { class: 'weeks' }, ...cs.counts.map((n, i) => el('div', { class: 'week-cell' + (n >= 2 ? ' on' : ''), dataset: { week: String(i) }, title: `${n} sesiones` }, String(n)))),
    el('p', { class: 'muted small' }, cs.streak > 0 ? `Racha: ${cs.streak} semana${cs.streak > 1 ? 's' : ''} seguida${cs.streak > 1 ? 's' : ''} con 2 o más sesiones.` : 'Una semana cumplida son 2 sesiones o más. Arrancá la racha esta semana.'),
  );
}

function draw() {
  const formHost = el('div');
  const measureHost = el('div');
  const openForm = () => {
    const last = done[0];
    formHost.replaceChildren(backfillForm({
      bands: opts.bandsById,
      defaults: { day: last ? (last.day === 'pull' ? 'push' : 'pull') : 'pull', bodyweightKg: last?.bodyweightKg ?? '' },
      onSaved: () => render(c),
      onCancel: () => formHost.replaceChildren(),
    }));
    formHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openMeasure = () => {
    measureHost.replaceChildren(measureForm({ profile, onSaved: () => render(c), onCancel: () => measureHost.replaceChildren() }));
    measureHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const latestMeasurement = measurements[0] || null;
  const reminder = needsMeasurementPrompt(latestMeasurement, todayISO())
    ? el('div', { class: 'notice row-between', dataset: { reminder: '' } },
      el('span', {}, latestMeasurement ? `Última medición el ${fmtDate(latestMeasurement.date, { weekday: false })}. Toca medirse.` : 'Todavía no tenés mediciones del cuerpo.'),
      el('button', { type: 'button', class: 'btn btn-sm', onclick: openMeasure }, 'Registrar medidas'))
    : null;

  mount(c,
    el('h1', {}, 'Progreso'),
    avatarCard(),
    fichaCard(),
    radarCard(),
    reminder,
    measureHost,
    strengthCard('pullups'),
    strengthCard('dips'),
    bodyCard(openMeasure),
    consistencyCard(),
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
