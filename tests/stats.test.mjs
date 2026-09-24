import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePRs, detectNewPRs } from '../js/model.js';
import {
  TIER_NAMES, TIERS, TITLES,
  bestRecentE1RM, relativeStrength, tierFor, kgToNextTier,
  slope, trendLabel, e1rmSeries, stagnation,
  weekStart, weeklyCounts, consistency,
  sessionTonnage, weeklyTonnage, volumeScore,
  attributes, xpForLevel, levelFor, titleFor, xpTotal,
} from '../js/stats.js';

const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, done: true });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, done: true });
const ses = (date, day, main, second, extra = {}) => ({
  id: date, date, day, status: 'done', bodyweightKg: 80, notes: '',
  blocks: {
    main: { exerciseId: day === 'push' ? 'dips' : 'pullups', sets: main },
    second: { exerciseId: day === 'push' ? 'decline_pushups' : 'australian_rows', sets: second },
  },
  ...extra,
});
const opts = { bandsById: {}, bodyweightFor: () => null };
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const flat = (dates, notes = '') => dates.map((d) => ses(d, 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)], { notes }));
const DEload = 'Semana de descarga: 50% de la carga, después volvé a tu peso.';

// Calendario de referencia: 2026-09-24 es jueves, 09-27 domingo, 09-28 lunes.

test('constants', () => {
  assert.deepEqual(TIER_NAMES, ['Novato', 'Iniciado', 'Intermedio', 'Avanzado', 'Élite']);
  assert.deepEqual(TIERS.pullups, [1.00, 1.25, 1.50, 1.75, 2.00]);
  assert.deepEqual(TIERS.dips, [1.10, 1.40, 1.70, 2.00, 2.30]);
  assert.deepEqual(TITLES.map((t) => [t.min, t.name]), [[1, 'Tiro'], [5, 'Miles'], [10, 'Decurión'], [15, 'Centurión'], [20, 'Tribuno'], [30, 'Espartano']]);
});

test('bestRecentE1RM: best set-1 e1rm inside the window, skipping sessions without bodyweight', () => {
  const old = ses('2026-07-29', 'pull', [W(60, 8), W(50, 12)], [BW(12), BW(12)]);   // fuera de ventana (8 semanas = 56 días)
  const edge = ses('2026-07-30', 'pull', [W(10, 8), W(5, 12)], [BW(12), BW(12)]);   // justo en el corte, inclusive
  const a = ses('2026-08-15', 'pull', [W(20, 8), W(15, 12)], [BW(12), BW(12)]);
  const b = ses('2026-09-20', 'pull', [W(25, 8), W(20, 12)], [BW(12), BW(12)], { bodyweightKg: 82 });
  const noBw = ses('2026-09-22', 'pull', [W(60, 8), W(50, 12)], [BW(12), BW(12)], { bodyweightKg: null });
  const active = ses('2026-09-23', 'pull', [W(60, 8), W(50, 12)], [BW(12), BW(12)], { status: 'active' });
  const r = bestRecentE1RM([noBw, active, old, a, b, edge], 'pullups', opts, '2026-09-24');
  assert.equal(r.date, '2026-09-20');
  assert.equal(r.bw, 82);
  assert.equal(r.e1rm, 107 * (1 + 8 / 30));
  assert.equal(bestRecentE1RM([edge], 'pullups', opts, '2026-09-24').date, '2026-07-30');
  assert.equal(bestRecentE1RM([old], 'pullups', opts, '2026-09-24'), null);
  assert.equal(bestRecentE1RM([noBw], 'pullups', opts, '2026-09-24'), null);
  assert.equal(bestRecentE1RM([], 'pullups', opts, '2026-09-24'), null);
  assert.equal(bestRecentE1RM([b], 'dips', opts, '2026-09-24'), null);
  // bodyweightFor suple el peso cuando la sesión no lo tiene
  const viaFn = bestRecentE1RM([noBw], 'pullups', { bandsById: {}, bodyweightFor: () => 70 }, '2026-09-24');
  assert.equal(viaFn.bw, 70);
  assert.equal(viaFn.e1rm, 130 * (1 + 8 / 30));
  // parámetro weeks
  assert.equal(bestRecentE1RM([a], 'pullups', opts, '2026-09-24', 4), null);
  // empate: gana la más reciente
  const t1 = ses('2026-09-01', 'pull', [W(20, 8), W(15, 12)], [BW(12), BW(12)]);
  const t2 = ses('2026-09-10', 'pull', [W(20, 8), W(15, 12)], [BW(12), BW(12)]);
  assert.equal(bestRecentE1RM([t2, t1], 'pullups', opts, '2026-09-24').date, '2026-09-10');
});

