// Temporizador manual: widget fijo sobre las pestañas + panel con presets, de 00:00 a 10:00.
// Alarma a prueba de teléfono: el audio se desbloquea en el toque, el sonido va en un <audio> en loop hasta que
// el usuario lo detiene, con bips de Web Audio programados como respaldo, más vibración y notificación.
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

// Alarma como archivo WAV (16 bits, 22050 Hz): seis bips alternados y una pausa corta, para reproducir en loop.
export function alarmWavDataUri() {
  const sr = 22050;
  const beep = 0.22, gap = 0.13, n = 6, tail = 0.6;
  const total = n * (beep + gap) + tail;
  const frames = Math.ceil(total * sr);
  const buf = new Uint8Array(44 + frames * 2);
  const view = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < n; i++) {
    const f = i % 2 === 0 ? 880 : 1175;
    const start = Math.floor(i * (beep + gap) * sr);
    const len = Math.floor(beep * sr);
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      const env = Math.min(1, t / 0.01) * Math.min(1, (beep - t) / 0.04);
      view.setInt16(44 + (start + k) * 2, Math.round(Math.sin(2 * Math.PI * f * t) * 0.9 * env * 32767), true);
    }
  }
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

// ---------- modelo puro del temporizador ----------
export function timerModel(initialSec = 300) {
  let totalSec = clampRest(initialSec);
  let status = 'idle';
  let endAt = 0;
  let pausedRemainingMs = totalSec * 1000;
  const api = {
    set(sec) { totalSec = clampRest(sec); status = 'idle'; pausedRemainingMs = totalSec * 1000; },
    adjust(deltaSec, now = 0) {
      if (status === 'running') {
        const rem = Math.max(0, endAt - now) / 1000;
        endAt = now + clampRest(rem + deltaSec) * 1000;
      } else if (status === 'paused') {
        pausedRemainingMs = clampRest(pausedRemainingMs / 1000 + deltaSec) * 1000;
      } else {
        api.set(totalSec + deltaSec);
      }
    },
    start(now) {
      if (status === 'running') return false;
      const rem = status === 'paused' ? pausedRemainingMs : totalSec * 1000;
      if (rem <= 0) return false;
      endAt = now + rem;
      status = 'running';
      return true;
    },
    pause(now) {
      if (status !== 'running') return;
      pausedRemainingMs = Math.max(0, endAt - now);
      status = 'paused';
    },
    reset() { status = 'idle'; pausedRemainingMs = totalSec * 1000; },
    get(now) {
      if (status === 'running') {
        const rem = Math.max(0, endAt - now);
        return { status: rem > 0 ? 'running' : 'done', remainingMs: rem, totalSec };
      }
      if (status === 'paused') return { status: 'paused', remainingMs: pausedRemainingMs, totalSec };
      return { status: 'idle', remainingMs: totalSec * 1000, totalSec };
    },
    snapshot() { return { totalSec, status, endAt, pausedRemainingMs }; },
    restore(snap) {
      if (!snap) return;
      totalSec = clampRest(snap.totalSec);
      status = ['running', 'paused'].includes(snap.status) ? snap.status : 'idle';
      endAt = Number(snap.endAt) || 0;
      pausedRemainingMs = Number.isFinite(Number(snap.pausedRemainingMs)) ? Number(snap.pausedRemainingMs) : totalSec * 1000;
    },
  };
  return api;
}

// ---------- estado de la UI ----------
const KEY = 'timer.v2';
const LAST_KEY = 'timer.last';
const hasDOM = typeof document !== 'undefined';
const model = timerModel(300);
const state = { tick: null, fired: false, wake: null, silent: null, alarmEl: null, alarmPrimed: false, audioCtx: null, alarmBuffer: null, scheduled: [], label: 'Temporizador' };
const $ = (id) => (hasDOM ? document.getElementById(id) : null);

function persist() {
  try {
    const s = model.snapshot();
    if (s.status === 'idle') localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(LAST_KEY, String(s.totalSec));
  } catch {}
}

export async function requestNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
  } catch {}
  updateStatus();
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
}

// ---------- API pública ----------
export function getTimer() { return model.get(Date.now()); }
export function isResting() { return model.get(Date.now()).status === 'running'; }

export function setTimer(sec) {
  stopAlarmLoop();
  cancelScheduled();
  state.fired = false;
  model.set(sec);
  persist();
  draw();
}

export function adjustTimer(deltaSec) {
  const now = Date.now();
  const st = model.get(now).status;
  if (st === 'done') { model.reset(); stopAlarmLoop(); state.fired = false; }
  model.adjust(deltaSec, now);
  if (model.get(now).status === 'running') scheduleAlarm(model.get(now).remainingMs / 1000);
  persist();
  draw();
}

