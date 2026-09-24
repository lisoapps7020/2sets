import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtKg, todayISO, fmtDate } from '../js/ui.js';

test('fmtKg formats with one decimal only when needed', () => {
  assert.equal(fmtKg(20), '20 kg');
  assert.equal(fmtKg(22.5), '22,5 kg');
  assert.equal(fmtKg('x'), '0 kg');
});

test('todayISO is YYYY-MM-DD', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayISO(new Date(2026, 8, 3)), '2026-09-03');
});

test('fmtDate renders spanish weekday and month', () => {
  assert.equal(fmtDate('2026-09-24'), 'jueves 24 de septiembre');
  assert.equal(fmtDate('2026-09-24', { weekday: false }), '24 de septiembre');
});