test('relativeStrength: e1rm / bw with 2 decimals', () => {
  const b = ses('2026-09-20', 'pull', [W(25, 8), W(20, 12)], [BW(12), BW(12)], { bodyweightKg: 82 });
  const r = relativeStrength([b], 'pullups', opts, '2026-09-24');
  assert.equal(r.ratio, 1.65); // 135.53 / 82 = 1.6528
  assert.equal(r.e1rm, 107 * (1 + 8 / 30));
  assert.equal(r.bw, 82);
  assert.equal(r.date, '2026-09-20');
  assert.equal(relativeStrength([], 'pullups', opts, '2026-09-24'), null);
});

test('tierFor', () => {
  assert.deepEqual(tierFor(1.6, 'pullups'), { name: 'Intermedio', index: 3, nextName: 'Avanzado', nextRatio: 1.75 });
  assert.deepEqual(tierFor(0.9, 'pullups'), { name: 'Base', index: 0, nextName: 'Novato', nextRatio: 1 });
  assert.deepEqual(tierFor(2.4, 'dips'), { name: 'Élite', index: 5, nextName: null, nextRatio: null });
  assert.deepEqual(tierFor(1.0, 'pullups'), { name: 'Novato', index: 1, nextName: 'Iniciado', nextRatio: 1.25 }); // umbral inclusive
  assert.deepEqual(tierFor(2.0, 'pullups'), { name: 'Élite', index: 5, nextName: null, nextRatio: null });
  assert.deepEqual(tierFor(null, 'pullups'), { name: 'Sin datos', index: -1, nextName: 'Novato', nextRatio: 1 });
  assert.deepEqual(tierFor(null, 'dips'), { name: 'Sin datos', index: -1, nextName: 'Novato', nextRatio: 1.1 });
  assert.deepEqual(tierFor(undefined, 'dips'), tierFor(null, 'dips'));
});

test('kgToNextTier', () => {
  assert.equal(kgToNextTier(1.6, 80, 'pullups'), 30.5); // 1.75*80/(1+8/30) = 110.53 → +30.53 → 30.5
  assert.equal(kgToNextTier(1.5, 80, 'dips'), 22);      // 1.7*80/(1+10/30) = 102 → +22
  assert.equal(kgToNextTier(null, 80, 'pullups'), 0);   // apunta a Novato (1.0): con el peso corporal ya sobra
  assert.equal(kgToNextTier(2.4, 80, 'dips'), null);    // ya Élite
  assert.equal(kgToNextTier(1.6, 0, 'pullups'), null);
  assert.equal(kgToNextTier(1.6, null, 'pullups'), null);
  assert.equal(kgToNextTier(1.6, NaN, 'pullups'), null);
});

test('slope: least squares over the last 6 values, 2 decimals', () => {
  assert.equal(slope([100, 102, 104]), 2);
  assert.equal(slope([5]), null);
  assert.equal(slope([1, 2]), null);
  assert.equal(slope([]), null);
  assert.equal(slope(null), null);
  assert.equal(slope([0, 0, 0, 0, 100, 102, 104, 106, 108, 110]), 2); // solo las últimas 6
  assert.equal(slope([3, 3, 3, 3]), 0);
  assert.equal(slope([10, 8, 6]), -2);
  assert.equal(slope([0, 1, 1]), 0.5);
  assert.equal(slope([1, null, 2, NaN, 3]), 1); // no finitos se ignoran
  assert.equal(slope([1, null, 2]), null);
});

