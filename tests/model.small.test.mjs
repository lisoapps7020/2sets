import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsBodyweightPrompt, resolveBandId } from '../js/model.js';

test('needsBodyweightPrompt when there is no entry or it is older than 7 days', () => {
  assert.equal(needsBodyweightPrompt(null, '2026-09-24'), true);
  assert.equal(needsBodyweightPrompt({ date: '2026-09-24', kg: 80 }, '2026-09-24'), false);
  assert.equal(needsBodyweightPrompt({ date: '2026-09-17', kg: 80 }, '2026-09-24'), false);
  assert.equal(needsBodyweightPrompt({ date: '2026-09-16', kg: 80 }, '2026-09-24'), true);
  assert.equal(needsBodyweightPrompt({ date: '2026-08-01', kg: 80 }, '2026-09-24'), true);
  assert.equal(needsBodyweightPrompt({ date: 'nope', kg: 80 }, '2026-09-24'), true);
});

test('resolveBandId keeps a valid band, replaces a missing one, null when no bands', () => {
  const bands = { a: { id: 'a', assistKg: 10 }, b: { id: 'b', assistKg: 15 } };
  assert.equal(resolveBandId('b', bands), 'b');
  assert.equal(resolveBandId('gone', bands), 'a');
  assert.equal(resolveBandId(null, bands), 'a');
  assert.equal(resolveBandId('gone', {}), null);
});
