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

test('prText describes a PR in short form', async () => {
  const { prText } = await import('../js/ui.js');
  assert.equal(prText({ exerciseId: 'dips', slot: 0, type: 'maxAdded', value: 25 }), 'Fondos S1 · +25 kg');
  assert.equal(prText({ exerciseId: 'pullups', slot: 1, type: 'maxTotal', value: 92.5 }), 'Dominadas S2 · 92,5 kg total');
  assert.equal(prText({ exerciseId: 'dips', slot: 0, type: 'maxE1RM', value: 136.5 }), 'Fondos S1 · 1RM 137 kg');
  assert.equal(prText({ exerciseId: 'decline_pushups', slot: 0, type: 'maxBwReps', value: 15 }), 'Flex. decl. S1 · 15 reps PC');
});