test('trendLabel boundaries', () => {
  assert.equal(trendLabel(null), 'sin datos');
  assert.equal(trendLabel(undefined), 'sin datos');
  assert.equal(trendLabel(0.76), 'creciendo');
  assert.equal(trendLabel(0.75), 'estable');
  assert.equal(trendLabel(0), 'estable');
  assert.equal(trendLabel(-0.75), 'estable');
  assert.equal(trendLabel(-0.76), 'cayendo');
});

test('e1rmSeries: ascending set-1 e1rm; unknown bodyweight counts as 0', () => {
  const a = ses('2026-09-01', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]);
  const b = ses('2026-09-04', 'push', [W(25, 10), W(15, 15)], [BW(12), BW(12)], { bodyweightKg: null });
  const c = ses('2026-09-08', 'push', [W(30, 0), W(15, 15)], [BW(12), BW(12)]); // serie 1 no cuenta
  const d = ses('2026-09-10', 'pull', [W(30, 8), W(15, 12)], [BW(12), BW(12)]);
  const s = e1rmSeries([c, b, a, d], 'dips', opts);
  assert.deepEqual(s.map((p) => p.date), ['2026-09-01', '2026-09-04']);
  assert.deepEqual(s.map((p) => p.value), [100 * (1 + 10 / 30), 25 * (1 + 10 / 30)]);
  assert.deepEqual(e1rmSeries([], 'dips', opts), []);
});

test('stagnation counts consecutive non-improving sessions', () => {
  const five = flat(['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09']);
  const r = stagnation(five, 'dips', opts);
  assert.equal(r.count, 4);
  assert.equal(r.stagnant, true);
  const three = flat(['2026-09-01', '2026-09-03', '2026-09-05']);
  assert.deepEqual(stagnation(three, 'dips', opts), { count: 2, stagnant: false, suggestion: 'Seguí así.' });
  const better = [...five, ses('2026-09-11', 'push', [W(20, 11), W(15, 15)], [BW(12), BW(12)])];
  assert.deepEqual(stagnation(better, 'dips', opts), { count: 0, stagnant: false, suggestion: 'Seguí así.' });
  // más carga con menos reps mejora (manda el total); mismo total con menos reps no
  const heavier = [...five, ses('2026-09-11', 'push', [W(22.5, 6), W(15, 15)], [BW(12), BW(12)])];
  assert.equal(stagnation(heavier, 'dips', opts).count, 0);
  const fewer = [...five, ses('2026-09-11', 'push', [W(20, 8), W(15, 15)], [BW(12), BW(12)])];
  assert.equal(stagnation(fewer, 'dips', opts).count, 5);
  assert.deepEqual(stagnation([], 'dips', opts), { count: 0, stagnant: false, suggestion: 'Seguí así.' });
  assert.equal(stagnation(five, 'pullups', opts).count, 0);
  assert.equal(stagnation([...five].reverse(), 'dips', opts).count, 4); // ordena por fecha
  const withActive = [...five, { ...five[4], id: 'x', date: '2026-09-11', status: 'active' }];
  assert.equal(stagnation(withActive, 'dips', opts).count, 4);
});

test('stagnation suggestions', () => {
  const dates = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09'];
  assert.equal(stagnation(flat(dates), 'dips', opts).suggestion, DEload);
  assert.equal(stagnation(flat(dates), 'dips', { ...opts, incrementKg: 5 }).suggestion, 'Pasá a incrementos de 2,5 kg.');
  assert.equal(stagnation(flat(dates), 'dips', { ...opts, incrementKg: 2.5 }).suggestion, DEload);
  const sleepy = flat(dates);
  sleepy[4] = { ...sleepy[4], notes: 'Dormí mal, dolor de hombro' };
  assert.equal(stagnation(sleepy, 'dips', { ...opts, incrementKg: 5 }).suggestion, 'Revisá el sueño: tus notas lo mencionan.');
  const sueno = flat(dates);
  sueno[2] = { ...sueno[2], notes: 'poco SUEÑO' };
  assert.equal(stagnation(sueno, 'dips', opts).suggestion, 'Revisá el sueño: tus notas lo mencionan.');
  // una nota vieja (fuera de las últimas 3 sesiones) no cuenta
  const oldNote = flat(dates);
  oldNote[1] = { ...oldNote[1], notes: 'dormí mal' };
  assert.equal(stagnation(oldNote, 'dips', opts).suggestion, DEload);
  // sin estancamiento, la nota de sueño no cambia el mensaje
  assert.equal(stagnation(flat(dates.slice(0, 3), 'dormí mal'), 'dips', opts).suggestion, 'Seguí así.');
});

