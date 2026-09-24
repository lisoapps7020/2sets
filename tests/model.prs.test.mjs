import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePRs, detectNewPRs, milestones, seriesFor, sessionSets } from '../js/model.js';

const W = (kg, reps) => ({ load: { mode: 'weight', kg, bandId: null }, reps, done: true });
const BW = (reps) => ({ load: { mode: 'bodyweight', kg: 0, bandId: null }, reps, done: true });
const ses = (date, day, main, second) => ({
  id: date, date, day, status: 'done', bodyweightKg: 80,
  blocks: {
    main: { exerciseId: day === 'push' ? 'dips' : 'pullups', sets: main },
    second: { exerciseId: day === 'push' ? 'decline_pushups' : 'australian_rows', sets: second },
  },
});
const opts = { bodyweightFor: () => 80, bandsById: {} };
const S1 = ses('2026-09-01', 'push', [W(20, 9), W(15, 13)], [BW(12), BW(12)]);
const S2 = ses('2026-09-04', 'push', [W(20, 10), W(15, 15)], [BW(15), BW(15)]);
const S3 = ses('2026-09-08', 'push', [W(25, 9), W(20, 13)], [W(2.5, 12), W(2.5, 12)]);

test('sessionSets flattens main and second blocks', () => {
  const rows = sessionSets(S1);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => `${r.exerciseId}/${r.slot}`), ['dips/0', 'dips/1', 'decline_pushups/0', 'decline_pushups/1']);
  assert.deepEqual(sessionSets({ blocks: {} }), []);
});

test('computePRs tracks per slot', () => {
  const prs = computePRs([S1, S2, S3], opts);
  assert.deepEqual(prs.dips[0].maxAdded, { value: 25, date: '2026-09-08' });
  assert.deepEqual(prs.dips[1].maxAdded, { value: 20, date: '2026-09-08' });
  assert.equal(prs.dips[0].maxTotal.value, 105);
  assert.equal(Math.round(prs.dips[0].maxE1RM.value), 137);
  assert.deepEqual(prs.decline_pushups[0].maxBwReps, { value: 15, date: '2026-09-04' });
  assert.equal(prs.dips[0].maxBwReps, null);
});

test('computePRs ignores sets with reps 0 and active sessions', () => {
  const active = { ...S3, id: 'x', status: 'active' };
  const zero = ses('2026-09-09', 'push', [W(40, 0), W(30, 0)], [BW(0), BW(0)]);
  const prs = computePRs([S1, active, zero], opts);
  assert.equal(prs.dips[0].maxAdded.value, 20);
});

test('computePRs uses bodyweightFor when session has no bodyweight', () => {
  const s = { ...S1, bodyweightKg: null };
  const prs = computePRs([s], { bodyweightFor: () => 70, bandsById: {} });
  assert.equal(prs.dips[0].maxTotal.value, 90);
  const none = computePRs([s], { bandsById: {} });
  assert.equal(none.dips[0].maxTotal.value, 20);
});

test('detectNewPRs lists only improvements', () => {
  const before = computePRs([S1, S2], opts);
  const news = detectNewPRs(before, S3, opts);
  const types = news.filter((n) => n.exerciseId === 'dips' && n.slot === 0).map((n) => n.type).sort();
  assert.deepEqual(types, ['maxAdded', 'maxE1RM', 'maxTotal']);
  const added = news.find((n) => n.exerciseId === 'dips' && n.slot === 0 && n.type === 'maxAdded');
  assert.equal(added.prev, 20);
  assert.equal(detectNewPRs(computePRs([S1, S2, S3], opts), S1, opts).length, 0);
});

test('first session is all PRs', () => {
  const news = detectNewPRs({}, S1, opts);
  assert.ok(news.length >= 3);
  assert.ok(news.every((n) => n.prev === null));
});

test('milestones use set1 with >= 10 reps', () => {
  const m = milestones([S1, S2, S3], opts);
  assert.deepEqual(m.dips, { targetKg: 40, bestKg: 20, pct: 50 });
  assert.deepEqual(m.pullups, { targetKg: 20, bestKg: 0, pct: 0 });
  const big = milestones([ses('2026-10-01', 'push', [W(45, 10), W(35, 12)], [BW(12), BW(12)])], opts);
  assert.equal(big.dips.pct, 100);
});

test('seriesFor metrics', () => {
  assert.deepEqual(seriesFor([S1, S2, S3], 'dips', 0, 'added', opts).map((p) => p.value), [20, 20, 25]);
  assert.deepEqual(seriesFor([S3, S1], 'dips', 1, 'reps', opts).map((p) => p.date), ['2026-09-01', '2026-09-08']);
  assert.equal(seriesFor([S1], 'dips', 0, 'total', opts)[0].value, 100);
  assert.equal(Math.round(seriesFor([S1], 'dips', 0, 'e1rm', opts)[0].value), 130);
  assert.deepEqual(seriesFor([S1], 'pullups', 0, 'added', opts), []);
});