export function startTimer() {
  const now = Date.now();
  if (model.get(now).status === 'done') { model.reset(); stopAlarmLoop(); }
  state.fired = false;
  unlockAudio();
  requestNotifyPermission();
  if (!model.start(now)) { draw(); return false; }
  keepAwake();
  startSilentAudio();
  scheduleAlarm(model.get(now).remainingMs / 1000);
  persist();
  loop();
  return true;
}

export function pauseTimer() {
  model.pause(Date.now());
  cancelScheduled();
  releaseWake();
  persist();
  draw();
}

export function resetTimer() {
  clearInterval(state.tick);
  state.tick = null;
  model.reset();
  state.fired = false;
  cancelScheduled();
  stopAlarmLoop();
  stopSilentAudio();
  releaseWake();
  persist();
  draw();
}

export function openTimer() {
  const sheet = $('rest-overlay');
  if (!sheet) return;
  sheet.hidden = false;
  document.addEventListener('pointerdown', onFirstTouch, { once: true });
  draw();
}

export function closeTimer() {
  const sheet = $('rest-overlay');
  if (sheet) sheet.hidden = true;
  if (model.get(Date.now()).status === 'done') resetTimer();
}

export function toggleTimer() {
  const sheet = $('rest-overlay');
  if (!sheet) return;
  if (sheet.hidden) openTimer(); else closeTimer();
}

// Compatibilidad: arrancar directo con una duración y abrir el panel.
export function startRest(seconds, { label = 'Temporizador' } = {}) {
  state.label = label;
  setTimer(seconds);
  openTimer();
  startTimer();
}
export const adjustRest = adjustTimer;
export function skipRest() { resetTimer(); closeTimer(); }

// Al abrir la app: si había un temporizador corriendo o pausado, se retoma (si ya venció, suena al primer toque).
export function restoreRest() {
  try {
    const last = Number(localStorage.getItem(LAST_KEY));
    if (Number.isFinite(last) && last > 0) model.set(last);
    const raw = localStorage.getItem(KEY);
    if (!raw) { draw(); return false; }
    model.restore(JSON.parse(raw));
    const st = model.get(Date.now()).status;
    if (st === 'running' || st === 'done') { openTimer(); loop(); }
    else draw();
    return true;
  } catch {
    return false;
  }
}
export const restoreTimer = restoreRest;

function onFirstTouch() {
  unlockAudio();
  const st = model.get(Date.now());
  if (st.status === 'done' && state.fired) { playAlarmLoop(); return; }
  if (st.status === 'running') scheduleAlarm(st.remainingMs / 1000);
  updateStatus();
}

// Suena la alarma un par de segundos, para probar el volumen del teléfono desde Ajustes.
export function testAlarm() {
  unlockAudio();
  const el = getAlarmEl();
  if (!el) return false;
  el.loop = false;
  el.currentTime = 0;
  el.play().catch(() => {});
  setTimeout(() => { try { el.pause(); el.currentTime = 0; el.loop = true; } catch {} }, 2600);
  return true;
}

export function debugAudio() {
  return {
    ctxState: state.audioCtx?.state ?? null,
    scheduled: state.scheduled.length,
    hasBuffer: !!state.alarmBuffer,
    primed: state.alarmPrimed,
    loopPlaying: !!state.alarmEl && !state.alarmEl.paused && state.alarmEl.loop,
    status: model.get(Date.now()).status,
  };
}

// ---------- loop y dibujo ----------
function loop() {
  clearInterval(state.tick);
  state.tick = setInterval(draw, 250);
  draw();
}

function draw() {
  if (!hasDOM) return;
  const now = Date.now();
  const st = model.get(now);
  const time = fmtMMSS(st.remainingMs);
  const t = $('rest-time');
  if (t) t.textContent = time;
  const pill = $('timer-pill');
  if (pill) {
    pill.textContent = st.status === 'running' ? `⏱ ${time}` : st.status === 'paused' ? `⏸ ${time}` : st.status === 'done' ? '⏰ ¡Tiempo!' : '⏱ Temporizador';
    pill.dataset.status = st.status;
  }
  const startBtn = $('rest-start');
  if (startBtn) startBtn.textContent = st.status === 'running' ? 'Pausar' : st.status === 'paused' ? 'Reanudar' : st.status === 'done' ? 'Otra vez' : 'Iniciar';
  const skip = $('rest-skip');
  if (skip) skip.textContent = st.status === 'done' ? 'Detener alarma' : 'Cerrar';
  const sheet = $('rest-overlay');
  if (sheet) sheet.classList.toggle('done', st.status === 'done');
  const title = $('rest-title');
  if (title) title.textContent = st.status === 'done' ? '¡Tiempo cumplido!' : st.status === 'running' ? 'Corriendo' : st.status === 'paused' ? 'En pausa' : 'Elegí el tiempo';
  for (const b of document.querySelectorAll('[data-preset]')) b.classList.toggle('on', st.status === 'idle' && Number(b.dataset.preset) === st.totalSec);
  if (st.status === 'done' && !state.fired) fire();
  if (st.status !== 'running' && st.status !== 'done') { clearInterval(state.tick); state.tick = null; }
}

