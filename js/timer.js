// Timer de descanso: overlay a pantalla completa, wake lock, audio silencioso, alarma y notificación.
import { clampRest } from './model.js';

export const remainingMs = (endAt, now) => Math.max(0, Number(endAt) - Number(now));
export const shouldFire = (endAt, now, fired) => !fired && Number(now) >= Number(endAt);
export function fmtMMSS(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const KEY = 'restEndAt';
const hasDOM = typeof document !== 'undefined';
const state = { endAt: 0, fired: false, tick: null, wake: null, silent: null, audioCtx: null, label: '' };
const $ = (id) => document.getElementById(id);

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ endAt: state.endAt, label: state.label })); } catch {}
}
function forget() {
  try { localStorage.removeItem(KEY); } catch {}
}

export async function requestNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
  } catch {}
}

export function startRest(seconds, { label = 'Descanso' } = {}) {
  const sec = clampRest(seconds);
  state.endAt = Date.now() + sec * 1000;
  state.fired = false;
  state.label = label;
  persist();
  requestNotifyPermission();
  keepAwake();
  startSilentAudio();
  showOverlay();
  loop();
}

export function adjustRest(deltaSec) {
  if (!state.endAt) return;
  const remaining = remainingMs(state.endAt, Date.now()) / 1000;
  const next = clampRest(remaining + deltaSec);
  state.endAt = Date.now() + next * 1000;
  state.fired = false;
  $('rest-overlay')?.classList.remove('done');
  if ($('rest-title')) $('rest-title').textContent = 'Descanso';
  persist();
  keepAwake();
  loop();
}

export function skipRest() {
  stop();
  hideOverlay();
}

export function restoreRest() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const { endAt, label } = JSON.parse(raw);
    state.endAt = Number(endAt) || 0;
    state.label = label || 'Descanso';
    state.fired = false;
    showOverlay();
    loop();
    return true;
  } catch {
    return false;
  }
}

export function isResting() {
  return !!state.endAt && !state.fired;
}

function loop() {
  clearInterval(state.tick);
  state.tick = setInterval(draw, 250);
  draw();
}

function draw() {
  if (!hasDOM) return;
  const now = Date.now();
  const ms = remainingMs(state.endAt, now);
  const t = $('rest-time');
  if (t) t.textContent = fmtMMSS(ms);
  if (shouldFire(state.endAt, now, state.fired)) fire();
}

function fire() {
  state.fired = true;
  clearInterval(state.tick);
  alarm();
  vibrate();
  notify();
  $('rest-overlay')?.classList.add('done');
  if ($('rest-title')) $('rest-title').textContent = 'Descanso terminado';
  stopSilentAudio();
  releaseWake();
  forget();
}

function stop() {
  clearInterval(state.tick);
  state.endAt = 0;
  state.fired = false;
  stopSilentAudio();
  releaseWake();
  forget();
}

function showOverlay() {
  const o = $('rest-overlay');
  if (!o) return;
  o.classList.remove('done');
  if ($('rest-label')) $('rest-label').textContent = state.label;
  if ($('rest-title')) $('rest-title').textContent = 'Descanso';
  o.hidden = false;
}
function hideOverlay() {
  const o = $('rest-overlay');
  if (o) o.hidden = true;
}

// ---- pantalla encendida ----
async function keepAwake() {
  try {
    if (state.wake && !state.wake.released) return;
    state.wake = await navigator.wakeLock?.request('screen');
  } catch { state.wake = null; }
}
function releaseWake() {
  try { state.wake?.release?.(); } catch {}
  state.wake = null;
}

// ---- audio ----
function silentWavDataUri() {
  const rate = 8000, seconds = 1, n = rate * seconds;
  const buf = new Uint8Array(44 + n);
  const view = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  str(36, 'data'); view.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
function startSilentAudio() {
  try {
    if (!state.silent) {
      state.silent = new Audio(silentWavDataUri());
      state.silent.loop = true;
      state.silent.volume = 0.01;
    }
    state.silent.play().catch(() => {});
  } catch {}
}
function stopSilentAudio() {
  try { state.silent?.pause(); } catch {}
}
function alarm() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.37);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.37 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.37 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.37);
      osc.stop(t0 + i * 0.37 + 0.25);
    }
  } catch {}
}
function vibrate() {
  try { navigator.vibrate?.([300, 100, 300, 100, 600]); } catch {}
}
async function notify() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const opts = { body: state.label, tag: 'rest', renotify: true, vibrate: [300, 100, 300], icon: 'assets/icons/icon-192.png' };
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification('Descanso terminado', opts);
    else new Notification('Descanso terminado', opts);
  } catch {}
}

// ---- wiring ----
if (hasDOM) {
  const wire = () => {
    $('rest-minus')?.addEventListener('click', () => adjustRest(-30));
    $('rest-plus')?.addEventListener('click', () => adjustRest(30));
    $('rest-skip')?.addEventListener('click', () => skipRest());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.endAt) { keepAwake(); draw(); }
  });
}
