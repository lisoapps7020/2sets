import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AVATAR, UNLOCKS, clamp01, lerpMap, avatarParams } from '../js/avatar/params.js';

const NUMERIC_KEYS = ['lat', 'biceps', 'triceps', 'chest', 'delt', 'forearm', 'waist', 'belly', 'scale', 'mass', 'aura'];
const UNLOCK_KEYS = ['belt', 'laurel', 'pedestal', 'gold', 'cape'];

const sheetWith = ({ attributes = {}, body = {}, level } = {}) => ({
  attributes: { tiron: null, empuje: null, base: null, constancia: null, volumen: null, cuerpo: null, ...attributes },
  body: { currentFat: null, currentWeight: null, ...body },
  level: level === undefined ? { level: 1 } : { level },
});

const assertNoNaN = (p) => {
  for (const k of NUMERIC_KEYS) {
    assert.equal(typeof p[k], 'number', `${k} should be a number`);
    assert.ok(Number.isFinite(p[k]), `${k} should be finite, got ${p[k]}`);
  }
  for (const k of UNLOCK_KEYS) assert.equal(typeof p.unlocks[k], 'boolean', `unlocks.${k} should be boolean`);
};

const assertRounded3 = (p) => {
  for (const k of NUMERIC_KEYS) assert.equal(p[k], Math.round(p[k] * 1000) / 1000, `${k}=${p[k]} not rounded to 3 decimals`);
};

// ---------- constants ----------

test('DEFAULT_AVATAR matches the spec', () => {
  assert.deepEqual(DEFAULT_AVATAR, { tint: 'blanco', hair: 'short', beard: 'none' });
});

test('UNLOCKS lists the five adornments with their levels and names, in level order', () => {
  assert.deepEqual(UNLOCKS, [
    { key: 'belt', level: 5, name: 'Cinturón de lastre' },
    { key: 'laurel', level: 10, name: 'Corona de laurel' },
    { key: 'pedestal', level: 15, name: 'Pedestal de mármol' },
    { key: 'gold', level: 20, name: 'Acabado dorado' },
    { key: 'cape', level: 30, name: 'Capa' },
  ]);
});

// ---------- clamp01 ----------

test('clamp01 clamps to [0, 1] and maps NaN to 0', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(1), 1);
  assert.equal(clamp01(-0.2), 0);
  assert.equal(clamp01(1.7), 1);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(undefined), 0);
  assert.equal(clamp01('x'), 0);
  assert.equal(clamp01(Infinity), 1);
  assert.equal(clamp01(-Infinity), 0);
});

// ---------- lerpMap ----------

test('lerpMap maps linearly between the anchors', () => {
  assert.equal(lerpMap(8, 8, 35, 0, 1), 0);
  assert.equal(lerpMap(21.5, 8, 35, 0, 1), 0.5);
  assert.equal(lerpMap(35, 8, 35, 0, 1), 1);
  assert.equal(lerpMap(175, 150, 200, 0.9, 1.1), 1);
});

test('lerpMap clamps outside the anchors to the output range', () => {
  assert.equal(lerpMap(5, 8, 35, 0, 1), 0);
  assert.equal(lerpMap(50, 8, 35, 0, 1), 1);
  assert.equal(lerpMap(230, 150, 200, 0.9, 1.1), 1.1);
  assert.equal(lerpMap(40, 55, 110, 0.9, 1.15), 0.9);
});

test('lerpMap clamps correctly when the output range is descending', () => {
  assert.equal(lerpMap(0, 0, 10, 1, 0), 1);
  assert.equal(lerpMap(10, 0, 10, 1, 0), 0);
  assert.equal(lerpMap(-5, 0, 10, 1, 0), 1);
  assert.equal(lerpMap(15, 0, 10, 1, 0), 0);
  assert.equal(lerpMap(5, 0, 10, 1, 0), 0.5);
});

