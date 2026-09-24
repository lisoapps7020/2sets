// Dominio del método 2 Sets. Funciones puras, sin DOM ni base de datos.

export const EXERCISES = {
  dips:            { day: 'push', role: 'main',   name: 'Fondos lastrados',    short: 'Fondos',    targets: [10, 15], ranges: [[8, 10], [12, 15]] },
  pullups:         { day: 'pull', role: 'main',   name: 'Dominadas lastradas', short: 'Dominadas', targets: [8, 12], ranges: [[6, 8], [8, 12]] },
  decline_pushups: { day: 'push', role: 'second', name: 'Flexiones declinadas', short: 'Flex. decl.', range: [12, 15] },
  australian_rows: { day: 'pull', role: 'second', name: 'Remo australiano',    short: 'Remo aus.', range: [12, 15] },
};

export const MAIN_BY_DAY = { push: 'dips', pull: 'pullups' };
export const SECOND_BY_DAY = { push: 'decline_pushups', pull: 'australian_rows' };
export const MILESTONES = { dips: 40, pullups: 20 };
export const REST_MIN = 0;
export const REST_MAX = 600;

export function clampRest(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return REST_MIN;
  return Math.min(REST_MAX, Math.max(REST_MIN, Math.round(n)));
}

export function roundDown2_5(kg) {
  const n = Number(kg) || 0;
  return Math.floor(n / 2.5) * 2.5;
}

const kgText = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ','));

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function addedKg(load, bandsById = {}) {
  if (!load) return 0;
  if (load.mode === 'weight') return num(load.kg);
  if (load.mode === 'band') {
    const b = bandsById?.[load.bandId];
    return b ? -num(b.assistKg) : 0;
  }
  return 0;
}

export function totalLoad(set, bodyweightKg, bandsById = {}) {
  return num(bodyweightKg) + addedKg(set?.load, bandsById);
}

export function epley1RM(total, reps) {
  const r = num(reps);
  if (r <= 0) return 0;
  if (r === 1) return num(total);
  return num(total) * (1 + r / 30);
}

export function makeSet(load) {
  const src = load || {};
  return {
    load: { mode: src.mode || 'bodyweight', kg: num(src.kg), bandId: src.bandId ?? null },
    reps: 0,
    halfReps: 0,
    failedReps: 0,
    toFailure: true,
    done: false,
    source: 'manual',
  };
}

// ---------- Progresión ----------

const usable = (s) => !!s && s.done !== false && num(s.reps) > 0;

function suggestSlot(s, range, inc) {
  const [lo, target] = range;
  if (!usable(s)) {
    return { load: { mode: 'bodyweight', kg: 0, bandId: null }, hint: `Encontrá tu peso perfecto: el que te haga fallar entre ${lo} y ${target} reps.` };
  }
  const mode = s.load?.mode || 'bodyweight';
  const kg = num(s.load?.kg);
  const bandId = s.load?.bandId ?? null;
  const reps = num(s.reps);
  if (mode === 'weight') {
    if (reps >= target) return { load: { mode: 'weight', kg: kg + inc, bandId: null }, hint: `Llegaste a ${reps}. Subí a ${kgText(kg + inc)} kg.` };
    return { load: { mode: 'weight', kg, bandId: null }, hint: `Mismo peso: buscá ${lo} a ${target} reps; con ${target} subís.` };
  }
  if (mode === 'bodyweight') {
    if (reps >= target) return { load: { mode: 'weight', kg: inc, bandId: null }, hint: `Pasá a lastre: +${kgText(inc)} kg.` };
    return { load: { mode: 'bodyweight', kg: 0, bandId: null }, hint: `Peso corporal: buscá ${lo} a ${target} reps; con ${target} pasás a lastre.` };
  }
  if (reps >= target) return { load: { mode: 'band', kg: 0, bandId }, hint: 'Probá una banda más liviana o peso corporal.' };
  return { load: { mode: 'band', kg: 0, bandId }, hint: `Misma banda: buscá ${lo} a ${target} reps.` };
}