test('weekStart returns the Monday; Sunday belongs to the previous Monday', () => {
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // domingo
  assert.equal(weekStart('2026-09-28'), '2026-09-28'); // lunes
  assert.equal(weekStart('2026-09-30'), '2026-09-28'); // miércoles
  assert.equal(weekStart('2026-09-21'), '2026-09-21');
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // jueves, cruza el año
  assert.equal(weekStart('nope'), null);
  assert.equal(weekStart(null), null);
});

test('weeklyCounts buckets by weekStart, oldest first, last is the current week', () => {
  const sun = ses('2026-09-27', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]);
  const mon = ses('2026-09-28', 'pull', [W(20, 8), W(15, 12)], [BW(12), BW(12)]);
  const c = weeklyCounts([sun, mon], '2026-09-30', 8);
  assert.equal(c.length, 8);
  assert.deepEqual(c, [0, 0, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(weeklyCounts([sun, mon], '2026-09-27', 4), [0, 0, 0, 1]); // el lunes 28 queda fuera de la ventana
  const c3 = weeklyCounts([sun, mon, { ...mon, id: 'x', status: 'active' }], '2026-10-05', 3);
  assert.deepEqual(c3, [1, 1, 0]);
  assert.deepEqual(weeklyCounts([], '2026-09-30'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(weeklyCounts([sun], 'nope', 3), [0, 0, 0]);
});

test('consistency: fulfilled weeks, streak, score', () => {
  const S = (d) => ses(d, 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]);
  const today = '2026-09-24'; // jueves; la semana actual empieza el 09-21
  const two = [S('2026-09-07'), S('2026-09-09'), S('2026-09-14'), S('2026-09-16'), S('2026-09-21')];
  const r = consistency(two, today);
  assert.deepEqual(r.counts, [0, 0, 0, 0, 0, 2, 2, 1]);
  assert.equal(r.fulfilled, 2);
  assert.equal(r.streak, 2); // la semana actual todavía no cumplida: ni suma ni corta
  assert.equal(r.score, 25);
  const r2 = consistency([...two, S('2026-09-23')], today);
  assert.deepEqual(r2.counts, [0, 0, 0, 0, 0, 2, 2, 2]);
  assert.equal(r2.fulfilled, 3);
  assert.equal(r2.streak, 3);
  assert.equal(r2.score, 38); // round(37.5)
  const gap = [S('2026-08-31'), S('2026-09-02'), S('2026-09-14'), S('2026-09-16')];
  const r3 = consistency(gap, today);
  assert.deepEqual(r3.counts, [0, 0, 0, 0, 2, 0, 2, 0]);
  assert.equal(r3.fulfilled, 2);
  assert.equal(r3.streak, 1);
  assert.equal(r3.score, 25);
  // semana anterior fallida y actual cumplida: la racha es solo la actual
  const r4 = consistency([S('2026-09-07'), S('2026-09-09'), S('2026-09-21'), S('2026-09-23')], today);
  assert.equal(r4.streak, 1);
  assert.deepEqual(consistency([], today), { counts: [0, 0, 0, 0, 0, 0, 0, 0], fulfilled: 0, streak: 0, score: 0 });
});

test('consistency: the streak is not capped by the 8-week window', () => {
  const S = (d) => ses(d, 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]);
  const list = [];
  for (let i = 1; i <= 10; i++) list.push(S(addDays('2026-09-21', -7 * i)), S(addDays('2026-09-21', -7 * i + 2)));
  const r = consistency(list, '2026-09-24');
  assert.equal(r.fulfilled, 7); // 7 semanas previas dentro de la ventana; la actual vacía
  assert.equal(r.streak, 10);
  assert.equal(r.score, 88);    // round(87.5)
});

test('sessionTonnage sums total load × reps over main and second countable sets', () => {
  const s = ses('2026-09-01', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]);
  assert.equal(sessionTonnage(s, opts), 4345); // 100*10 + 95*15 + 80*12 + 80*12
  const noBw = { ...s, bodyweightKg: null };
  assert.equal(sessionTonnage(noBw, { bandsById: {}, bodyweightFor: () => 80 }), 4345);
  assert.equal(sessionTonnage(noBw, opts), 20 * 10 + 15 * 15); // peso desconocido → 0
  const partial = ses('2026-09-01', 'push', [W(20, 10), { ...W(15, 15), done: false }], [BW(0), BW(12)]);
  assert.equal(sessionTonnage(partial, opts), 1000 + 960);
  assert.equal(sessionTonnage(null, opts), 0);
});