test('lerpMap returns null for non-finite x', () => {
  assert.equal(lerpMap(null, 8, 35, 0, 1), null);
  assert.equal(lerpMap(undefined, 8, 35, 0, 1), null);
  assert.equal(lerpMap(NaN, 8, 35, 0, 1), null);
  assert.equal(lerpMap('x', 8, 35, 0, 1), null);
  assert.equal(lerpMap(Infinity, 8, 35, 0, 1), null);
});

// ---------- avatarParams: neutral figure ----------

const NEUTRAL = {
  lat: 0.35, biceps: 0.35, triceps: 0.35, chest: 0.35, delt: 0.35, forearm: 0.35,
  waist: 0.4, belly: 0.2, scale: 1, mass: 1, aura: 0,
  unlocks: { belt: false, laurel: false, pedestal: false, gold: false, cape: false },
  tint: 'blanco', hair: 'short', beard: 'none',
};

test('avatarParams with undefined sheet and profile is fully neutral', () => {
  const p = avatarParams(undefined, undefined);
  assert.deepEqual(p, NEUTRAL);
  assertNoNaN(p);
});

test('avatarParams with null sheet and profile is fully neutral', () => {
  assert.deepEqual(avatarParams(null, null), NEUTRAL);
});

test('avatarParams with all-null attributes and body is fully neutral', () => {
  const p = avatarParams(sheetWith(), { heightCm: null });
  assert.deepEqual(p, NEUTRAL);
});

test('avatarParams with empty objects is fully neutral', () => {
  assert.deepEqual(avatarParams({}, {}), NEUTRAL);
  assert.deepEqual(avatarParams({ attributes: null, body: null, level: null }, { avatar: null }), NEUTRAL);
});

test('avatarParams returns exactly the documented keys', () => {
  const p = avatarParams(sheetWith(), {});
  assert.deepEqual(Object.keys(p).sort(), [...NUMERIC_KEYS, 'unlocks', 'tint', 'hair', 'beard'].sort());
  assert.deepEqual(Object.keys(p.unlocks).sort(), [...UNLOCK_KEYS].sort());
});

// ---------- attribute map m(a) ----------

test('m(a) = 0.15 + 0.85*a/100: attributes 0, 50, 100 map to 0.15, 0.575, 1', () => {
  for (const [a, expected] of [[0, 0.15], [50, 0.575], [100, 1]]) {
    const p = avatarParams(sheetWith({ attributes: { tiron: a, empuje: a, base: a } }), {});
    assert.equal(p.lat, expected, `lat for ${a}`);
    assert.equal(p.triceps, expected, `triceps for ${a}`);
    assert.equal(p.chest, expected, `chest for ${a}`);
    assert.equal(p.forearm, expected, `forearm for ${a}`);
    assert.equal(p.biceps, expected, `biceps for ${a}`);
    assert.equal(p.delt, expected, `delt for ${a}`);
  }
});

test('each muscle reads from its own attribute', () => {
  const p = avatarParams(sheetWith({ attributes: { tiron: 100, empuje: 0, base: 50 } }), {});
  assert.equal(p.lat, 1);
  assert.equal(p.triceps, 0.15);
  assert.equal(p.chest, 0.15);
  assert.equal(p.forearm, 0.575);
});

test('biceps and delt blend their attributes with the spec weights', () => {
  // tiron 80 -> m = 0.83; base 20 -> m = 0.32; empuje 40 -> m = 0.49
  const p = avatarParams(sheetWith({ attributes: { tiron: 80, base: 20, empuje: 40 } }), {});
  assert.equal(p.lat, 0.83);
  assert.equal(p.forearm, 0.32);
  assert.equal(p.chest, 0.49);
  assert.equal(p.triceps, 0.49);
  assert.equal(p.biceps, 0.626);   // 0.6*0.83 + 0.4*0.32
  assert.equal(p.delt, 0.592);     // 0.7*0.49 + 0.3*0.83
});

test('a blended muscle uses the neutral 0.35 for whichever attribute is null', () => {
  // tiron 80 (0.83), base null (0.35) -> biceps = 0.6*0.83 + 0.4*0.35 = 0.638
  const p = avatarParams(sheetWith({ attributes: { tiron: 80 } }), {});
  assert.equal(p.biceps, 0.638);
  // empuje null (0.35), tiron 80 (0.83) -> delt = 0.7*0.35 + 0.3*0.83 = 0.494
  assert.equal(p.delt, 0.494);
});