export function suggestMain(exerciseId, lastBlock, opts = {}) {
  const inc = num(opts.incrementKg) || 5;
  const [r1, r2] = EXERCISES[exerciseId]?.ranges || [[8, 10], [12, 15]];
  const t2 = r2[1];
  const sets = lastBlock?.sets || [];
  const s1 = suggestSlot(sets[0], r1, inc);
  let s2 = suggestSlot(sets[1], r2, inc);
  const slot2HasWeightHistory = usable(sets[1]) && sets[1].load?.mode === 'weight';
  if (s1.load.mode === 'weight' && !slot2HasWeightHistory) {
    const seed = Math.min(Math.max(2.5, roundDown2_5(s1.load.kg * 0.8)), s1.load.kg);
    s2 = { load: { mode: 'weight', kg: seed, bandId: null }, hint: `Serie 2 al 80% de la serie 1: ${kgText(seed)} kg. Buscá ${t2} reps.` };
  }
  const prev = opts.previousBlock?.sets?.[0];
  const last = sets[0];
  const switchTo2_5 = inc === 5 && usable(prev) && usable(last)
    && prev.load?.mode === 'weight' && last.load?.mode === 'weight'
    && num(last.load.kg) > num(prev.load.kg)
    && (num(prev.reps) - num(last.reps)) >= 3;
  return { sets: [s1, s2], switchTo2_5 };
}

export function suggestSecond(exerciseId, lastBlock, opts = {}) {
  const inc = num(opts.incrementKg) || 2.5;
  const [lo, hi] = EXERCISES[exerciseId]?.range || [12, 15];
  const sets = (lastBlock?.sets || []).filter(usable);
  if (sets.length < 2) {
    return { load: { mode: 'bodyweight', kg: 0, bandId: null }, hint: `Arrancá sin carga, buscá ${lo} a ${hi} reps al fallo.` };
  }
  const ref = { mode: sets[0].load?.mode || 'bodyweight', kg: num(sets[0].load?.kg), bandId: sets[0].load?.bandId ?? null };
  const allHi = sets.every((s) => num(s.reps) >= hi);
  if (!allHi) return { load: ref, hint: `Mantené la carga: buscá ${hi} en las dos series.` };
  if (ref.mode === 'weight') return { load: { mode: 'weight', kg: ref.kg + inc, bandId: null }, hint: `Las dos series a ${hi}. Subí a ${kgText(ref.kg + inc)} kg.` };
  if (ref.mode === 'bodyweight') return { load: { mode: 'weight', kg: inc, bandId: null }, hint: `Pasá a lastre: +${kgText(inc)} kg.` };
  return { load: ref, hint: 'Probá una banda más liviana o sin banda.' };
}

export function nextDay(last) {
  return last?.day === 'pull' ? 'push' : 'pull';
}

// ---------- PRs, hitos y series ----------

export function sessionSets(session) {
  const out = [];
  const b = session?.blocks || {};
  for (const key of ['main', 'second']) {
    const block = b[key];
    if (!block?.exerciseId) continue;
    (block.sets || []).forEach((set, slot) => out.push({ exerciseId: block.exerciseId, slot, set }));
  }
  return out;
}

const isDone = (s) => s?.status === 'done';
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const countable = (set) => !!set && set.done !== false && num(set.reps) > 0;

function bodyweightOf(session, opts) {
  if (session.bodyweightKg !== null && session.bodyweightKg !== undefined) return num(session.bodyweightKg);
  const bw = opts.bodyweightFor?.(session.date);
  return num(bw);
}

function metricsOf(set, bw, bandsById) {
  const total = totalLoad(set, bw, bandsById);
  const reps = num(set.reps);
  return {
    maxAdded: set.load?.mode === 'weight' ? num(set.load.kg) : null,
    maxTotal: total,
    maxE1RM: epley1RM(total, reps),
    maxBwReps: set.load?.mode === 'bodyweight' ? reps : null,
  };
}