test('weeklyTonnage oldest-first', () => {
  const a = ses('2026-09-14', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]); // 4345
  const b = ses('2026-09-16', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]); // 4345
  const c = ses('2026-09-22', 'pull', [W(20, 8), W(15, 12)], [BW(12), BW(12)]);  // 800 + 1140 + 960 + 960 = 3860
  assert.deepEqual(weeklyTonnage([c, a, b], '2026-09-24', 3, opts), [0, 8690, 3860]);
  assert.deepEqual(weeklyTonnage([], '2026-09-24', 2, opts), [0, 0]);
});

test('volumeScore compares the last 4 weeks with the best 4-week window of the history', () => {
  const S = (d, kg) => ses(d, 'push', [W(kg, 10), W(kg, 10)], [BW(0), BW(0)]); // tonelaje = 2 * (80+kg) * 10
  const today = '2026-09-24';
  const cur = [S('2026-09-01', 20), S('2026-09-08', 20), S('2026-09-15', 20), S('2026-09-22', 20)]; // semanas 08-31..09-21, 2000 c/u
  assert.equal(volumeScore(cur, today, opts), 100);
  const old = [S('2026-08-04', 120), S('2026-08-11', 120), S('2026-08-18', 120), S('2026-08-25', 120)]; // semanas 08-03..08-24, 4000 c/u
  assert.equal(volumeScore([...old, ...cur], today, opts), 50);
  assert.equal(volumeScore([], today, opts), null);
  assert.equal(volumeScore([{ ...cur[0], status: 'active' }], today, opts), null);
  assert.equal(volumeScore([cur[3]], today, opts), 100); // menos de 4 semanas de historia
  assert.equal(volumeScore(old, today, opts), 0);        // todo el volumen quedó atrás
});

test('attributes: strength maps', () => {
  const a = attributes({ pullRatio: 1.5, dipRatio: 1.7 });
  assert.equal(a.tiron, 50);
  assert.equal(a.empuje, 50);
  assert.equal(a.base, 73); // dominadas 15 reps → 75, fondos 21 reps → 70; media 72.5 → Math.round → 73
  assert.equal(a.constancia, null);
  assert.equal(a.volumen, null);
  assert.equal(a.cuerpo, null);
  assert.equal(attributes({ pullRatio: 0.8 }).tiron, 0);
  assert.equal(attributes({ pullRatio: 2.2 }).tiron, 100);
  assert.equal(attributes({ pullRatio: 3 }).tiron, 100);
  assert.equal(attributes({ pullRatio: 0.5 }).tiron, 0);
  assert.equal(attributes({ dipRatio: 0.9 }).empuje, 0);
  assert.equal(attributes({ dipRatio: 2.5 }).empuje, 100);
  assert.equal(attributes({ dipRatio: 1.3 }).empuje, 25);
  assert.equal(attributes({ pullRatio: 1.5 }).empuje, null);
});

test('attributes: base prefers real bodyweight reps when larger', () => {
  assert.equal(attributes({ pullRatio: 1.5, pullBwReps: 18 }).base, 90);
  assert.equal(attributes({ pullRatio: 1.5, pullBwReps: 10 }).base, 75);
  assert.equal(attributes({ pullBwReps: 10 }).base, 50);
  assert.equal(attributes({ dipBwReps: 15 }).base, 50);
  assert.equal(attributes({ pullBwReps: 25, dipBwReps: 40 }).base, 100);
  assert.equal(attributes({ pullRatio: 0.8 }).base, 0); // estimación negativa → 0
  assert.equal(attributes({ pullRatio: 1.5, dipRatio: 1.7, dipBwReps: 30 }).base, 88); // 75 y 100 → 87.5 → 88
  assert.equal(attributes({}).base, null);
});

