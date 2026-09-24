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

test('alarmOffsets schedules the alarm at the end and repeats it', async () => {
  const { alarmOffsets } = await import('../js/timer.js');
  assert.deepEqual(alarmOffsets(300), [300, 308, 316]);
  assert.deepEqual(alarmOffsets(5, 2, 10), [5, 15]);
  assert.deepEqual(alarmOffsets(0), [0, 8, 16]);
  assert.deepEqual(alarmOffsets(-4), [0, 8, 16]);
});

test('notifyStatus explains the notification state in Spanish', async () => {
  const { notifyStatus } = await import('../js/timer.js');
  assert.equal(notifyStatus('granted', true, true).key, 'on');
  assert.equal(notifyStatus('default', true, true).key, 'ask');
  assert.match(notifyStatus('default', true, true).text, /activ/i);
  assert.equal(notifyStatus('denied', true, true).key, 'blocked');
  assert.match(notifyStatus('denied', true, true).text, /bloquead/i);
  assert.equal(notifyStatus('default', false, false).key, 'install');
  assert.match(notifyStatus('default', false, false).text, /pantalla de inicio/i);
  assert.equal(notifyStatus('default', false, true).key, 'unsupported');
});
