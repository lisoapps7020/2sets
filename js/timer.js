// Timer de descanso: overlay a pantalla completa, wake lock, audio silencioso, alarma y notificación.
//
// Sonido: el contexto de audio se crea y desbloquea en el toque de "Listo" (los teléfonos exigen un gesto),
// y la alarma se programa en la línea de tiempo del audio para que suene aunque el sistema congele el JavaScript
// con la pantalla bloqueada. Se repite tres veces hasta que el usuario cierra el descanso.
import { clampRest } from './model.js';

export const remainingMs = (endAt, now) => Math.max(0, Number(endAt) - Number(now));
export const shouldFire = (endAt, now, fired) => !fired && Number(now) >= Number(endAt);
export function fmtMMSS(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Momentos (en segundos desde ahora) en los que suena la alarma: al terminar y dos repeticiones.
export function alarmOffsets(remainingSec, repeats = 3, gapSec = 8) {
  const r = Math.max(0, Number(remainingSec) || 0);
  return Array.from({ length: repeats }, (_, i) => r + i * gapSec);
}

// Texto del estado de las notificaciones.
export function notifyStatus(permission, hasNotification, isStandalone) {
  if (!hasNotification) {
    return isStandalone
      ? { key: 'unsupported', text: 'Este navegador no permite notificaciones. La alarma suena igual.' }
      : { key: 'install', text: 'Para avisos con la pantalla bloqueada, instalá la app en la pantalla de inicio.' };
  }
  if (permission === 'granted') return { key: 'on', text: 'Notificaciones activas.' };
  if (permission === 'denied') return { key: 'blocked', text: 'Notificaciones bloqueadas: activalas para este sitio en los ajustes del navegador.' };
  return { key: 'ask', text: 'Activá las notificaciones para que el aviso llegue con la pantalla bloqueada.' };
}

const KEY = 'restEndAt';
const hasDOM = typeof document !== 'undefined';
const state = { endAt: 0, fired: false, tick: null, wake: null, silent: null, audioCtx: null, alarmBuffer: null, scheduled: [], label: '' };
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
  updateStatus();
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
}

export function startRest(seconds, { label = 'Descanso' } = {}) {
  const sec = clampRest(seconds);
  state.endAt = Date.now() + sec * 1000;
  state.fired = false;
  state.label = label;
  persist();
  unlockAudio();
  requestNotifyPermission();
  keepAwake();
  startSilentAudio();
  scheduleAlarm(sec);
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
  unlockAudio();
  scheduleAlarm(next);
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
    // Tras una recarga no hay gesto: el sonido se habilita con el primer toque en la pantalla.
    document.addEventListener('pointerdown', onFirstTouch, { once: true });
    loop();
    return true;
  } catch {
    return false;
  }
}

function onFirstTouch() {
  if (!state.endAt || state.fired) return;
  unlockAudio();
  scheduleAlarm(remainingMs(state.endAt, Date.now()) / 1000);
  updateStatus();
}

export function isResting() {
  return !!state.endAt && !state.fired;
}

export function debugAudio() {
  return { ctxState: state.audioCtx?.state ?? null, scheduled: state.scheduled.length, hasBuffer: !!state.alarmBuffer };
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
  // El sonido ya está programado en el audio; si el contexto quedó suspendido, al reanudar arranca de inmediato.
  try { state.audioCtx?.resume?.(); } catch {}
  if (!state.scheduled.length) scheduleAlarm(0);
  vibrate();
  notify();
  $('rest-overlay')?.classList.add('done');
  if ($('rest-title')) $('rest-title').textContent = 'Descanso terminado';
  releaseWake();
  forget();
}

function stop() {
  clearInterval(state.tick);
  state.endAt = 0;
  state.fired = false;
  cancelScheduled();
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
  updateStatus();
}
function hideOverlay() {
  const o = $('rest-overlay');
  if (o) o.hidden = true;
}

function isStandalone() {
  try { return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; }
}

function updateStatus() {
  if (!hasDOM) return;
  const el = $('rest-status');
  const btn = $('rest-notify');
  if (!el) return;
  const hasN = typeof Notification !== 'undefined';
  const st = notifyStatus(hasN ? Notification.permission : 'default', hasN, isStandalone());
  const sound = state.audioCtx?.state === 'running' ? 'Sonido listo.' : 'Tocá la pantalla para habilitar el sonido.';
  el.textContent = `${sound} ${st.text}`;
  if (btn) btn.hidden = st.key !== 'ask';
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
function getCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    return state.audioCtx;
  } catch { return null; }
}

// Crea o reanuda el contexto de audio. Solo tiene efecto real dentro de un gesto del usuario.
function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  try { if (ctx.state !== 'running') ctx.resume().then(updateStatus).catch(() => {}); } catch {}
  if (!state.alarmBuffer) state.alarmBuffer = buildAlarmBuffer(ctx);
  updateStatus();
}

// Seis bips alternados (880 y 1175 Hz), unos 2 segundos, con envolvente para que no chasqueen.
function buildAlarmBuffer(ctx) {
  const sr = ctx.sampleRate;
  const beep = 0.22, gap = 0.13, n = 6;
  const total = n * (beep + gap);
  const buf = ctx.createBuffer(1, Math.ceil(total * sr), sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const f = i % 2 === 0 ? 880 : 1175;
    const start = Math.floor(i * (beep + gap) * sr);
    const len = Math.floor(beep * sr);
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      const env = Math.min(1, t / 0.01) * Math.min(1, (beep - t) / 0.04);
      data[start + k] = Math.sin(2 * Math.PI * f * t) * 0.85 * env;
    }
  }
  return buf;
}

function cancelScheduled() {
  for (const src of state.scheduled) { try { src.stop(); } catch {} }
  state.scheduled = [];
}

// Programa la alarma en la línea de tiempo del audio: al terminar y dos repeticiones más.
function scheduleAlarm(remainingSec) {
  cancelScheduled();
  const ctx = state.audioCtx;
  if (!ctx || !state.alarmBuffer) return;
  const t0 = ctx.currentTime;
  for (const off of alarmOffsets(remainingSec)) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = state.alarmBuffer;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain).connect(ctx.destination);
      src.start(t0 + off);
      state.scheduled.push(src);
    } catch {}
  }
}

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
// Audio silencioso en loop: mantiene viva la sesión de audio con la pantalla bloqueada (sobre todo en iPhone).
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
    $('rest-notify')?.addEventListener('click', () => { unlockAudio(); requestNotifyPermission(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.endAt) {
      keepAwake();
      try { state.audioCtx?.resume?.(); } catch {}
      draw();
    }
  });
}
