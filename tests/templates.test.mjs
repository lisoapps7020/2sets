import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, WARMUP_ITEMS, BLOCK_META, EXTRA_SEEDS, BAND_SEEDS, uid, sessionDuration } from '../js/templates.js';

test('newSession builds five blocks for push', () => {
  const s = newSession({
    day: 'push', dateISO: '2026-09-24', bodyweightKg: 80,
    mainSuggestion: { sets: [{ load: { mode: 'weight', kg: 20, bandId: null } }, { load: { mode: 'weight', kg: 15, bandId: null } }] },
    secondSuggestion: { load: { mode: 'bodyweight', kg: 0, bandId: null } },
  });
  assert.equal(s.status, 'active');
  assert.equal(s.day, 'push');
  assert.equal(s.date, '2026-09-24');
  assert.equal(s.bodyweightKg, 80);
  assert.equal(s.blocks.main.exerciseId, 'dips');
  assert.equal(s.blocks.second.exerciseId, 'decline_pushups');
  assert.equal(s.blocks.main.sets[0].load.kg, 20);
  assert.equal(s.blocks.main.sets[1].load.kg, 15);
  assert.equal(s.blocks.main.sets[0].reps, 0);
  assert.equal(s.blocks.second.sets[0].load.mode, 'bodyweight');
  assert.equal(s.blocks.approach.sets.length, 2);
  assert.equal(s.blocks.approach.sets[0].reps, 5);
  assert.equal(s.blocks.warmup.items.length, WARMUP_ITEMS.length);
  assert.ok(s.blocks.warmup.items.every((x) => x === false));
  assert.deepEqual(s.blocks.extra, []);
  assert.match(s.id, /^ses_/);
  assert.equal(typeof s.startedAt, 'number');
  assert.equal(s.finishedAt, null);
});

test('pull day maps to pullups and rows, null suggestions fall back to bodyweight', () => {
  const s = newSession({ day: 'pull', dateISO: '2026-09-24', bodyweightKg: null, mainSuggestion: null, secondSuggestion: null });
  assert.equal(s.blocks.main.exerciseId, 'pullups');
  assert.equal(s.blocks.second.exerciseId, 'australian_rows');
  assert.equal(s.blocks.main.sets[0].load.mode, 'bodyweight');
  assert.equal(s.bodyweightKg, null);
});

test('block meta uses the latin names', () => {
  assert.equal(BLOCK_META.warmup.title, 'Ignis');
  assert.equal(BLOCK_META.approach.title, 'Aproximación');
  assert.equal(BLOCK_META.main.title, 'Duo');
  assert.equal(BLOCK_META.second.title, 'Secundus');
  assert.equal(BLOCK_META.extra.title, 'Extra');
});

test('seeds and ids', () => {
  assert.ok(EXTRA_SEEDS.length >= 4);
  assert.ok(EXTRA_SEEDS.every((e) => ['push', 'pull', 'any'].includes(e.day)));
  assert.equal(BAND_SEEDS.length, 4);
  assert.ok(BAND_SEEDS.every((b) => b.assistKg > 0));
  assert.match(uid('bw'), /^bw_[a-z0-9-]+$/i);
  assert.notEqual(uid('x'), uid('x'));
});

test('sessionDuration in minutes', () => {
  assert.equal(sessionDuration({ startedAt: 0, finishedAt: 90 * 60000 }), 90);
  assert.equal(sessionDuration({ startedAt: 0, finishedAt: null }), null);
});