function fire() {
  state.fired = true;
  clearInterval(state.tick);
  state.tick = null;
  try { state.audioCtx?.resume?.(); } catch {}
  playAlarmLoop();
  vibrate();
  notify();
  openTimer();
  releaseWake();
  persist();
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
  const sound = state.audioCtx?.state === 'running' ? 'Sonido listo.' : 'Tocá Iniciar para habilitar el sonido.';
  el.textContent = `${sound} ${st.text}`;
  if (btn) btn.hidden = st.key !== 'ask';
}

// ---------- pantalla encendida ----------
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

// ---------- audio ----------
function getCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    return state.audioCtx;
  } catch { return null; }
}
function getAlarmEl() {
  try {
    if (!state.alarmEl) {
      state.alarmEl = new Audio(alarmWavDataUri());
      state.alarmEl.loop = true;
      state.alarmEl.preload = 'auto';
      state.alarmEl.volume = 1;
      state.alarmEl.setAttribute('playsinline', '');
    }
    return state.alarmEl;
  } catch { return null; }
}
function primeAlarmEl() {
  const el = getAlarmEl();
  if (!el || state.alarmPrimed) return;
  const done = () => { try { el.pause(); el.currentTime = 0; } catch {} el.muted = false; state.alarmPrimed = true; };
  try {
    el.muted = true;
    const p = el.play();
    if (p && p.then) p.then(done).catch(() => { el.muted = false; });
    else done();
  } catch { el.muted = false; }
}
function playAlarmLoop() {
  const el = getAlarmEl();
  if (!el) return;
  try {
    el.loop = true;
    el.currentTime = 0;
    const p = el.play();
    if (p && p.then) p.then(() => cancelScheduled()).catch(() => { if (!state.scheduled.length) scheduleAlarm(0); });
    else cancelScheduled();
  } catch {
    if (!state.scheduled.length) scheduleAlarm(0);
  }
}
function stopAlarmLoop() {
  try { if (state.alarmEl) { state.alarmEl.pause(); state.alarmEl.currentTime = 0; } } catch {}
}
function unlockAudio() {
  primeAlarmEl();
  const ctx = getCtx();
  if (!ctx) return;
  try { if (ctx.state !== 'running') ctx.resume().then(updateStatus).catch(() => {}); } catch {}
  if (!state.alarmBuffer) state.alarmBuffer = buildAlarmBuffer(ctx);
  updateStatus();
}
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
function scheduleAlarm(remainingSec) {
  cancelScheduled();
  const ctx = state.audioCtx;
  if (!ctx || !state.alarmBuffer) return;
  const t0 = ctx.currentTime;
  for (const off of alarmOffsets(remainingSec)) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = state.alarmBuffer;
      src.connect(ctx.destination);
      src.start(t0 + off);
      state.scheduled.push(src);
    } catch {}
  }
}
function silentWavDataUri() {
  const rate = 8000, n = rate;
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
function vibrate() {
  try { navigator.vibrate?.([300, 100, 300, 100, 600]); } catch {}
}
async function notify() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const opts = { body: 'Se cumplió el tiempo del temporizador', tag: 'timer', renotify: true, vibrate: [300, 100, 300], icon: 'assets/icons/icon-192.png' };
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification('¡Tiempo cumplido!', opts);
    else new Notification('¡Tiempo cumplido!', opts);
  } catch {}
}

// ---------- wiring ----------
if (hasDOM) {
  const wire = () => {
    $('timer-pill')?.addEventListener('click', toggleTimer);
    $('rest-minus')?.addEventListener('click', () => adjustTimer(-30));
    $('rest-plus')?.addEventListener('click', () => adjustTimer(30));
    $('rest-start')?.addEventListener('click', () => { const st = model.get(Date.now()).status; if (st === 'running') pauseTimer(); else startTimer(); });
    $('rest-reset')?.addEventListener('click', () => resetTimer());
    $('rest-skip')?.addEventListener('click', () => { const st = model.get(Date.now()).status; if (st === 'done') resetTimer(); closeTimer(); });
    $('rest-notify')?.addEventListener('click', () => { unlockAudio(); requestNotifyPermission(); });
    for (const b of document.querySelectorAll('[data-preset]')) b.addEventListener('click', () => { unlockAudio(); setTimer(Number(b.dataset.preset)); });
    draw();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const st = model.get(Date.now()).status;
      if (st === 'running' || st === 'done') { keepAwake(); try { state.audioCtx?.resume?.(); } catch {} loop(); }
    }
  });
}
