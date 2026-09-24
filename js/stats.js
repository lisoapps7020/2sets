// Estadísticas del método 2 Sets: fuerza relativa, estancamiento, constancia, volumen, atributos y XP.
// Funciones puras, sin DOM ni base de datos. Los textos son para el usuario (rioplatense).
import { EXERCISES, totalLoad, epley1RM, sessionSets, computePRs, detectNewPRs } from './model.js';

export const TIER_NAMES = ['Novato', 'Iniciado', 'Intermedio', 'Avanzado', 'Élite'];
export const TIERS = {
  pullups: [1.00, 1.25, 1.50, 1.75, 2.00],
  dips:    [1.10, 1.40, 1.70, 2.00, 2.30],
};
// Título por nivel: aplica el último cuyo `min` sea <= nivel.
export const TITLES = [
  { min: 1,  name: 'Tiro' },
  { min: 5,  name: 'Miles' },
  { min: 10, name: 'Decurión' },
  { min: 15, name: 'Centurión' },
  { min: 20, name: 'Tribuno' },
  { min: 30, name: 'Espartano' },
];

const SUGGEST = {
  ok: 'Seguí así.',
  sleep: 'Revisá el sueño: tus notas lo mencionan.',
  increment: 'Pasá a incrementos de 2,5 kg.',
  deload: 'Semana de descarga: 50% de la carga, después volvé a tu peso.',
};

// ---------- Utilidades ----------

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// Número finito o null (acepta strings numéricos; '', null, undefined, NaN → null).
function fin(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const round2 = (x) => Math.round(x * 100) / 100 + 0; // + 0 normaliza -0
const clamp100 = (x) => Math.min(100, Math.max(0, x));
const isDone = (s) => s?.status === 'done';
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const countable = (set) => !!set && set.done !== false && num(set.reps) > 0;
const doneSorted = (sessions) => [...(sessions || [])].filter(isDone).sort(byDate);

// Peso corporal de una sesión: el propio, si no el de bodyweightFor, si no 0 (igual que model.js).
function bodyweightOf(session, opts = {}) {
  const own = session?.bodyweightKg;
  if (own !== null && own !== undefined) return num(own);
  return num(opts.bodyweightFor?.(session?.date));
}

function utcDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);

// Serie 1 del ejercicio en la sesión, solo si cuenta (hecha y con reps > 0).
function setOne(session, exerciseId) {
  const hit = sessionSets(session).find((x) => x.exerciseId === exerciseId && x.slot === 0);
  return hit && countable(hit.set) ? hit.set : null;
}

// ---------- Fuerza relativa ----------

export function bestRecentE1RM(sessions, exerciseId, opts = {}, todayISO, weeks = 8) {
  const today = utcDay(todayISO);
  if (!Number.isFinite(today)) return null;
  const cutoff = toISO(today - num(weeks) * WEEK_MS);
  const bands = opts.bandsById || {};
  let best = null;
  for (const s of doneSorted(sessions)) {
    if (!(s.date >= cutoff)) continue;
    const set = setOne(s, exerciseId);
    if (!set) continue;
    const bw = bodyweightOf(s, opts);
    if (!(bw > 0)) continue; // sin peso corporal no hay ratio
    const e1rm = epley1RM(totalLoad(set, bw, bands), num(set.reps));
    if (!best || e1rm >= best.e1rm) best = { e1rm, bw, date: s.date }; // empate: la más reciente
  }
  return best;
}

export function relativeStrength(sessions, exerciseId, opts = {}, todayISO) {
  const best = bestRecentE1RM(sessions, exerciseId, opts, todayISO);
  if (!best) return null;
  return { ratio: round2(best.e1rm / best.bw), e1rm: best.e1rm, bw: best.bw, date: best.date };
}

export function tierFor(ratio, exerciseId) {
  const th = TIERS[exerciseId] || [];
  const r = fin(ratio);
  if (r === null) return { name: 'Sin datos', index: -1, nextName: TIER_NAMES[0], nextRatio: th[0] ?? null };
  const index = th.filter((t) => t <= r).length;
  const name = index === 0 ? 'Base' : TIER_NAMES[index - 1];
  const hasNext = index < th.length;
  return { name, index, nextName: hasNext ? TIER_NAMES[index] : null, nextRatio: hasNext ? th[index] : null };
}

