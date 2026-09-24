import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterSheet } from '../js/sheet.js';
import { slope, e1rmSeries, levelFor } from '../js/stats.js';

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
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const TODAY = '2026-09-24';
const goal = { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null };
const profile = { sex: 'm', heightCm: 178, incrementKg: { dips: 5, pullups: 5, second: 2.5 }, goal };
const opts = { bandsById: {}, bodyweightFor: () => null };

function tenSessions() {
  const list = [];
  for (let i = 0; i < 5; i++) {
    const mon = addDays('2026-08-24', 7 * i);
    list.push(ses(mon, 'pull', [W(20 + 2.5 * i, 8), W(15, 12)], [BW(12), BW(12)]));
    list.push(ses(addDays(mon, 2), 'push', [W(30, 10), W(20, 15)], [BW(12), BW(12)]));
  }
  return list;
}

test('characterSheet: empty input returns nulls, level 1 and a usable shape', () => {
  const r = characterSheet({ sessions: [], bodyweightRows: [], measurements: [], profile, bandsById: {}, todayISO: TODAY });
  assert.deepEqual(r.xp, { xp: 0, sessionsXp: 0, prXp: 0, weeksXp: 0 });
  assert.deepEqual(r.level, { level: 1, xpToNext: 400, nextLevelXp: 400, title: 'Tiro' });
  for (const ex of ['pullups', 'dips']) {
    const s = r.strength[ex];
    assert.equal(s.ratio, null);
    assert.equal(s.e1rm, null);
    assert.equal(s.bw, null);
    assert.equal(s.tier.name, 'Sin datos');
    assert.equal(s.kgToNext, null);
    assert.equal(s.slope, null);
    assert.equal(s.trend, 'sin datos');
    assert.equal(s.sessions, 0);
    assert.deepEqual(s.stagnation, { count: 0, stagnant: false, suggestion: 'Seguí así.' });
  }
  assert.equal(r.strength.pullups.targetReps, 8);
  assert.equal(r.strength.dips.targetReps, 10);
  assert.deepEqual(r.consistency, { counts: [0, 0, 0, 0, 0, 0, 0, 0], fulfilled: 0, streak: 0, score: 0 });
  assert.equal(r.volumeScore, null);
  assert.deepEqual(r.attributes, { tiron: null, empuje: null, base: null, constancia: 0, volumen: null, cuerpo: null });
  assert.equal(r.body.currentWeight, null);
  assert.equal(r.body.currentFat, null);
  assert.equal(r.body.leanMass, null);
  assert.equal(r.body.hasProfile, true);
  assert.equal(r.sessionsCount, 0);
});

test('characterSheet: coherent sheet from 10 sessions over 5 weeks', () => {
  const list = tenSessions();
  const r = characterSheet({ sessions: list, bodyweightRows: [], measurements: [], profile, bandsById: {}, todayISO: TODAY });
  const pu = r.strength.pullups;
  assert.equal(pu.bw, 80);
  assert.equal(pu.e1rm, 110 * (1 + 8 / 30));
  assert.equal(pu.ratio, 1.74);
  assert.equal(pu.tier.name, 'Intermedio');
  assert.equal(pu.tier.nextRatio, 1.75);
  assert.equal(pu.kgToNext, 30.5);
  assert.equal(pu.slope, slope(e1rmSeries(list, 'pullups', opts).map((p) => p.value)));
  assert.equal(pu.slope, 3.17);
  assert.equal(pu.trend, 'creciendo');
  assert.equal(pu.sessions, 5);
  assert.deepEqual(pu.stagnation, { count: 0, stagnant: false, suggestion: 'Seguí así.' });
  const di = r.strength.dips;
  assert.equal(di.ratio, 1.83);
  assert.equal(di.tier.name, 'Intermedio');
  assert.equal(di.slope, 0);
  assert.equal(di.trend, 'estable');
  assert.deepEqual(di.stagnation, { count: 4, stagnant: true, suggestion: 'Pasá a incrementos de 2,5 kg.' });
  assert.deepEqual(r.consistency.counts, [0, 0, 0, 2, 2, 2, 2, 2]);
  assert.equal(r.consistency.fulfilled, 5);
  assert.equal(r.consistency.streak, 5);
  assert.equal(r.consistency.score, 63);
  assert.equal(r.volumeScore, 100);
  assert.equal(r.xp.xp, 2900);
  assert.deepEqual(r.level, { ...levelFor(2900), title: 'Miles' });
  assert.equal(r.attributes.tiron, 67);
  assert.equal(r.attributes.empuje, 58);
  assert.equal(r.attributes.constancia, 63);
  assert.equal(r.attributes.volumen, 100);
  assert.equal(r.attributes.cuerpo, null); // sin filas de peso corporal no hay tendencia
  assert.equal(r.body.currentWeight, null);
  assert.equal(r.sessionsCount, 10);
});