test('attributes outside 0..100 are clamped before mapping', () => {
  assert.equal(avatarParams(sheetWith({ attributes: { tiron: 140 } }), {}).lat, 1);
  assert.equal(avatarParams(sheetWith({ attributes: { tiron: -20 } }), {}).lat, 0.15);
});

// ---------- waist / belly ----------

test('waist maps currentFat 8 -> 0, 21.5 -> 0.5, 35 -> 1', () => {
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 8 } }), {}).waist, 0);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 21.5 } }), {}).waist, 0.5);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 35 } }), {}).waist, 1);
});

test('waist clamps beyond the anchors: fat 5 -> 0, fat 50 -> 1', () => {
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 5 } }), {}).waist, 0);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 50 } }), {}).waist, 1);
});

test('belly maps currentFat 15 -> 0, 25 -> 0.5, 35 -> 1, and 21.5 -> 0.325', () => {
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 15 } }), {}).belly, 0);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 25 } }), {}).belly, 0.5);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 35 } }), {}).belly, 1);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 21.5 } }), {}).belly, 0.325);
});

test('belly clamps beyond the anchors: fat 8 and 5 -> 0, fat 50 -> 1', () => {
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 8 } }), {}).belly, 0);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 5 } }), {}).belly, 0);
  assert.equal(avatarParams(sheetWith({ body: { currentFat: 50 } }), {}).belly, 1);
});

test('waist and belly fall back to 0.4 and 0.2 when currentFat is null', () => {
  const p = avatarParams(sheetWith({ body: { currentFat: null } }), {});
  assert.equal(p.waist, 0.4);
  assert.equal(p.belly, 0.2);
});

// ---------- scale / mass ----------

test('scale maps heightCm 150/175/200/230 -> 0.9/1/1.1/1.1', () => {
  for (const [h, expected] of [[150, 0.9], [175, 1], [200, 1.1], [230, 1.1]]) {
    assert.equal(avatarParams(sheetWith(), { heightCm: h }).scale, expected, `heightCm ${h}`);
  }
});

test('scale clamps below 150 and falls back to 1 when heightCm is null or missing', () => {
  assert.equal(avatarParams(sheetWith(), { heightCm: 120 }).scale, 0.9);
  assert.equal(avatarParams(sheetWith(), { heightCm: null }).scale, 1);
  assert.equal(avatarParams(sheetWith(), {}).scale, 1);
});

test('mass maps currentWeight 55/82.5/110/40 -> 0.9/1.025/1.15/0.9', () => {
  for (const [w, expected] of [[55, 0.9], [82.5, 1.025], [110, 1.15], [40, 0.9]]) {
    assert.equal(avatarParams(sheetWith({ body: { currentWeight: w } }), {}).mass, expected, `currentWeight ${w}`);
  }
});

test('mass clamps above 110 and falls back to 1 when currentWeight is null', () => {
  assert.equal(avatarParams(sheetWith({ body: { currentWeight: 150 } }), {}).mass, 1.15);
  assert.equal(avatarParams(sheetWith({ body: { currentWeight: null } }), {}).mass, 1);
});

// ---------- aura ----------

test('aura is constancia / 100, clamped, null -> 0', () => {
  assert.equal(avatarParams(sheetWith({ attributes: { constancia: 63 } }), {}).aura, 0.63);
  assert.equal(avatarParams(sheetWith({ attributes: { constancia: 140 } }), {}).aura, 1);
  assert.equal(avatarParams(sheetWith({ attributes: { constancia: 0 } }), {}).aura, 0);
  assert.equal(avatarParams(sheetWith({ attributes: { constancia: -10 } }), {}).aura, 0);
  assert.equal(avatarParams(sheetWith({ attributes: { constancia: null } }), {}).aura, 0);
});

// ---------- unlocks ----------

