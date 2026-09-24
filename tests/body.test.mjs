import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  navyBodyFat,
  bodyFatOf,
  leanMass,
  weeklyAvg,
  delta30,
  fatSeries,
  deltaFat30,
  needsMeasurementPrompt,
} from '../js/body.js';

const near = (actual, expected, tol, msg) => {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol,
    msg || `expected ${actual} to be within ${tol} of ${expected}`);
};
const oneDecimal = (v) => assert.equal(v, Math.round(v * 10) / 10, `${v} is not rounded to 1 decimal`);

const TODAY = '2026-09-24';   // today - 30 = 2026-08-25; old window = 08-19..08-25; now window = 09-18..09-24
const PROFILE_M = { sex: 'm', heightCm: 178 };
const PROFILE_F = { sex: 'f', heightCm: 165 };

// ---------- addDays ----------

test('addDays crosses month and year boundaries, in both directions', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-09-24', -30), '2026-08-25');
  assert.equal(addDays('2026-09-24', 0), '2026-09-24');
  assert.equal(addDays('2026-02-28', 366), '2027-03-01');
});

test('addDays returns null on invalid input', () => {
  assert.equal(addDays('nope', 1), null);
  assert.equal(addDays(null, 1), null);
  assert.equal(addDays('2026-09-24', NaN), null);
});

// ---------- navyBodyFat ----------

test('navyBodyFat known values for men and women', () => {
  const m = navyBodyFat({ sex: 'm', heightCm: 178, waistCm: 85, neckCm: 38 });
  near(m, 16.4, 0.1);
  oneDecimal(m);
  const f = navyBodyFat({ sex: 'f', heightCm: 165, waistCm: 75, neckCm: 33, hipCm: 95 });
  near(f, 26.9, 0.1);
  oneDecimal(f);
});

test('navyBodyFat ignores hip for men', () => {
  const noHip = navyBodyFat({ sex: 'm', heightCm: 178, waistCm: 85, neckCm: 38 });
  const withHip = navyBodyFat({ sex: 'm', heightCm: 178, waistCm: 85, neckCm: 38, hipCm: 95 });
  assert.equal(noHip, withHip);
});

test('navyBodyFat returns null (never NaN) on missing or invalid inputs', () => {
  const cases = [
    { sex: 'm', heightCm: 178, waistCm: 38, neckCm: 38 },        // waist == neck
    { sex: 'm', heightCm: 178, waistCm: 30, neckCm: 38 },        // waist < neck
    { sex: 'm', heightCm: null, waistCm: 85, neckCm: 38 },       // no height
    { sex: 'm', waistCm: 85, neckCm: 38 },                       // height undefined
    { sex: 'm', heightCm: 0, waistCm: 85, neckCm: 38 },          // height 0
    { sex: 'm', heightCm: -170, waistCm: 85, neckCm: 38 },       // negative height
    { sex: 'm', heightCm: 178, waistCm: null, neckCm: 38 },      // no waist
    { sex: 'm', heightCm: 178, waistCm: 85, neckCm: undefined }, // no neck
    { sex: 'm', heightCm: 178, waistCm: 'abc', neckCm: 38 },     // non-numeric waist
    { sex: 'm', heightCm: 178, waistCm: NaN, neckCm: 38 },       // NaN waist
    { sex: 'm', heightCm: Infinity, waistCm: 85, neckCm: 38 },   // non-finite height
    { sex: 'f', heightCm: 165, waistCm: 75, neckCm: 33 },        // female without hip
    { sex: 'f', heightCm: 165, waistCm: 75, neckCm: 33, hipCm: null },
    { sex: 'x', heightCm: 178, waistCm: 85, neckCm: 38, hipCm: 95 }, // bad sex
    { heightCm: 178, waistCm: 85, neckCm: 38, hipCm: 95 },       // no sex
  ];
  for (const c of cases) {
    const v = navyBodyFat(c);
    assert.equal(v, null, `expected null for ${JSON.stringify(c)}, got ${v}`);
  }
  assert.equal(navyBodyFat(), null);
  assert.equal(navyBodyFat({}), null);
});

