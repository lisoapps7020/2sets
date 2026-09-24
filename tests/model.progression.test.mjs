import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMain, suggestSecond, nextDay } from '../js/model.js';

const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, done: true });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, done: true });
const BAND = (reps) => ({ load: { mode: 'band', kg: 0, bandId: 'red' }, reps, done: true });

test('no history: both sets bodyweight with hint', () => {
  const s = suggestMain('dips', null);
  assert.equal(s.sets[0].load.mode, 'bodyweight');
  assert.equal(s.sets[1].load.mode, 'bodyweight');
  assert.match(s.sets[0].hint, /peso perfecto/);
  assert.equal(s.switchTo2_5, false);
});

test('set1 reaches target: add increment; set2 below: keep', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [W(20, 10), W(15, 13)] });
  assert.deepEqual(s.sets[0].load, { mode: 'weight', kg: 25, bandId: null });
  assert.deepEqual(s.sets[1].load, { mode: 'weight', kg: 15, bandId: null });
  assert.match(s.sets[1].hint, /15/);
});

test('set2 reaches 15: add increment to set2 only', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [W(25, 9), W(15, 15)] });
  assert.equal(s.sets[0].load.kg, 25);
  assert.equal(s.sets[1].load.kg, 20);
});

test('pullups use 8 and 12', () => {
  const s = suggestMain('pullups', { exerciseId: 'pullups', sets: [W(10, 8), W(5, 12)] });
  assert.equal(s.sets[0].load.kg, 15);
  assert.equal(s.sets[1].load.kg, 10);
  const keep = suggestMain('pullups', { exerciseId: 'pullups', sets: [W(10, 7), W(5, 11)] });
  assert.equal(keep.sets[0].load.kg, 10);
  assert.equal(keep.sets[1].load.kg, 5);
});

test('increment 2.5 honoured', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [W(30, 10), W(20, 14)] }, { incrementKg: 2.5 });
  assert.equal(s.sets[0].load.kg, 32.5);
  assert.equal(s.sets[1].load.kg, 20);
});

test('bodyweight at target moves to weight and seeds set2', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [BW(12), BW(10)] });
  assert.deepEqual(s.sets[0].load, { mode: 'weight', kg: 5, bandId: null });
  assert.equal(s.sets[1].load.mode, 'weight');
  assert.ok(s.sets[1].load.kg <= s.sets[0].load.kg);
});

test('bodyweight below target stays bodyweight', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [BW(8), BW(9)] });
  assert.equal(s.sets[0].load.mode, 'bodyweight');
  assert.equal(s.sets[1].load.mode, 'bodyweight');
});

test('set2 seed is 80% of set1 rounded down and never exceeds set1', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [W(20, 10), BW(15)] });
  assert.equal(s.sets[0].load.kg, 25);
  assert.equal(s.sets[1].load.kg, 20);
  assert.ok(s.sets[1].load.kg <= s.sets[0].load.kg);
});

test('band at target keeps band and hints lighter', () => {
  const s = suggestMain('pullups', { exerciseId: 'pullups', sets: [BAND(9), BAND(5)] });
  assert.equal(s.sets[0].load.mode, 'band');
  assert.equal(s.sets[0].load.bandId, 'red');
  assert.match(s.sets[0].hint, /liviana|peso corporal/);
  assert.equal(s.sets[1].load.mode, 'band');
});

test('ignores sets with reps 0 (treated as no history for that slot)', () => {
  const s = suggestMain('dips', { exerciseId: 'dips', sets: [W(20, 0), W(15, 0)] });
  assert.equal(s.sets[0].load.mode, 'bodyweight');
  const half = suggestMain('dips', { exerciseId: 'dips', sets: [W(20, 10), { load: { mode: 'weight', kg: 15 }, reps: 12, done: false }] });
  assert.equal(half.sets[0].load.kg, 25);
  assert.equal(half.sets[1].load.mode, 'weight'); // seeded because slot 2 has no usable weight history
});

test('suggest switching to 2.5 when reps drop 3+ after a raise', () => {
  const prev = { exerciseId: 'dips', sets: [W(20, 10), W(15, 15)] };
  const last = { exerciseId: 'dips', sets: [W(25, 7), W(20, 13)] };
  assert.equal(suggestMain('dips', last, { previousBlock: prev }).switchTo2_5, true);
  assert.equal(suggestMain('dips', last, { previousBlock: prev, incrementKg: 2.5 }).switchTo2_5, false);
  const smallDrop = { exerciseId: 'dips', sets: [W(25, 8), W(20, 13)] };
  assert.equal(suggestMain('dips', smallDrop, { previousBlock: prev }).switchTo2_5, false);
});

test('suggestSecond', () => {
  const none = suggestSecond('decline_pushups', null);
  assert.equal(none.load.mode, 'bodyweight');
  assert.match(none.hint, /12 a 15/);
  assert.equal(suggestSecond('decline_pushups', { sets: [BW(15), BW(16)] }).load.kg, 2.5);
  assert.equal(suggestSecond('decline_pushups', { sets: [W(5, 15), W(5, 14)] }).load.kg, 5);
  assert.equal(suggestSecond('decline_pushups', { sets: [W(5, 15), W(5, 15)] }).load.kg, 7.5);
  assert.equal(suggestSecond('australian_rows', { sets: [W(5, 15), W(5, 15)] }, { incrementKg: 5 }).load.kg, 10);
  const band = suggestSecond('australian_rows', { sets: [BAND(15), BAND(15)] });
  assert.equal(band.load.mode, 'band');
  assert.match(band.hint, /liviana|sin banda/);
});

test('nextDay alternates, defaults to pull', () => {
  assert.equal(nextDay(null), 'pull');
  assert.equal(nextDay(undefined), 'pull');
  assert.equal(nextDay({ day: 'pull' }), 'push');
  assert.equal(nextDay({ day: 'push' }), 'pull');
});

test('hints format decimals with comma', () => {
  const s = suggestSecond('decline_pushups', { sets: [BW(15), BW(16)] });
  assert.match(s.hint, /2,5 kg/);
  const m = suggestMain('dips', { exerciseId: 'dips', sets: [W(30, 10), W(20, 14)] }, { incrementKg: 2.5 });
  assert.match(m.sets[0].hint, /32,5 kg/);
  assert.doesNotMatch(m.sets[0].hint, /32\.5/);
});