const EMPTY_SLOT = () => ({ maxAdded: null, maxTotal: null, maxE1RM: null, maxBwReps: null });

export function computePRs(sessions, opts = {}) {
  const prs = {};
  const bands = opts.bandsById || {};
  for (const s of [...(sessions || [])].filter(isDone).sort(byDate)) {
    const bw = bodyweightOf(s, opts);
    for (const { exerciseId, slot, set } of sessionSets(s)) {
      if (!countable(set)) continue;
      const m = metricsOf(set, bw, bands);
      const ex = (prs[exerciseId] ||= {});
      const slotPrs = (ex[slot] ||= EMPTY_SLOT());
      for (const [type, value] of Object.entries(m)) {
        if (value === null || value === undefined) continue;
        if (!slotPrs[type] || value > slotPrs[type].value) slotPrs[type] = { value, date: s.date };
      }
    }
  }
  return prs;
}

export function detectNewPRs(prsBefore, session, opts = {}) {
  const out = [];
  const bw = bodyweightOf(session, opts);
  const bands = opts.bandsById || {};
  for (const { exerciseId, slot, set } of sessionSets(session)) {
    if (!countable(set)) continue;
    const m = metricsOf(set, bw, bands);
    const prev = prsBefore?.[exerciseId]?.[slot] || {};
    for (const [type, value] of Object.entries(m)) {
      if (value === null || value === undefined || value <= 0) continue;
      if (!prev[type] || value > prev[type].value) out.push({ exerciseId, slot, type, value, prev: prev[type]?.value ?? null });
    }
  }
  return out;
}

export function milestones(sessions) {
  const out = {};
  for (const [ex, targetKg] of Object.entries(MILESTONES)) {
    let bestKg = 0;
    for (const s of (sessions || []).filter(isDone)) {
      const b = s.blocks?.main;
      if (b?.exerciseId !== ex) continue;
      const set = b.sets?.[0];
      if (set?.load?.mode === 'weight' && num(set.reps) >= 10) bestKg = Math.max(bestKg, num(set.load.kg));
    }
    out[ex] = { targetKg, bestKg, pct: Math.min(100, Math.round((bestKg / targetKg) * 100)) };
  }
  return out;
}

export function seriesFor(sessions, exerciseId, slot, metric, opts = {}) {
  const pts = [];
  const bands = opts.bandsById || {};
  for (const s of [...(sessions || [])].filter(isDone).sort(byDate)) {
    const hit = sessionSets(s).find((x) => x.exerciseId === exerciseId && x.slot === slot);
    if (!hit || !countable(hit.set)) continue;
    const bw = bodyweightOf(s, opts);
    const total = totalLoad(hit.set, bw, bands);
    const reps = num(hit.set.reps);
    const value = metric === 'added' ? addedKg(hit.set.load, bands)
      : metric === 'total' ? total
      : metric === 'e1rm' ? epley1RM(total, reps)
      : reps;
    pts.push({ date: s.date, value });
  }
  return pts;
}

// ---------- Reglas chicas de UI ----------

const DAY_MS = 86400000;
function utcDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Pedir el peso corporal si nunca se cargó o si el último dato tiene más de 7 días.
export function needsBodyweightPrompt(latest, todayISO) {
  const last = utcDay(latest?.date);
  const today = utcDay(todayISO);
  if (!Number.isFinite(last) || !Number.isFinite(today)) return true;
  return (today - last) / DAY_MS > 7;
}

// Devuelve un bandId válido: el mismo si existe, la primera banda si no, null si no hay bandas.
export function resolveBandId(bandId, bandsById = {}) {
  if (bandId && bandsById[bandId]) return bandId;
  const first = Object.keys(bandsById)[0];
  return first || null;
}