test('attributes: constancia and volumen pass through', () => {
  const a = attributes({ consistencyScore: 25, volumeScore: 80 });
  assert.equal(a.constancia, 25);
  assert.equal(a.volumen, 80);
  assert.equal(attributes({ consistencyScore: null }).constancia, null);
  assert.equal(attributes({ volumeScore: undefined }).volumen, null);
  assert.equal(attributes({ consistencyScore: 0 }).constancia, 0);
});

test('attributes: cuerpo from progress toward the target weight', () => {
  assert.equal(attributes({ currentWeight: 85, targetWeight: 80, startWeight: 90 }).cuerpo, 50);
  assert.equal(attributes({ currentWeight: 80, targetWeight: 80, startWeight: 90 }).cuerpo, 100);
  assert.equal(attributes({ currentWeight: 95, targetWeight: 80, startWeight: 90 }).cuerpo, 0);
  assert.equal(attributes({ currentWeight: 82, targetWeight: 80, startWeight: 70 }).cuerpo, 80);
  // start === target: cae al delta de 30 días
  assert.equal(attributes({ currentWeight: 82, targetWeight: 80, startWeight: 80, weightDelta30: 0, goalDirection: 'mantener' }).cuerpo, 100);
  assert.equal(attributes({ currentWeight: 82, targetWeight: 80, startWeight: 80 }).cuerpo, null);
  assert.equal(attributes({ currentWeight: 82, targetWeight: 80 }).cuerpo, null);
});

test('attributes: cuerpo from the 30-day delta by goal', () => {
  assert.equal(attributes({ weightDelta30: 0, goalDirection: 'mantener' }).cuerpo, 100);
  assert.equal(attributes({ weightDelta30: 2, goalDirection: 'mantener' }).cuerpo, 50);
  assert.equal(attributes({ weightDelta30: -1, goalDirection: 'mantener' }).cuerpo, 75);
  assert.equal(attributes({ weightDelta30: 5, goalDirection: 'mantener' }).cuerpo, 0);
  assert.equal(attributes({ weightDelta30: -2, goalDirection: 'bajar' }).cuerpo, 100);
  assert.equal(attributes({ weightDelta30: 0, goalDirection: 'bajar' }).cuerpo, 50);
  assert.equal(attributes({ weightDelta30: 1, goalDirection: 'bajar' }).cuerpo, 25);
  assert.equal(attributes({ weightDelta30: 2, goalDirection: 'bajar' }).cuerpo, 0);
  assert.equal(attributes({ weightDelta30: 2, goalDirection: 'subir' }).cuerpo, 100);
  assert.equal(attributes({ weightDelta30: 1, goalDirection: 'subir' }).cuerpo, 75);
  assert.equal(attributes({ weightDelta30: -2, goalDirection: 'subir' }).cuerpo, 0);
  assert.equal(attributes({ weightDelta30: 1 }).cuerpo, 75); // objetivo desconocido → mantener
  assert.equal(attributes({ goalDirection: 'bajar' }).cuerpo, null);
});