const unlocksAt = (level) => avatarParams(sheetWith({ level }), {}).unlocks;

test('unlocks: level 4 unlocks nothing, level 5 unlocks only the belt', () => {
  assert.deepEqual(unlocksAt(4), { belt: false, laurel: false, pedestal: false, gold: false, cape: false });
  assert.deepEqual(unlocksAt(5), { belt: true, laurel: false, pedestal: false, gold: false, cape: false });
});

test('unlocks accumulate at 10, 15, 20 and 30', () => {
  assert.deepEqual(unlocksAt(10), { belt: true, laurel: true, pedestal: false, gold: false, cape: false });
  assert.deepEqual(unlocksAt(15), { belt: true, laurel: true, pedestal: true, gold: false, cape: false });
  assert.deepEqual(unlocksAt(20), { belt: true, laurel: true, pedestal: true, gold: true, cape: false });
  assert.deepEqual(unlocksAt(30), { belt: true, laurel: true, pedestal: true, gold: true, cape: true });
  assert.deepEqual(unlocksAt(99), { belt: true, laurel: true, pedestal: true, gold: true, cape: true });
});

test('unlocks: one level short of each threshold stays locked', () => {
  assert.equal(unlocksAt(9).laurel, false);
  assert.equal(unlocksAt(14).pedestal, false);
  assert.equal(unlocksAt(19).gold, false);
  assert.equal(unlocksAt(29).cape, false);
});

test('unlocks: level 1 and missing level unlock nothing', () => {
  const none = { belt: false, laurel: false, pedestal: false, gold: false, cape: false };
  assert.deepEqual(unlocksAt(1), none);
  assert.deepEqual(avatarParams({ attributes: {}, body: {} }, {}).unlocks, none);
  assert.deepEqual(avatarParams({ attributes: {}, body: {}, level: {} }, {}).unlocks, none);
  assert.deepEqual(avatarParams({ attributes: {}, body: {}, level: { level: null } }, {}).unlocks, none);
  assert.deepEqual(avatarParams({ attributes: {}, body: {}, level: { level: NaN } }, {}).unlocks, none);
});

test('unlocks agree with the UNLOCKS table at every threshold', () => {
  for (const u of UNLOCKS) {
    assert.equal(unlocksAt(u.level - 1)[u.key], false, `${u.key} locked at ${u.level - 1}`);
    assert.equal(unlocksAt(u.level)[u.key], true, `${u.key} unlocked at ${u.level}`);
  }
});

// ---------- customization ----------

test('tint, hair and beard default when profile.avatar is missing', () => {
  const p = avatarParams(sheetWith(), { heightCm: 178 });
  assert.equal(p.tint, 'blanco');
  assert.equal(p.hair, 'short');
  assert.equal(p.beard, 'none');
});

test('tint, hair and beard are copied from profile.avatar when valid', () => {
  const p = avatarParams(sheetWith(), { avatar: { tint: 'gris', hair: 'bun', beard: 'full' } });
  assert.equal(p.tint, 'gris');
  assert.equal(p.hair, 'bun');
  assert.equal(p.beard, 'full');
});

test('every allowed customization value round-trips', () => {
  for (const tint of ['blanco', 'crema', 'gris']) assert.equal(avatarParams(sheetWith(), { avatar: { tint } }).tint, tint);
  for (const hair of ['none', 'short', 'long', 'bun']) assert.equal(avatarParams(sheetWith(), { avatar: { hair } }).hair, hair);
  for (const beard of ['none', 'short', 'full']) assert.equal(avatarParams(sheetWith(), { avatar: { beard } }).beard, beard);
});

test('invalid customization values fall back to the defaults individually', () => {
  const p = avatarParams(sheetWith(), { avatar: { tint: 'rojo', hair: 'mohawk', beard: 'full' } });
  assert.equal(p.tint, 'blanco');
  assert.equal(p.hair, 'short');
  assert.equal(p.beard, 'full');
  const q = avatarParams(sheetWith(), { avatar: { tint: 'crema', hair: 42, beard: null } });
  assert.equal(q.tint, 'crema');
  assert.equal(q.hair, 'short');
  assert.equal(q.beard, 'none');
  // values from another selector's list are not accepted
  assert.equal(avatarParams(sheetWith(), { avatar: { tint: 'short' } }).tint, 'blanco');
  assert.equal(avatarParams(sheetWith(), { avatar: { beard: 'long' } }).beard, 'none');
});

