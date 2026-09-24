// Arma la ficha de personaje a partir de sesiones, peso, mediciones y perfil.
// Única función que la pantalla de Progreso necesita para la ficha.
import { EXERCISES, sessionSets } from './model.js';
import { relativeStrength, tierFor, kgToNextTier, e1rmSeries, slope, trendLabel, stagnation, consistency, volumeScore, attributes, xpTotal, levelFor, titleFor } from './stats.js';
import { weeklyAvg, delta30, deltaFat30, fatSeries, leanMass } from './body.js';

function bestBodyweightReps(sessions, exerciseId) {
  let best = null;
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const { exerciseId: ex, set } of sessionSets(s)) {
      if (ex !== exerciseId || !set || set.done === false) continue;
      if (set.load?.mode === 'bodyweight' && Number(set.reps) > 0) best = Math.max(best ?? 0, Number(set.reps));
    }
  }
  return best;
}

export function characterSheet({ sessions = [], bodyweightRows = [], measurements = [], profile = {}, bandsById = {}, todayISO }) {
  const done = sessions.filter((s) => s.status === 'done');
  const rows = bodyweightRows
    .map((r) => ({ ...r, kg: Number(r.kg) }))
    .filter((r) => Number.isFinite(r.kg) && r.kg > 0 && typeof r.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  const bwFor = (date) => {
    let best = null;
    for (const r of rows) if (r.date <= date) best = r;
    return (best || rows[0])?.kg ?? null;
  };
  const opts = { bandsById, bodyweightFor: bwFor };
  const goal = { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null, ...(profile.goal || {}) };

  const strength = {};
  for (const ex of ['pullups', 'dips']) {
    const rs = relativeStrength(done, ex, opts, todayISO);
    const series = e1rmSeries(done, ex, opts);
    const sl = slope(series.map((p) => p.value));
    const inc = profile.incrementKg?.[ex] ?? 5;
    strength[ex] = {
      name: EXERCISES[ex].name,
      short: EXERCISES[ex].short,
      targetReps: EXERCISES[ex].targets[0],
      ratio: rs?.ratio ?? null,
      e1rm: rs?.e1rm ?? null,
      bw: rs?.bw ?? null,
      tier: tierFor(rs?.ratio ?? null, ex),
      kgToNext: rs ? kgToNextTier(rs.ratio, rs.bw, ex) : null,
      slope: sl,
      trend: trendLabel(sl),
      stagnation: stagnation(done, ex, { ...opts, incrementKg: inc }),
      sessions: series.length,
    };
  }

  const cons = consistency(done, todayISO);
  const vol = volumeScore(done, todayISO, opts);
  const xp = xpTotal(done, opts);
  const level = levelFor(xp.xp);

  const weight = delta30(rows, todayISO);
  const latestRow = rows[rows.length - 1] || null;
  const currentWeight = weight?.now ?? weeklyAvg(rows, todayISO) ?? latestRow?.kg ?? null;
  const fs = fatSeries(measurements, profile);
  const fat = deltaFat30(measurements, profile, todayISO);
  const currentFat = fat?.now ?? fs[fs.length - 1]?.value ?? null;
  // Punto de partida de la grasa: la primera medición desde que se fijó el objetivo; si no hay, la primera histórica.
  const startFat = (goal.setAt ? fs.find((p) => p.date >= goal.setAt)?.value : null) ?? fs[0]?.value ?? null;

  const attrs = attributes({
    pullRatio: strength.pullups.ratio,
    dipRatio: strength.dips.ratio,
    pullBwReps: bestBodyweightReps(done, 'pullups'),
    dipBwReps: bestBodyweightReps(done, 'dips'),
    consistencyScore: cons.score,
    volumeScore: vol,
    weightDelta30: weight?.delta ?? null,
    goalDirection: goal.direction,
    currentWeight,
    targetWeight: goal.targetWeightKg,
    startWeight: goal.startWeightKg,
    currentFat,
    targetFat: goal.targetBodyFatPct,
    startFat,
  });

  return {
    xp,
    level: { ...level, title: titleFor(level.level) },
    attributes: attrs,
    strength,
    consistency: cons,
    volumeScore: vol,
    body: {
      weight,
      currentWeight,
      fat,
      currentFat,
      leanMass: currentWeight !== null && currentFat !== null ? leanMass(currentWeight, currentFat) : null,
      goal,
      measurementsCount: fs.length,
      hasProfile: !!(profile.heightCm && profile.sex),
    },
    sessionsCount: done.length,
  };
}