test('attributes: cuerpo blends body fat when available', () => {
  // peso 50 (85→80 desde 90) y grasa 50 (20→15 desde 25) → 50
  assert.equal(attributes({ currentWeight: 85, targetWeight: 80, startWeight: 90, currentFat: 20, targetFat: 15, startFat: 25 }).cuerpo, 50);
  // peso 100 y grasa 50 → 75
  assert.equal(attributes({ currentWeight: 80, targetWeight: 80, startWeight: 90, currentFat: 20, targetFat: 15, startFat: 25 }).cuerpo, 75);
  // solo grasa
  assert.equal(attributes({ currentFat: 20, targetFat: 15, startFat: 25 }).cuerpo, 50);
  assert.equal(attributes({ currentFat: 15, targetFat: 15, startFat: 25 }).cuerpo, 100);
  assert.equal(attributes({ currentFat: 30, targetFat: 15, startFat: 25 }).cuerpo, 0); // se alejó: 0
  // sin startFat: denominador max(1, |actual - objetivo|)
  assert.equal(attributes({ currentFat: 20, targetFat: 15 }).cuerpo, 0);
  assert.equal(attributes({ currentFat: 15, targetFat: 15 }).cuerpo, 100);
  assert.equal(attributes({ currentFat: 15.5, targetFat: 15 }).cuerpo, 50);
  // delta de peso 75 con grasa 50 → round(62.5) = 63
  assert.equal(attributes({ weightDelta30: -1, goalDirection: 'mantener', currentFat: 20, targetFat: 15, startFat: 25 }).cuerpo, 63);
  assert.equal(attributes({ currentFat: 20 }).cuerpo, null);
});

test('attributes: everything null when nothing is known', () => {
  const nul = { tiron: null, empuje: null, base: null, constancia: null, volumen: null, cuerpo: null };
  assert.deepEqual(attributes({}), nul);
  assert.deepEqual(attributes(), nul);
  assert.deepEqual(attributes({ pullRatio: null, dipRatio: undefined, pullBwReps: null, currentWeight: NaN }), nul);
});

test('xpForLevel / levelFor / titleFor', () => {
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 400);
  assert.equal(xpForLevel(3), 1056); // round(400 * 2^1.4)
  assert.deepEqual(levelFor(0), { level: 1, xpToNext: 400, nextLevelXp: 400 });
  assert.deepEqual(levelFor(399), { level: 1, xpToNext: 1, nextLevelXp: 400 });
  assert.deepEqual(levelFor(400), { level: 2, xpToNext: 656, nextLevelXp: 1056 });
  assert.equal(levelFor(1055).level, 2);
  assert.equal(levelFor(1056).level, 3);
  assert.equal(levelFor(-5).level, 1);
  assert.equal(titleFor(1), 'Tiro');
  assert.equal(titleFor(4), 'Tiro');
  assert.equal(titleFor(5), 'Miles');
  assert.equal(titleFor(9), 'Miles');
  assert.equal(titleFor(10), 'Decurión');
  assert.equal(titleFor(12), 'Decurión');
  assert.equal(titleFor(14), 'Decurión');
  assert.equal(titleFor(15), 'Centurión');
  assert.equal(titleFor(19), 'Centurión');
  assert.equal(titleFor(20), 'Tribuno');
  assert.equal(titleFor(29), 'Tribuno');
  assert.equal(titleFor(30), 'Espartano');
  assert.equal(titleFor(99), 'Espartano');
});

test('xpTotal: 100 per session, PRs capped at 150 per session, 200 per fulfilled week', () => {
  const A = ses('2026-09-21', 'push', [W(20, 10), W(15, 15)], [BW(12), BW(12)]); // lunes
  const B = ses('2026-09-23', 'push', [W(20, 11), W(15, 15)], [BW(12), BW(12)]); // miércoles, serie 1 con una rep más
  const newsA = detectNewPRs({}, A, opts).length;                    // primera sesión: 4 series × 3 métricas = 12 PRs
  const newsB = detectNewPRs(computePRs([A], opts), B, opts).length; // solo maxE1RM de fondos serie 1
  assert.equal(newsA, 12);
  assert.equal(newsB, 1);
  const expectedPr = Math.min(150, 50 * newsA) + Math.min(150, 50 * newsB); // 150 + 50
  assert.equal(expectedPr, 200);
  const r = xpTotal([B, A], opts); // desordenado a propósito
  assert.deepEqual(r, { xp: 200 + expectedPr + 200, sessionsXp: 200, prXp: expectedPr, weeksXp: 200 });
  assert.equal(r.xp, 600);
  // una sesión activa no suma nada, y la semana deja de cumplirse
  assert.deepEqual(xpTotal([A, { ...B, status: 'active' }], opts), { xp: 250, sessionsXp: 100, prXp: 150, weeksXp: 0 });
  assert.deepEqual(xpTotal([], opts), { xp: 0, sessionsXp: 0, prXp: 0, weeksXp: 0 });
});