test('partial profile.avatar keeps defaults for the missing keys', () => {
  const p = avatarParams(sheetWith(), { avatar: { hair: 'long' } });
  assert.deepEqual({ tint: p.tint, hair: p.hair, beard: p.beard }, { tint: 'blanco', hair: 'long', beard: 'none' });
});

// ---------- robustness ----------

test('no NaN anywhere for garbage attribute and body values', () => {
  const p = avatarParams({ attributes: { tiron: NaN }, body: { currentFat: 'x' } }, {});
  assertNoNaN(p);
  assert.equal(p.lat, 0.35);
  assert.equal(p.waist, 0.4);
  assert.equal(p.belly, 0.2);
});

test('no NaN anywhere for wildly wrong input types', () => {
  const p = avatarParams(
    { attributes: { tiron: 'a', empuje: {}, base: [], constancia: Infinity }, body: { currentFat: -Infinity, currentWeight: 'heavy' }, level: { level: 'x' } },
    { heightCm: 'tall', avatar: 'nope' },
  );
  assertNoNaN(p);
  assert.deepEqual(p, NEUTRAL);
});

test('accepts sheet fields as non-object garbage without throwing', () => {
  assert.doesNotThrow(() => avatarParams({ attributes: 5, body: 'x', level: 'y' }, { avatar: 7 }));
  assert.doesNotThrow(() => avatarParams('sheet', 'profile'));
  assertNoNaN(avatarParams({ attributes: 5, body: 'x', level: 'y' }, { avatar: 7 }));
});

test('every numeric output is rounded to 3 decimals', () => {
  const p = avatarParams(
    sheetWith({ attributes: { tiron: 33, empuje: 67, base: 11, constancia: 77 }, body: { currentFat: 19.37, currentWeight: 77.77 }, level: 12 }),
    { heightCm: 181 },
  );
  assertRounded3(p);
  assertNoNaN(p);
});

test('a realistic sheet produces a bounded, non-neutral figure', () => {
  const p = avatarParams(
    sheetWith({ attributes: { tiron: 70, empuje: 55, base: 60, constancia: 90, volumen: 40, cuerpo: 50 }, body: { currentFat: 18, currentWeight: 78 }, level: 12 }),
    { heightCm: 178, avatar: { tint: 'crema', hair: 'long', beard: 'short' } },
  );
  assert.equal(p.lat, 0.745);
  assert.equal(p.forearm, 0.66);
  assert.equal(p.chest, 0.618);
  assert.equal(p.biceps, 0.711);  // 0.6*0.745 + 0.4*0.66 = 0.447 + 0.264
  assert.equal(p.delt, 0.656);    // 0.7*0.618 + 0.3*0.745 = 0.4326 + 0.2235 = 0.6561
  assert.equal(p.waist, 0.37);    // (18-8)/27 = 0.3703...
  assert.equal(p.belly, 0.15);    // (18-15)/20
  assert.equal(p.scale, 1.012);   // 0.9 + 28/50*0.2 = 1.012
  assert.equal(p.mass, 1.005);    // 0.9 + 23/55*0.25 = 1.00454...
  assert.equal(p.aura, 0.9);
  assert.deepEqual(p.unlocks, { belt: true, laurel: true, pedestal: false, gold: false, cape: false });
  assert.equal(p.tint, 'crema');
  assert.equal(p.hair, 'long');
  assert.equal(p.beard, 'short');
  for (const k of NUMERIC_KEYS) {
    if (k === 'scale' || k === 'mass') continue;
    assert.ok(p[k] >= 0 && p[k] <= 1, `${k}=${p[k]} out of 0..1`);
  }
});