// Kg de lastre a sumar en la serie 1 (a las reps objetivo) para llegar al próximo nivel.
export function kgToNextTier(ratio, bw, exerciseId) {
  const { nextRatio } = tierFor(ratio, exerciseId);
  const w = fin(bw);
  if (nextRatio === null || nextRatio === undefined || w === null || w <= 0) return null;
  const reps = EXERCISES[exerciseId]?.targets?.[0] ?? 10;
  const total = (nextRatio * w) / (1 + reps / 30);
  return Math.round(Math.max(0, total - w) * 2) / 2;
}

// ---------- Tendencia ----------

export function slope(values) {
  const ys = (Array.isArray(values) ? values : []).map(fin).filter((v) => v !== null).slice(-6);
  const n = ys.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) * (x - mx);
  });
  return round2(sxy / sxx);
}

export function trendLabel(s) {
  const v = fin(s);
  if (v === null) return 'sin datos';
  if (v > 0.75) return 'creciendo';
  if (v < -0.75) return 'cayendo';
  return 'estable';
}

export function e1rmSeries(sessions, exerciseId, opts = {}) {
  const bands = opts.bandsById || {};
  const out = [];
  for (const s of doneSorted(sessions)) {
    const set = setOne(s, exerciseId);
    if (!set) continue;
    out.push({ date: s.date, value: epley1RM(totalLoad(set, bodyweightOf(s, opts), bands), num(set.reps)) });
  }
  return out;
}

// Sesiones seguidas sin mejorar la serie 1 (más total, o mismo total con más reps).
export function stagnation(sessions, exerciseId, opts = {}) {
  const bands = opts.bandsById || {};
  const rows = [];
  for (const s of doneSorted(sessions)) {
    const set = setOne(s, exerciseId);
    if (!set) continue;
    rows.push({ notes: s.notes, total: totalLoad(set, bodyweightOf(s, opts), bands), reps: num(set.reps) });
  }
  let best = null;
  let count = 0;
  for (const r of rows) {
    const improves = !best || r.total > best.total || (r.total === best.total && r.reps > best.reps);
    if (improves) {
      best = { total: r.total, reps: r.reps };
      count = 0;
    } else {
      count += 1;
    }
  }
  const stagnant = count >= 4;
  let suggestion = SUGGEST.ok;
  if (stagnant) {
    const sleepy = rows.slice(-3).some((r) => /dorm|sueñ/i.test(String(r.notes || '')));
    suggestion = sleepy ? SUGGEST.sleep : opts.incrementKg === 5 ? SUGGEST.increment : SUGGEST.deload;
  }
  return { count, stagnant, suggestion };
}

// ---------- Semanas ----------

// Lunes de la semana (el domingo pertenece a la semana que empezó el lunes anterior). Todo en UTC.
export function weekStart(iso) {
  const ms = utcDay(iso);
  if (!Number.isFinite(ms)) return null;
  const dow = new Date(ms).getUTCDay(); // 0 = domingo
  return toISO(ms - ((dow + 6) % 7) * DAY_MS);
}

// Claves (lunes ISO) de las últimas n semanas, la última es la semana de hoy.
function weekKeys(todayISO, n) {
  const cur = weekStart(todayISO);
  if (!cur) return null;
  const base = utcDay(cur);
  return Array.from({ length: n }, (_, i) => toISO(base - (n - 1 - i) * WEEK_MS));
}

function bucketByWeek(sessions, todayISO, n, valueOf) {
  const size = Math.max(0, Math.floor(num(n)));
  const keys = weekKeys(todayISO, size);
  const out = Array.from({ length: size }, () => 0);
  if (!keys) return out;
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const s of (sessions || []).filter(isDone)) {
    const i = index.get(weekStart(s.date));
    if (i !== undefined) out[i] += valueOf(s);
  }
  return out;
}

