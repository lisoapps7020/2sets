import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingMs, shouldFire, fmtMMSS } from '../js/timer.js';

test('remainingMs never negative', () => {
  assert.equal(remainingMs(1000, 1500), 0);
  assert.equal(remainingMs(2000, 1500), 500);
  assert.equal(remainingMs(0, 0), 0);
});

test('shouldFire fires once when past end', () => {
  assert.equal(shouldFire(1000, 999, false), false);
  assert.equal(shouldFire(1000, 1000, false), true);
  assert.equal(shouldFire(1000, 5000, false), true);
  assert.equal(shouldFire(1000, 5000, true), false);
});

test('fmtMMSS rounds up to the next second', () => {
  assert.equal(fmtMMSS(300000), '05:00');
  assert.equal(fmtMMSS(299001), '05:00');
  assert.equal(fmtMMSS(180000), '03:00');
  assert.equal(fmtMMSS(0), '00:00');
  assert.equal(fmtMMSS(61000), '01:01');
});