test('navyBodyFat clamps to 2..60', () => {
  // raw formula gives ~66.3 and ~107.4
  assert.equal(navyBodyFat({ sex: 'm', heightCm: 178, waistCm: 200, neckCm: 38 }), 60);
  assert.equal(navyBodyFat({ sex: 'f', heightCm: 165, waistCm: 200, neckCm: 33, hipCm: 200 }), 60);
  // raw formula gives ~-134.9 and ~-211.4
  assert.equal(navyBodyFat({ sex: 'm', heightCm: 178, waistCm: 38.1, neckCm: 38 }), 2);
  assert.equal(navyBodyFat({ sex: 'f', heightCm: 165, waistCm: 33.1, neckCm: 33, hipCm: 0.05 }), 2);
});

// ---------- bodyFatOf ----------

test('bodyFatOf prefers an explicit bodyFatPct over the tape formula', () => {
  const row = { date: '2026-09-20', source: 'balanza', waistCm: 85, neckCm: 38, hipCm: null, bodyFatPct: 18.2 };
  assert.equal(bodyFatOf(row, PROFILE_M), 18.2);
});

test('bodyFatOf falls back to the Navy formula when bodyFatPct is missing or not finite', () => {
  const base = { date: '2026-09-20', source: 'cinta', waistCm: 85, neckCm: 38, hipCm: null };
  near(bodyFatOf({ ...base, bodyFatPct: null }, PROFILE_M), 16.4, 0.1);
  near(bodyFatOf({ ...base }, PROFILE_M), 16.4, 0.1);
  near(bodyFatOf({ ...base, bodyFatPct: NaN }, PROFILE_M), 16.4, 0.1);
  near(bodyFatOf({ ...base, bodyFatPct: 'abc' }, PROFILE_M), 16.4, 0.1);
});

test('bodyFatOf returns null when neither source works', () => {
  assert.equal(bodyFatOf({ date: '2026-09-20', source: 'cinta', waistCm: null, neckCm: null, hipCm: null, bodyFatPct: null }, PROFILE_M), null);
  assert.equal(bodyFatOf({ date: '2026-09-20', source: 'cinta', waistCm: 85, neckCm: 38, hipCm: null, bodyFatPct: null }, { sex: 'm', heightCm: null }), null);
  assert.equal(bodyFatOf({ date: '2026-09-20', source: 'cinta', waistCm: 85, neckCm: 38, hipCm: null, bodyFatPct: null }, null), null);
  assert.equal(bodyFatOf({ date: '2026-09-20', source: 'cinta', waistCm: 75, neckCm: 33, hipCm: null, bodyFatPct: null }, PROFILE_F), null);
  assert.equal(bodyFatOf(null, PROFILE_M), null);
});

// ---------- leanMass ----------

test('leanMass', () => {
  assert.equal(leanMass(80, 20), 64);
  assert.equal(leanMass(80.55, 20), 64.4);
  assert.equal(leanMass(70, 26.9), 51.2);
  assert.equal(leanMass(null, 20), null);
  assert.equal(leanMass(80, null), null);
  assert.equal(leanMass('80', 20), null);
  assert.equal(leanMass(80, NaN), null);
  assert.equal(leanMass(Infinity, 20), null);
});

// ---------- weeklyAvg ----------

test('weeklyAvg uses the 7 days ending at endISO: end inclusive, end-7 exclusive', () => {
  const rows = [
    { id: 'a', date: '2026-09-17', kg: 100 }, // end - 7: excluded
    { id: 'b', date: '2026-09-18', kg: 80 },  // end - 6: included
    { id: 'c', date: '2026-09-24', kg: 82 },  // end: included
    { id: 'd', date: '2026-09-25', kg: 200 }, // after end: excluded
  ];
  assert.equal(weeklyAvg(rows, '2026-09-24'), 81);
  assert.equal(weeklyAvg(rows, '2026-09-17'), 100);
});

