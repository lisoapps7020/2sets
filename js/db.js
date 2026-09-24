// Persistencia local en IndexedDB. Todo devuelve promesas y propaga errores.
import { EXTRA_SEEDS, BAND_SEEDS, uid } from './templates.js';

const DB_NAME = 'twosets';
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 2;
export const STORES = ['settings', 'bodyweight', 'bands', 'extras', 'sessions', 'measurements'];

export const DEFAULT_GOAL = { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null };
export const DEFAULT_AVATAR = { tint: 'blanco', hair: 'short', beard: 'none' };

export const DEFAULT_PROFILE = {
  name: '',
  unit: 'kg',
  incrementKg: { dips: 5, pullups: 5, second: 2.5 },
  restMainSec: 300,
  restApproachSec: 180,
  theme: 'auto',
  sex: 'm',
  heightCm: null,
  goal: { ...DEFAULT_GOAL },
  avatar: { ...DEFAULT_AVATAR },
  schemaVersion: SCHEMA_VERSION,
};

let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      for (const s of ['bodyweight', 'bands', 'extras']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('measurements')) {
        db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('date', 'date');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Otra pestaña pide una versión más nueva: cerramos para no bloquearla y reabrimos en la próxima llamada.
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error || new Error('No se pudo abrir la base')); };
    req.onblocked = () => { dbp = null; reject(new Error('Base bloqueada por otra pestaña')); };
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error || new Error('Error de base de datos'));
    t.onabort = () => reject(t.error || new Error('Operación cancelada'));
  }));
}

export const get = (store, key) => tx(store, 'readonly', (st) => st.get(key));
export const put = (store, value) => tx(store, 'readwrite', (st) => st.put(value));
export const del = (store, key) => tx(store, 'readwrite', (st) => st.delete(key));
export const getAll = (store) => tx(store, 'readonly', (st) => st.getAll());
export const clear = (store) => tx(store, 'readwrite', (st) => st.clear());

export async function getProfile() {
  const row = await get('settings', 'profile');
  const v = row?.value || {};
  return {
    ...DEFAULT_PROFILE,
    ...v,
    incrementKg: { ...DEFAULT_PROFILE.incrementKg, ...(v.incrementKg || {}) },
    goal: { ...DEFAULT_GOAL, ...(v.goal || {}) },
    avatar: { ...DEFAULT_AVATAR, ...(v.avatar || {}) },
  };
}

export const saveProfile = (p) => put('settings', { key: 'profile', value: p });

export async function latestBodyweight() {
  const all = await getAll('bodyweight');
  return all.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export async function bodyweightFor(dateISO) {
  const all = (await getAll('bodyweight')).sort((a, b) => a.date.localeCompare(b.date));
  let best = null;
  for (const r of all) if (r.date <= dateISO) best = r;
  return (best || all[0])?.kg ?? null;
}

export async function listSessions() {
  const all = await getAll('sessions');
  return all.sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));
}

export async function activeSession() {
  return (await getAll('sessions')).find((s) => s.status === 'active') || null;
}

export const saveSession = (s) => put('sessions', s);
export const deleteSession = (id) => del('sessions', id);

export async function bandsById() {
  return Object.fromEntries((await getAll('bands')).map((b) => [b.id, b]));
}

export async function listExtras() {
  return (await getAll('extras')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMeasurements() {
  return (await getAll('measurements')).sort((a, b) => b.date.localeCompare(a.date));
}

export async function latestMeasurement() {
  return (await listMeasurements())[0] || null;
}

export async function ensureSeeds() {
  const seeded = await get('settings', 'seeded');
  if (seeded) return;
  for (const e of EXTRA_SEEDS) await put('extras', { id: uid('ex'), archived: false, ...e });
  for (const b of BAND_SEEDS) await put('bands', { id: uid('band'), ...b });
  await put('settings', { key: 'seeded', value: true });
}

export async function exportAll() {
  const [settings, bodyweight, bands, extras, sessions, measurements] = await Promise.all(STORES.map(getAll));
  return { app: '2sets', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings, bodyweight, bands, extras, sessions, measurements };
}

export function validateExport(d) {
  if (!d || typeof d !== 'object' || d.app !== '2sets') return { ok: false, error: 'El archivo no es un backup de 2 Sets.' };
  if (!Number.isInteger(d.schemaVersion) || d.schemaVersion < 1) return { ok: false, error: 'El backup no tiene una versión válida.' };
  if (d.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'El backup es de una versión más nueva de la app.' };
  for (const s of STORES) {
    if (d[s] !== undefined && !Array.isArray(d[s])) return { ok: false, error: `Sección inválida en el backup: ${s}.` };
  }
  return { ok: true };
}

// Lleva cualquier backup válido al esquema actual. v1 → v2: agrega mediciones vacías.
export function migrate(d) {
  const out = { ...d, schemaVersion: SCHEMA_VERSION };
  for (const s of STORES) out[s] = Array.isArray(d[s]) ? d[s] : [];
  return out;
}

export async function importAll(d) {
  const v = validateExport(d);
  if (!v.ok) throw new Error(v.error);
  const data = migrate(d);
  for (const s of STORES) {
    await clear(s);
    for (const row of data[s]) await put(s, row);
  }
  // Un backup es la verdad completa: no volver a sembrar bandas ni complementarios encima.
  if (!data.settings.some((r) => r?.key === 'seeded')) await put('settings', { key: 'seeded', value: true });
}
