// Plantillas de sesión, nombres de bloques y datos semilla.
import { MAIN_BY_DAY, SECOND_BY_DAY, makeSet } from './model.js';

export const WARMUP_ITEMS = ['Articulaciones', 'Estiramiento', 'Bombeo suave'];

export const BLOCK_META = {
  warmup:   { title: 'Ignis',        subtitle: 'Entrada en calor' },
  approach: { title: 'Aproximación', subtitle: '2 series de 5, carga libre' },
  main:     { title: 'Duo',          subtitle: 'Dos series al fallo' },
  second:   { title: 'Secundus',     subtitle: '2 series de 12 a 15 al fallo' },
  extra:    { title: 'Extra',        subtitle: 'Complementarios opcionales' },
};

export const EXTRA_SEEDS = [
  { name: 'Elevaciones laterales', day: 'any' },
  { name: 'Press militar', day: 'push' },
  { name: 'Extensión de tríceps', day: 'push' },
  { name: 'Curl de bíceps', day: 'pull' },
  { name: 'Face pull', day: 'pull' },
  { name: 'Abdominales', day: 'any' },
];

export const BAND_SEEDS = [
  { name: 'Amarilla', color: '#d9b53a', assistKg: 10 },
  { name: 'Roja', color: '#b03a2e', assistKg: 15 },
  { name: 'Negra', color: '#2b2b2b', assistKg: 25 },
  { name: 'Morada', color: '#6b3fa0', assistKg: 35 },
];

export function uid(prefix) {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${r}`;
}

export function newSession({ day, dateISO, bodyweightKg, mainSuggestion, secondSuggestion }) {
  const m = mainSuggestion?.sets || [];
  const sec = secondSuggestion?.load;
  return {
    id: uid('ses'),
    date: dateISO,
    day,
    status: 'active',
    startedAt: Date.now(),
    finishedAt: null,
    bodyweightKg: bodyweightKg ?? null,
    notes: '',
    blocks: {
      warmup: { items: WARMUP_ITEMS.map(() => false) },
      approach: { sets: [makeSet(), makeSet()].map((s) => ({ ...s, reps: 5 })) },
      main: { exerciseId: MAIN_BY_DAY[day], sets: [makeSet(m[0]?.load), makeSet(m[1]?.load)] },
      second: { exerciseId: SECOND_BY_DAY[day], sets: [makeSet(sec), makeSet(sec)] },
      extra: [],
    },
  };
}

export function sessionDuration(s) {
  if (s?.finishedAt == null || s?.startedAt == null) return null;
  return Math.round((s.finishedAt - s.startedAt) / 60000);
}