test('weeklyAvg rounds to 1 decimal, ignores non-finite kg, null when empty', () => {
  assert.equal(weeklyAvg([
    { id: 'a', date: '2026-09-20', kg: 80.1 },
    { id: 'b', date: '2026-09-21', kg: 80.2 },
    { id: 'c', date: '2026-09-22', kg: 80.4 },
  ], '2026-09-24'), 80.2);
  assert.equal(weeklyAvg([
    { id: 'a', date: '2026-09-20', kg: 80 },
    { id: 'b', date: '2026-09-21', kg: NaN },
    { id: 'c', date: '2026-09-22', kg: 'abc' },
    { id: 'd', date: '2026-09-23', kg: null },
  ], '2026-09-24'), 80);
  assert.equal(weeklyAvg([], '2026-09-24'), null);
  assert.equal(weeklyAvg([{ id: 'a', date: '2026-09-01', kg: 80 }], '2026-09-24'), null);
  assert.equal(weeklyAvg([{ id: 'a', date: 'nope', kg: 80 }], '2026-09-24'), null);
  assert.equal(weeklyAvg([{ id: 'a', date: '2026-09-24', kg: 80 }], 'nope'), null);
  assert.equal(weeklyAvg(null, '2026-09-24'), null);
});

// ---------- delta30 ----------

test('delta30 with both windows populated averages each window', () => {
  const rows = [
    { id: 'n2', date: '2026-09-24', kg: 80 },
    { id: 'o1', date: '2026-08-20', kg: 85 },
    { id: 'n1', date: '2026-09-20', kg: 81 },
    { id: 'o2', date: '2026-08-25', kg: 84 },
    { id: 'x', date: '2026-08-18', kg: 300 }, // just outside the old window
  ];
  assert.deepEqual(delta30(rows, TODAY), { now: 80.5, before: 84.5, delta: -4 });
});

test('delta30 falls back to the latest row at or before today-30 when the old window is empty', () => {
  const rows = [
    { id: 'a', date: '2026-08-01', kg: 86 },
    { id: 'b', date: '2026-08-10', kg: 85 },
    { id: 'c', date: '2026-09-22', kg: 81 },
  ];
  assert.deepEqual(delta30(rows, TODAY), { now: 81, before: 85, delta: -4 });
});

test('delta30 falls back to the latest row at or before today when the now window is empty', () => {
  const rows = [
    { id: 'a', date: '2026-08-20', kg: 85 },
    { id: 'b', date: '2026-09-10', kg: 82 },
  ];
  assert.deepEqual(delta30(rows, TODAY), { now: 82, before: 85, delta: -3 });
});

test('delta30 is null with a single row or without an old datum', () => {
  assert.equal(delta30([{ id: 'a', date: '2026-09-22', kg: 81 }], TODAY), null);
  assert.equal(delta30([{ id: 'a', date: '2026-08-01', kg: 86 }], TODAY), null);
  assert.equal(delta30([
    { id: 'a', date: '2026-09-20', kg: 81 },
    { id: 'b', date: '2026-09-24', kg: 80 },
  ], TODAY), null);
  assert.equal(delta30([], TODAY), null);
  assert.equal(delta30(null, TODAY), null);
  assert.equal(delta30([{ id: 'a', date: '2026-08-01', kg: 86 }, { id: 'b', date: '2026-09-22', kg: 81 }], 'nope'), null);
});

test('delta30 is null when the only data is older than the 30-day mark', () => {
  // both rows are at or before today-30; there is no "now" to compare against
  const rows = [
    { id: 'a', date: '2026-08-15', kg: 86 },
    { id: 'b', date: '2026-08-22', kg: 85 },
  ];
  assert.equal(delta30(rows, TODAY), null);
});

