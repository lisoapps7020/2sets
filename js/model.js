// Dominio del método 2 Sets. Funciones puras, sin DOM ni base de datos.

export const EXERCISES = {
  dips:            { day: 'push', role: 'main',   name: 'Fondos lastrados',    short: 'Fondos',    targets: [10, 15] },
  pullups:         { day: 'pull', role: 'main',   name: 'Dominadas lastradas', short: 'Dominadas', targets: [8, 12] },
  decline_pushups: { day: 'push', role: 'second', name: 'Flexiones declinadas', short: 'Flex. decl.', range: [12, 15] },
  australian_rows: { day: 'pull', role: 'second', name: 'Remo australiano',    short: 'Remo aus.', range: [12, 15] },
};

export const MAIN_BY_DAY = { push: 'dips', pull: 'pullups' };
export const SECOND_BY_DAY = { push: 'decline_pushups', pull: 'australian_rows' };
export const MILESTONES = { dips: 40, pullups: 20 };
export const REST_MIN = 180;
export const REST_MAX = 420;

export function clampRest(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return REST_MIN;
  return Math.min(REST_MAX, Math.max(REST_MIN, Math.round(n)));
}

export function roundDown2_5(kg) {
  const n = Number(kg) || 0;
  return Math.floor(n / 2.5) * 2.5;
}

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

function suggestSlot(s, target, inc) {
  if (!usable(s)) {
    return { load: { mode: 'bodyweight', kg: 0, bandId: null }, hint: `Encontrá tu peso perfecto: el que te haga fallar cerca de ${target} reps.` };
  }
  const mode = s.load?.mode || 'bodyweight';
  const kg = num(s.load?.kg);
  const bandId = s.load?.bandId ?? null;
  const reps = num(s.reps);
  if (mode === 'weight') {
    if (reps >= target) return { load: { mode: 'weight', kg: kg + inc, bandId: null }, hint: `Llegaste a ${reps}. Subí a ${kg + inc} kg.` };
    return { load: { mode: 'weight', kg, bandId: null }, hint: `Mismo peso: buscá ${target} reps.` };
  }
  if (mode === 'bodyweight') {
    if (reps >= target) return { load: { mode: 'weight', kg: inc, bandId: null }, hint: `Pasá a lastre: +${inc} kg.` };
    return { load: { mode: 'bodyweight', kg: 0, bandId: null }, hint: `Peso corporal: buscá ${target} reps.` };
  }
  if (reps >= target) return { load: { mode: 'band', kg: 0, bandId }, hint: 'Probá una banda más liviana o peso corporal.' };
  return { load: { mode: 'band', kg: 0, bandId }, hint: `Misma banda: buscá ${target} reps.` };
}

export function suggestMain(exerciseId, lastBlock, opts = {}) {
  const inc = num(opts.incrementKg) || 5;
  const [t1, t2] = EXERCISES[exerciseId]?.targets || [10, 15];
  const sets = lastBlock?.sets || [];
  const s1 = suggestSlot(sets[0], t1, inc);
  let s2 = suggestSlot(sets[1], t2, inc);
  const slot2HasWeightHistory = usable(sets[1]) && sets[1].load?.mode === 'weight';
  if (s1.load.mode === 'weight' && !slot2HasWeightHistory) {
    const seed = Math.min(Math.max(2.5, roundDown2_5(s1.load.kg * 0.8)), s1.load.kg);
    s2 = { load: { mode: 'weight', kg: seed, bandId: null }, hint: `Serie 2 al 80% de la serie 1: ${seed} kg. Buscá ${t2} reps.` };
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
  if (ref.mode === 'weight') return { load: { mode: 'weight', kg: ref.kg + inc, bandId: null }, hint: `Las dos series a ${hi}. Subí a ${ref.kg + inc} kg.` };
  if (ref.mode === 'bodyweight') return { load: { mode: 'weight', kg: inc, bandId: null }, hint: `Pasá a lastre: +${inc} kg.` };
  return { load: ref, hint: 'Probá una banda más liviana o sin banda.' };
}

export function nextDay(last) {
  return last?.day === 'pull' ? 'push' : 'pull';
}
