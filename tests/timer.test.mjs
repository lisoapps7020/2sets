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

test('alarmWavDataUri produces a WAV data URI with the beep pattern', async () => {
  const { alarmWavDataUri } = await import('../js/timer.js');
  const uri = alarmWavDataUri();
  assert.match(uri, /^data:audio\/wav;base64,/);
  const bytes = Buffer.from(uri.split(',')[1], 'base64');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
  const sampleRate = bytes.readUInt32LE(24);
  const dataLen = bytes.readUInt32LE(40);
  assert.equal(sampleRate, 22050);
  assert.ok(dataLen / 2 / sampleRate > 2, 'más de 2 segundos de audio');
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
  assert.ok(peak > 20000, 'la alarma es fuerte, no silenciosa');
});