// Cantidad de semanas desde la de la primera sesión hecha hasta la actual (mínimo 1).
function historyWeeks(sessions, todayISO) {
  const cur = weekStart(todayISO);
  const first = weekStart(doneSorted(sessions)[0]?.date);
  if (!cur || !first) return 1;
  return Math.max(1, Math.round((utcDay(cur) - utcDay(first)) / WEEK_MS) + 1);
}

export function weeklyCounts(sessions, todayISO, n = 8) {
  return bucketByWeek(sessions, todayISO, n, () => 1);
}

export function consistency(sessions, todayISO) {
  const counts = weeklyCounts(sessions, todayISO, 8);
  const fulfilled = counts.filter((c) => c >= 2).length;
  // La racha mira todo el historial, no solo las 8 semanas del puntaje.
  const all = weeklyCounts(sessions, todayISO, Math.max(8, historyWeeks(sessions, todayISO)));
  let streak = 0;
  for (let i = all.length - 2; i >= 0 && all[i] >= 2; i--) streak += 1;
  if (all[all.length - 1] >= 2) streak += 1; // la semana actual suma solo si ya se cumplió
  return { counts, fulfilled, streak, score: Math.round((fulfilled / 8) * 100) };
}

// ---------- Volumen ----------

export function sessionTonnage(session, opts = {}) {
  if (!session) return 0;
  const bw = bodyweightOf(session, opts);
  const bands = opts.bandsById || {};
  let sum = 0;
  for (const { set } of sessionSets(session)) {
    if (!countable(set)) continue;
    sum += totalLoad(set, bw, bands) * num(set.reps);
  }
  return sum;
}

export function weeklyTonnage(sessions, todayISO, n = 8, opts = {}) {
  return bucketByWeek(sessions, todayISO, n, (s) => sessionTonnage(s, opts));
}

// Últimas 4 semanas contra la mejor ventana de 4 semanas de todo el historial.
export function volumeScore(sessions, todayISO, opts = {}) {
  if (!doneSorted(sessions).length || !weekStart(todayISO)) return null;
  const tons = weeklyTonnage(sessions, todayISO, Math.max(4, historyWeeks(sessions, todayISO)), opts);
  const sum4 = (i) => tons[i] + tons[i + 1] + tons[i + 2] + tons[i + 3];
  let max = 0;
  for (let i = 0; i + 4 <= tons.length; i++) max = Math.max(max, sum4(i));
  if (max <= 0) return 0;
  return Math.round(clamp100((100 * sum4(tons.length - 4)) / max));
}

// ---------- Atributos (0..100 o null) ----------

const linear = (v, lo, hi) => (v === null ? null : Math.round(clamp100(((v - lo) / (hi - lo)) * 100)));

// Reps a peso corporal: estimadas desde el ratio (30·(ratio−1)) o las reales, la mayor de las dos.
function bwRepsScore(ratio, realReps, denom) {
  const est = ratio === null ? null : 30 * (ratio - 1);
  const reps = Math.max(est ?? -Infinity, realReps ?? -Infinity);
  if (!Number.isFinite(reps)) return null;
  return clamp100((reps / denom) * 100);
}

