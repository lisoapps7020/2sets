import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExport, migrate, DEFAULT_PROFILE, STORES } from '../js/db.js';

test('validateExport rejects other apps and future schemas', () => {
  assert.equal(validateExport(null).ok, false);
  assert.equal(validateExport({ app: 'other', schemaVersion: 1 }).ok, false);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 99 }).ok, false);
  assert.equal(validateExport({ app: '2sets', schemaVersion: '1' }).ok, false);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 1, sessions: 'nope' }).ok, false);
  const bad = validateExport({ app: '2sets', schemaVersion: 1, sessions: 'nope' });
  assert.match(bad.error, /sessions/);
});

test('validateExport accepts a full backup and one with missing sections', () => {
  assert.equal(validateExport({ app: '2sets', schemaVersion: 1, sessions: [], settings: [], bodyweight: [], bands: [], extras: [] }).ok, true);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 1 }).ok, true);
});

test('migrate v1 is identity and fills missing arrays', () => {
  const d = migrate({ app: '2sets', schemaVersion: 1, sessions: [{ id: 'a' }] });
  assert.deepEqual(d.bands, []);
  assert.deepEqual(d.sessions, [{ id: 'a' }]);
  assert.equal(d.schemaVersion, 2);
  for (const s of STORES) assert.ok(Array.isArray(d[s]));
});

test('DEFAULT_PROFILE has method defaults', () => {
  assert.deepEqual(DEFAULT_PROFILE.incrementKg, { dips: 5, pullups: 5, second: 2.5 });
  assert.equal(DEFAULT_PROFILE.restMainSec, 300);
  assert.equal(DEFAULT_PROFILE.restApproachSec, 180);
  assert.equal(DEFAULT_PROFILE.theme, 'auto');
});

test('STORES includes measurements and the database is version 2', async () => {
  const { STORES: S, DB_VERSION } = await import('../js/db.js');
  assert.ok(S.includes('measurements'));
  assert.equal(DB_VERSION, 2);
});

test('validateExport accepts v1 and v2 backups, rejects v3', () => {
  assert.equal(validateExport({ app: '2sets', schemaVersion: 1 }).ok, true);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 2, measurements: [] }).ok, true);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 2, measurements: 'x' }).ok, false);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 3 }).ok, false);
});

test('migrate v1 → v2 adds measurements and bumps the version', () => {
  const d = migrate({ app: '2sets', schemaVersion: 1, sessions: [] });
  assert.deepEqual(d.measurements, []);
  assert.equal(d.schemaVersion, 2);
});

test('DEFAULT_PROFILE has body fields and goal', () => {
  assert.equal(DEFAULT_PROFILE.sex, 'm');
  assert.equal(DEFAULT_PROFILE.heightCm, null);
  assert.deepEqual(DEFAULT_PROFILE.goal, { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null });
});

test('DEFAULT_PROFILE has avatar customization defaults', () => {
  assert.deepEqual(DEFAULT_PROFILE.avatar, { tint: 'blanco', hair: 'short', beard: 'none' });
});
