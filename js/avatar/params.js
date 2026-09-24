// Proporciones del personaje 3D a partir de la ficha y el perfil.
// Módulo puro: sin DOM, sin Three.js. Ver docs/superpowers/specs/2026-09-24-personaje-3d-design.md §4.

export const DEFAULT_AVATAR = Object.freeze({ tint: 'blanco', hair: 'short', beard: 'none' });

export const UNLOCKS = Object.freeze([
  { key: 'belt', level: 5, name: 'Cinturón de lastre' },
  { key: 'laurel', level: 10, name: 'Corona de laurel' },
  { key: 'pedestal', level: 15, name: 'Pedestal de mármol' },
  { key: 'gold', level: 20, name: 'Acabado dorado' },
  { key: 'cape', level: 30, name: 'Capa' },
]);

const TINTS = ['blanco', 'crema', 'gris'];
const HAIRS = ['none', 'short', 'long', 'bun'];
const BEARDS = ['none', 'short', 'full'];

const NEUTRAL_MUSCLE = 0.35;

// Número finito o null. Acepta números y strings numéricos; rechaza '' / NaN / ±Infinity y cualquier
// otro tipo (arrays, objetos, booleanos), que Number() coercionaría a 0 o 1 y darían una figura falsa.
function fin(x) {
  if (typeof x !== 'number' && typeof x !== 'string') return null;
  if (x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const obj = (x) => (x && typeof x === 'object' ? x : {});
const round3 = (x) => Math.round(x * 1000) / 1000;

export function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// Mapa lineal x0→y0, x1→y1, acotado al rango [min(y0,y1), max(y0,y1)]. x no finito → null.
export function lerpMap(x, x0, x1, y0, y1) {
  const v = fin(x);
  if (v === null) return null;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  if (x1 === x0) return Math.min(hi, Math.max(lo, y0));
  const t = (v - x0) / (x1 - x0);
  return Math.min(hi, Math.max(lo, y0 + t * (y1 - y0)));
}

// m(a) = 0.15 + 0.85·a/100 con a acotado a 0..100; sin dato → 0.35.
function muscle(a) {
  const v = fin(a);
  if (v === null) return NEUTRAL_MUSCLE;
  return 0.15 + (0.85 * Math.min(100, Math.max(0, v))) / 100;
}

function pick(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

export function avatarParams(sheet, profile) {
  const s = obj(sheet);
  const p = obj(profile);
  const attrs = obj(s.attributes);
  const body = obj(s.body);
  const avatar = obj(p.avatar);

  const mTiron = muscle(attrs.tiron);
  const mEmpuje = muscle(attrs.empuje);
  const mBase = muscle(attrs.base);

  const level = fin(obj(s.level).level) ?? 1;
  const unlocks = {};
  for (const u of UNLOCKS) unlocks[u.key] = level >= u.level;

  return {
    lat: round3(mTiron),
    biceps: round3(0.6 * mTiron + 0.4 * mBase),
    triceps: round3(mEmpuje),
    chest: round3(mEmpuje),
    delt: round3(0.7 * mEmpuje + 0.3 * mTiron),
    forearm: round3(mBase),
    waist: round3(lerpMap(body.currentFat, 8, 35, 0, 1) ?? 0.4),
    belly: round3(lerpMap(body.currentFat, 15, 35, 0, 1) ?? 0.2),
    scale: round3(lerpMap(p.heightCm, 150, 200, 0.9, 1.1) ?? 1),
    mass: round3(lerpMap(body.currentWeight, 55, 110, 0.9, 1.15) ?? 1),
    aura: round3(fin(attrs.constancia) === null ? 0 : clamp01(fin(attrs.constancia) / 100)),
    unlocks,
    tint: pick(avatar.tint, TINTS, DEFAULT_AVATAR.tint),
    hair: pick(avatar.hair, HAIRS, DEFAULT_AVATAR.hair),
    beard: pick(avatar.beard, BEARDS, DEFAULT_AVATAR.beard),
  };
}