test('delta30 rounds delta to 1 decimal', () => {
  const rows = [
    { id: 'a', date: '2026-08-22', kg: 84.33 },
    { id: 'b', date: '2026-09-22', kg: 80.11 },
  ];
  const r = delta30(rows, TODAY);
  assert.deepEqual(r, { now: 80.1, before: 84.3, delta: -4.2 });
});

// ---------- fatSeries ----------

test('fatSeries is ascending by date and drops rows without a body fat value', () => {
  const rows = [
    { id: 'c', date: '2026-09-20', source: 'balanza', waistCm: null, neckCm: null, hipCm: null, bodyFatPct: 18.2 },
    { id: 'a', date: '2026-09-01', source: 'cinta', waistCm: 85, neckCm: 38, hipCm: null, bodyFatPct: null },
    { id: 'b', date: '2026-09-10', source: 'cinta', waistCm: 30, neckCm: 38, hipCm: null, bodyFatPct: null }, // invalid tape
    { id: 'd', date: 'nope', source: 'balanza', waistCm: null, neckCm: null, hipCm: null, bodyFatPct: 17 },   // invalid date
  ];
  const s = fatSeries(rows, PROFILE_M);
  assert.equal(s.length, 2);
  assert.equal(s[0].date, '2026-09-01');
  near(s[0].value, 16.4, 0.1);
  assert.deepEqual(s[1], { date: '2026-09-20', value: 18.2 });
  assert.deepEqual(fatSeries([], PROFILE_M), []);
  assert.deepEqual(fatSeries(null, PROFILE_M), []);
});

// ---------- deltaFat30 ----------

test('deltaFat30 with both windows populated', () => {
  const rows = [
    { id: 'o1', date: '2026-08-22', source: 'balanza', bodyFatPct: 20 },
    { id: 'o2', date: '2026-08-24', source: 'balanza', bodyFatPct: 21 },
    { id: 'n1', date: '2026-09-20', source: 'balanza', bodyFatPct: 18 },
    { id: 'n2', date: '2026-09-24', source: 'balanza', bodyFatPct: 19 },
  ];
  assert.deepEqual(deltaFat30(rows, PROFILE_M, TODAY), { now: 18.5, before: 20.5, delta: -2 });
});

test('deltaFat30 mixes tape and scale, falls back to the nearest earlier point, null when insufficient', () => {
  const rows = [
    { id: 'o', date: '2026-08-01', source: 'cinta', waistCm: 85, neckCm: 38, hipCm: null, bodyFatPct: null }, // 16.4 via Navy
    { id: 'n', date: '2026-09-22', source: 'balanza', waistCm: null, neckCm: null, hipCm: null, bodyFatPct: 14.4 },
  ];
  assert.deepEqual(deltaFat30(rows, PROFILE_M, TODAY), { now: 14.4, before: 16.4, delta: -2 });
  // without height the tape point is dropped, leaving a single point
  assert.equal(deltaFat30(rows, { sex: 'm', heightCm: null }, TODAY), null);
  assert.equal(deltaFat30([rows[1]], PROFILE_M, TODAY), null);
  assert.equal(deltaFat30([], PROFILE_M, TODAY), null);
});

// ---------- needsMeasurementPrompt ----------

test('needsMeasurementPrompt: null, invalid date, or more than 28 days old', () => {
  assert.equal(needsMeasurementPrompt(null, TODAY), true);
  assert.equal(needsMeasurementPrompt(undefined, TODAY), true);
  assert.equal(needsMeasurementPrompt({ date: 'nope' }, TODAY), true);
  assert.equal(needsMeasurementPrompt({ date: TODAY }, TODAY), false);
  assert.equal(needsMeasurementPrompt({ date: '2026-08-27' }, TODAY), false); // exactly 28 days
  assert.equal(needsMeasurementPrompt({ date: '2026-08-26' }, TODAY), true);  // 29 days
  assert.equal(needsMeasurementPrompt({ date: '2026-01-01' }, TODAY), true);
});
