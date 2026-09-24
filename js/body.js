// Cuerpo: grasa corporal, masa magra, promedios semanales y deltas de 30 días.
// Funciones puras, sin DOM ni base de datos. Fechas ISO 'YYYY-MM-DD' con aritmética UTC.

const DAY_MS = 86400000;

const round1 = (x) => Math.round(x * 10) / 10;
const isFiniteNumber = (x) => typeof x === 'number' && Number.isFinite(x);

// Milisegundos UTC del día ISO; NaN si el formato no es 'YYYY-MM-DD'.
function utcDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoOfUtc(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// Corre una fecha ISO n días (n puede ser negativo). null si la fecha o n no sirven.
export function addDays(iso, n) {
  const t = utcDay(iso);
  const k = Number(n);
  if (!Number.isFinite(t) || !Number.isFinite(k)) return null;
  return isoOfUtc(t + Math.trunc(k) * DAY_MS);
}

// ---------- Grasa corporal (Marina de EE. UU., centímetros, log10) ----------

export function navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm } = {}) {
  const h = heightCm, w = waistCm, n = neckCm, hip = hipCm;
  if (!isFiniteNumber(h) || h <= 0) return null;
  if (!isFiniteNumber(w) || !isFiniteNumber(n) || w <= n) return null;
  let bf;
  if (sex === 'm') {
    bf = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
  } else if (sex === 'f') {
    if (!isFiniteNumber(hip) || hip <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.22100 * Math.log10(h)) - 450;
  } else {
    return null;
  }
  if (!Number.isFinite(bf)) return null;
  return round1(Math.min(60, Math.max(2, bf)));
}

// Grasa de una medición: el valor cargado a mano si existe, si no la fórmula con los centímetros y el perfil.
export function bodyFatOf(row, profile) {
  if (!row) return null;
  if (isFiniteNumber(row.bodyFatPct)) return row.bodyFatPct;
  return navyBodyFat({
    sex: profile?.sex,
    heightCm: profile?.heightCm,
    waistCm: row.waistCm,
    neckCm: row.neckCm,
    hipCm: row.hipCm,
  });
}

export function leanMass(weightKg, bfPct) {
  if (!isFiniteNumber(weightKg) || !isFiniteNumber(bfPct)) return null;
  return round1(weightKg * (1 - bfPct / 100));
}

// ---------- Series por fecha, ventanas semanales y deltas ----------

// Convierte filas en puntos { t, value } con fecha válida y valor finito, ordenados por fecha ascendente.
function toPoints(rows, valueOf) {
  const pts = [];
  for (const r of rows || []) {
    const t = utcDay(r?.date);
    const value = valueOf(r);
    if (Number.isFinite(t) && isFiniteNumber(value)) pts.push({ t, value, date: r.date });
  }
  return pts.sort((a, b) => a.t - b.t);
}

function average(values) {
  if (!values.length) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

// Promedio de los puntos en los 7 días que terminan en endMs: t > endMs - 7 días y t <= endMs.
function windowAvg(points, endMs) {
  const start = endMs - 7 * DAY_MS;
  return average(points.filter((p) => p.t > start && p.t <= endMs).map((p) => p.value));
}

// Valor del último punto con afterMs < t <= untilMs; null si no hay.
function latestValueBetween(points, afterMs, untilMs) {
  let best = null;
  for (const p of points) {
    if (p.t > afterMs && p.t <= untilMs) best = p;
  }
  return best ? best.value : null;
}

// { now, before, delta }: promedio de la última semana contra el de la semana que termina 30 días atrás.
// Si la ventana vieja está vacía usa el último punto anterior a hoy - 30; si la actual está vacía usa el
// último punto posterior a hoy - 30. null si falta alguno de los dos (con un solo punto siempre es null).
function deltaOver30(points, todayISO) {
  const today = utcDay(todayISO);
  if (!Number.isFinite(today) || !points.length) return null;
  const oldEnd = today - 30 * DAY_MS;
  let now = windowAvg(points, today);
  if (now === null) now = latestValueBetween(points, oldEnd, today);
  let before = windowAvg(points, oldEnd);
  if (before === null) before = latestValueBetween(points, -Infinity, oldEnd);
  if (now === null || before === null) return null;
  now = round1(now);
  before = round1(before);
  return { now, before, delta: round1(now - before) };
}

const weightPoints = (rows) => toPoints(rows, (r) => r?.kg);

export function weeklyAvg(rows, endISO) {
  const end = utcDay(endISO);
  if (!Number.isFinite(end)) return null;
  return windowAvg(weightPoints(rows), end);
}

export function delta30(rows, todayISO) {
  return deltaOver30(weightPoints(rows), todayISO);
}

// [{ date, value }] de grasa por medición, ascendente por fecha, sin las que no tienen valor.
export function fatSeries(measurements, profile) {
  return toPoints(measurements, (r) => bodyFatOf(r, profile)).map((p) => ({ date: p.date, value: p.value }));
}

export function deltaFat30(measurements, profile, todayISO) {
  return deltaOver30(toPoints(fatSeries(measurements, profile), (p) => p.value), todayISO);
}

// Pedir una medición si nunca se cargó, si la fecha no sirve o si la última tiene más de 28 días.
export function needsMeasurementPrompt(latest, todayISO) {
  const last = utcDay(latest?.date);
  const today = utcDay(todayISO);
  if (!Number.isFinite(last) || !Number.isFinite(today)) return true;
  return (today - last) / DAY_MS > 28;
}
