// Helpers de DOM y formato. Sin dependencias.
import { EXERCISES } from './model.js';

// Texto corto de un PR: 'Fondos S1 · +25 kg'
export function prText(pr) {
  const ex = EXERCISES[pr.exerciseId]?.short || pr.exerciseId;
  const slot = `S${Number(pr.slot) + 1}`;
  const v = pr.value;
  const what = pr.type === 'maxAdded' ? `+${fmtKg(v)}`
    : pr.type === 'maxTotal' ? `${fmtKg(v)} total`
    : pr.type === 'maxE1RM' ? `1RM ${fmtKg(Math.round(v))}`
    : `${fmtNum(v)} reps PC`;
  return `${ex} ${slot} · ${what}`;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function fmtKg(n) {
  const v = Number(n) || 0;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  return `${s} kg`;
}

export function fmtNum(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

export function todayISO(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fmtDate(iso, { weekday = true } = {}) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const date = new Date(y, m - 1, d);
  const base = `${d} de ${MONTHS[m - 1]}`;
  return weekday ? `${DAYS[date.getDay()]} ${base}` : base;
}

export function fmtMonth(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtShortDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// Texto corto de una carga: 'PC', '+20 kg', 'Banda Roja (−15 kg)'
export function loadText(load, bandsById = {}) {
  if (!load) return 'PC';
  if (load.mode === 'weight') return `+${fmtKg(load.kg)}`;
  if (load.mode === 'band') {
    const b = bandsById[load.bandId];
    return b ? `Banda ${b.name} (−${fmtKg(b.assistKg)})` : 'Banda';
  }
  return 'PC';
}

export function toast(msg, kind = 'info') {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: `toast toast-${kind}`, role: 'status' }, msg);
  host.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

export function confirmDialog(msg) {
  return Promise.resolve(window.confirm(msg));
}

export function debounce(fn, ms = 300) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
