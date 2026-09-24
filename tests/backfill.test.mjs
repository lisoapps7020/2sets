import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackfillSession, validateBackfill } from '../js/backfill.js';

const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps });

test('buildBackfillSession makes a finished pull session marked as papel', () => {
  const s = buildBackfillSession({ dateISO: '2026-08-10', day: 'pull', bodyweightKg: 80, main: [W(10, 8), BW(12)], second: [BW(15), BW(0)] });
  assert.equal(s.status, 'done');
  assert.equal(s.origin, 'papel');
  assert.equal(s.date, '2026-08-10');
  assert.equal(s.day, 'pull');
  assert.equal(s.bodyweightKg, 80);
  assert.match(s.id, /^ses_/);
  assert.equal(s.blocks.main.exerciseId, 'pullups');
  assert.equal(s.blocks.second.exerciseId, 'australian_rows');
  assert.deepEqual(s.blocks.main.sets[0].load, { mode: 'weight', kg: 10, bandId: null });
  assert.equal(s.blocks.main.sets[0].reps, 8);
  assert.equal(s.blocks.main.sets[0].done, true);
  assert.equal(s.blocks.main.sets[1].reps, 12);
  assert.equal(s.blocks.second.sets[0].done, true);
  assert.equal(s.blocks.second.sets[1].done, false);
  assert.equal(s.blocks.second.sets[1].reps, 0);
  assert.deepEqual(s.blocks.extra, []);
  assert.equal(s.blocks.approach.sets.length, 2);
  assert.equal(typeof s.startedAt, 'number');
  assert.equal(s.finishedAt, s.startedAt);
  assert.equal(new Date(s.startedAt).getFullYear(), 2026);
  assert.equal(new Date(s.startedAt).getMonth(), 7);
});

test('buildBackfillSession keeps bodyweight null when not given and copies loads', () => {
  const load = { mode: 'band', kg: 0, bandId: 'red' };
  const s = buildBackfillSession({ dateISO: '2026-08-10', day: 'push', bodyweightKg: null, main: [{ load, reps: 9 }, BW(0)], second: [] });
  assert.equal(s.bodyweightKg, null);
  assert.equal(s.blocks.main.exerciseId, 'dips');
  assert.deepEqual(s.blocks.main.sets[0].load, load);
  assert.notEqual(s.blocks.main.sets[0].load, load);
  assert.equal(s.blocks.main.sets[1].done, false);
  assert.equal(s.blocks.second.sets.length, 2);
});

test('validateBackfill', () => {
  const today = '2026-09-24';
  assert.equal(validateBackfill({ dateISO: '2026-08-10', day: 'pull', main: [W(10, 8), BW(0)] }, today).ok, true);
  assert.match(validateBackfill({ dateISO: '2026-09-25', day: 'pull', main: [W(10, 8), BW(0)] }, today).error, /futur/i);
  assert.match(validateBackfill({ dateISO: 'nope', day: 'pull', main: [W(10, 8), BW(0)] }, today).error, /fecha/i);
  assert.match(validateBackfill({ dateISO: '', day: 'pull', main: [W(10, 8), BW(0)] }, today).error, /fecha/i);
  assert.match(validateBackfill({ dateISO: '2026-08-10', day: 'pull', main: [W(10, 0), BW(0)] }, today).error, /serie/i);
  assert.match(validateBackfill({ dateISO: '2026-08-10', day: 'legs', main: [W(10, 8), BW(0)] }, today).error, /día/i);
});
