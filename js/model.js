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