export function attributes(input = {}) {
  const i = input || {};
  const pull = fin(i.pullRatio);
  const dip = fin(i.dipRatio);

  const baseParts = [bwRepsScore(pull, fin(i.pullBwReps), 20), bwRepsScore(dip, fin(i.dipBwReps), 30)].filter((v) => v !== null);
  const base = baseParts.length ? Math.round(baseParts.reduce((a, b) => a + b, 0) / baseParts.length) : null;

  const passthrough = (v) => (fin(v) === null ? null : Math.round(clamp100(fin(v))));

  const cw = fin(i.currentWeight);
  const tw = fin(i.targetWeight);
  const sw = fin(i.startWeight);
  const d30 = fin(i.weightDelta30);
  let weightScore = null;
  if (cw !== null && tw !== null && sw !== null && sw !== tw) {
    weightScore = clamp100(100 * (1 - Math.abs(cw - tw) / Math.abs(sw - tw)));
  } else if (d30 !== null) {
    const dir = i.goalDirection;
    weightScore = clamp100(dir === 'bajar' ? 50 - d30 * 25 : dir === 'subir' ? 50 + d30 * 25 : 100 - Math.abs(d30) * 25);
  }

  const cf = fin(i.currentFat);
  const tf = fin(i.targetFat);
  const sf = fin(i.startFat);
  let fatScore = null;
  if (cf !== null && tf !== null) {
    const denom = Math.max(1, Math.abs((sf === null ? cf : sf) - tf));
    fatScore = clamp100(100 * (1 - Math.abs(cf - tf) / denom));
  }

  let cuerpo = null;
  if (weightScore !== null && fatScore !== null) cuerpo = Math.round((weightScore + fatScore) / 2);
  else if (weightScore !== null) cuerpo = Math.round(weightScore);
  else if (fatScore !== null) cuerpo = Math.round(fatScore);

  return {
    tiron: linear(pull, 0.8, 2.2),
    empuje: linear(dip, 0.9, 2.5),
    base,
    constancia: passthrough(i.consistencyScore),
    volumen: passthrough(i.volumeScore),
    cuerpo,
  };
}

// ---------- XP y niveles ----------

export function xpForLevel(n) {
  const lv = num(n);
  if (lv <= 1) return 0;
  return Math.round(400 * Math.pow(lv - 1, 1.4));
}

export function levelFor(xp) {
  const x = Math.max(0, num(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= x) level += 1;
  const nextLevelXp = xpForLevel(level + 1);
  return { level, xpToNext: nextLevelXp - x, nextLevelXp };
}

export function titleFor(level) {
  const lv = num(level);
  let name = TITLES[0].name;
  for (const t of TITLES) if (lv >= t.min) name = t.name;
  return name;
}

// 100 por sesión hecha, hasta 150 por PRs de la sesión (50 c/u), 200 por semana con 2+ sesiones.
export function xpTotal(sessions, opts = {}) {
  const done = doneSorted(sessions);
  let sessionsXp = 0;
  let prXp = 0;
  const previous = [];
  for (const s of done) {
    const news = detectNewPRs(computePRs(previous, opts), s, opts);
    sessionsXp += 100;
    prXp += Math.min(150, 50 * news.length);
    previous.push(s);
  }
  const perWeek = new Map();
  for (const s of done) {
    const k = weekStart(s.date);
    if (k) perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  let fulfilledWeeks = 0;
  for (const c of perWeek.values()) if (c >= 2) fulfilledWeeks += 1;
  const weeksXp = 200 * fulfilledWeeks;
  return { xp: sessionsXp + prXp + weeksXp, sessionsXp, prXp, weeksXp };
}

// ---------- Hoja de personaje (solo lo que sale de las sesiones) ----------

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function characterSheetStats({ sessions = [], opts = {}, todayISO, incrementKg } = {}) {
  const today = todayISO || localToday();
  const xp = xpTotal(sessions, opts);
  const lv = levelFor(xp.xp);
  const level = { ...lv, title: titleFor(lv.level) };
  const stagnationOpts = { ...opts, incrementKg: incrementKg ?? opts.incrementKg };
  const strength = {};
  for (const ex of ['pullups', 'dips']) {
    const rel = relativeStrength(sessions, ex, opts, today);
    const ratio = rel?.ratio ?? null;
    const bw = rel?.bw ?? null;
    const sl = slope(e1rmSeries(sessions, ex, opts).map((p) => p.value));
    strength[ex] = {
      ratio,
      e1rm: rel?.e1rm ?? null,
      bw,
      tier: tierFor(ratio, ex),
      kgToNext: rel ? kgToNextTier(ratio, bw, ex) : null,
      slope: sl,
      trend: trendLabel(sl),
      stagnation: stagnation(sessions, ex, stagnationOpts),
    };
  }
  return {
    xp,
    level,
    strength,
    consistency: consistency(sessions, today),
    volumeScore: volumeScore(sessions, today, opts),
  };
}