test('characterSheet: per-exercise increment drives the stagnation suggestion', () => {
  const p = { ...profile, incrementKg: { dips: 2.5, pullups: 5, second: 2.5 } };
  const r = characterSheet({ sessions: tenSessions(), bodyweightRows: [], measurements: [], profile: p, bandsById: {}, todayISO: TODAY });
  assert.equal(r.strength.dips.stagnation.suggestion, 'Semana de descarga: 50% de la carga, después volvé a tu peso.');
});

test('characterSheet: sessions without any bodyweight give null strength but xp and consistency still count', () => {
  const list = tenSessions().map((s) => ({ ...s, bodyweightKg: null }));
  const r = characterSheet({ sessions: list, bodyweightRows: [], measurements: [], profile, bandsById: {}, todayISO: TODAY });
  for (const ex of ['pullups', 'dips']) {
    assert.equal(r.strength[ex].ratio, null);
    assert.equal(r.strength[ex].tier.name, 'Sin datos');
    assert.equal(r.strength[ex].kgToNext, null);
    assert.equal(r.strength[ex].sessions, 5);
  }
  assert.equal(r.attributes.tiron, null);
  assert.equal(r.attributes.empuje, null);
  assert.equal(r.attributes.base, null); // sin ratio ni series a peso corporal en dominadas o fondos
  assert.ok(r.xp.xp > 0);
  assert.equal(r.consistency.fulfilled, 5);
});

test('characterSheet: bodyweight rows without measurements give weight but no fat nor lean mass', () => {
  const rows = [{ id: 'a', date: '2026-08-20', kg: 82 }, { id: 'b', date: '2026-09-24', kg: 80 }, { id: 'c', date: '2026-09-23', kg: null }];
  const r = characterSheet({ sessions: [], bodyweightRows: rows, measurements: [], profile, bandsById: {}, todayISO: TODAY });
  assert.equal(r.body.currentWeight, 80);
  assert.deepEqual(r.body.weight, { now: 80, before: 82, delta: -2 });
  assert.equal(r.body.currentFat, null);
  assert.equal(r.body.leanMass, null);
  assert.equal(r.body.measurementsCount, 0);
  assert.equal(r.attributes.cuerpo, 50); // mantener: 100 − |−2|·25
});

test('characterSheet: female tape measurement with hip computes fat and lean mass', () => {
  const p = { ...profile, sex: 'f', heightCm: 165 };
  const rows = [{ id: 'a', date: '2026-09-24', kg: 60 }];
  const measurements = [{ id: 'm1', date: '2026-09-20', source: 'cinta', waistCm: 75, neckCm: 33, hipCm: 95, bodyFatPct: null }];
  const r = characterSheet({ sessions: [], bodyweightRows: rows, measurements, profile: p, bandsById: {}, todayISO: TODAY });
  assert.equal(r.body.currentFat, 26.9);
  assert.equal(r.body.leanMass, 43.9);
  assert.equal(r.body.measurementsCount, 1);
});

test('characterSheet: a target weight drives the Cuerpo attribute by distance to target', () => {
  const p = { ...profile, goal: { direction: 'bajar', targetWeightKg: 76, targetBodyFatPct: null, setAt: '2026-08-20', startWeightKg: 82 } };
  const rows = [{ id: 'a', date: '2026-08-20', kg: 82 }, { id: 'b', date: '2026-09-24', kg: 80 }];
  const r = characterSheet({ sessions: [], bodyweightRows: rows, measurements: [], profile: p, bandsById: {}, todayISO: TODAY });
  assert.equal(r.attributes.cuerpo, 33); // 100 × (1 − 4/6)
});
