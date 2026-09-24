import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, clampRest, roundDown2_5, totalLoad, epley1RM, addedKg, makeSet, REST_MIN, REST_MAX } from '../js/model.js';

const bands = { red: { id: 'red', assistKg: 15 } };

test('exercise targets from the method', () => {
  assert.deepEqual(EXERCISES.dips.targets, [10, 15]);
  assert.deepEqual(EXERCISES.pullups.targets, [8, 12]);
  assert.deepEqual(EXERCISES.decline_pushups.range, [12, 15]);
  assert.deepEqual(EXERCISES.australian_rows.range, [12, 15]);
  assert.equal(EXERCISES.dips.day, 'push');
  assert.equal(EXERCISES.pullups.day, 'pull');
});

test('clampRest keeps 3..7 minutes', () => {
  assert.equal(REST_MIN, 180);
  assert.equal(REST_MAX, 420);
  assert.equal(clampRest(60), 180);
  assert.equal(clampRest(900), 420);
  assert.equal(clampRest(300), 300);
  assert.equal(clampRest('abc'), 180);
  assert.equal(clampRest(200.4), 200);
});

test('roundDown2_5', () => {
  assert.equal(roundDown2_5(16), 15);
  assert.equal(roundDown2_5(17.5), 17.5);
  assert.equal(roundDown2_5(0), 0);
});

test('totalLoad by mode', () => {
  assert.equal(totalLoad({ load: { mode: 'weight', kg: 20 } }, 78), 98);
  assert.equal(totalLoad({ load: { mode: 'bodyweight' } }, 78), 78);
  assert.equal(totalLoad({ load: { mode: 'band', bandId: 'red' } }, 78, bands), 63);
  assert.equal(totalLoad({ load: { mode: 'band', bandId: 'missing' } }, 78, bands), 78);
});

test('totalLoad without bodyweight equals added kg', () => {
  assert.equal(totalLoad({ load: { mode: 'weight', kg: 20 } }, undefined), 20);
  assert.equal(totalLoad({ load: { mode: 'weight', kg: 20 } }, null), 20);
});

test('treats NaN kg as 0', () => {
  assert.equal(totalLoad({ load: { mode: 'weight', kg: NaN } }, 78), 78);
  assert.equal(totalLoad({}, 78), 78);
});

test('addedKg is signed', () => {
  assert.equal(addedKg({ mode: 'weight', kg: 10 }), 10);
  assert.equal(addedKg({ mode: 'bodyweight' }), 0);
  assert.equal(addedKg({ mode: 'band', bandId: 'red' }, bands), -15);
  assert.equal(addedKg({ mode: 'band', bandId: 'nope' }, bands), 0);
});

test('epley1RM', () => {
  assert.equal(epley1RM(100, 1), 100);
  assert.equal(epley1RM(90, 10), 120);
  assert.equal(epley1RM(90, 0), 0);
});

test('makeSet defaults and copies the given load', () => {
  assert.deepEqual(makeSet(), { load: { mode: 'bodyweight', kg: 0, bandId: null }, reps: 0, halfReps: 0, failedReps: 0, toFailure: true, done: false, source: 'manual' });
  const src = { mode: 'weight', kg: 20 };
  const s = makeSet(src);
  assert.deepEqual(s.load, { mode: 'weight', kg: 20, bandId: null });
  s.load.kg = 99;
  assert.equal(src.kg, 20);
});
