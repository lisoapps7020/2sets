#!/usr/bin/env node
// Abre una URL en Chrome headless, espera una condición y evalúa una expresión.
// Uso: node tools/headless.mjs <url> [--wait "<js expr>"] [--eval "<js expr>"] [--timeout 15000] [--width 390] [--height 844]
// Imprime el resultado de --eval y los errores de consola. Sale con 1 si hubo excepciones o se venció el tiempo.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const waitExpr = opt('--wait', 'true');
const evalExpr = opt('--eval', 'document.body.innerText');
const timeout = Number(opt('--timeout', 15000));
const width = Number(opt('--width', 390));
const height = Number(opt('--height', 844));
if (!url) { console.error('falta la url'); process.exit(2); }

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const exe = process.env.CHROME || CANDIDATES.find((p) => existsSync(p));
if (!exe) { console.error('no se encontró Chrome ni Edge'); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), '2sets-headless-'));
const chrome = spawn(exe, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${width},${height}`,
  '--hide-scrollbars', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) resolve(m[1]);
  });
  chrome.on('exit', () => reject(new Error('chrome salió antes de escuchar')));
  setTimeout(() => reject(new Error('chrome no arrancó')), 10000);
});

const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
const consoleLines = [];
const exceptions = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    consoleLines.push(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.exception?.description || d.text || JSON.stringify(d));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') consoleLines.push(`[log:error] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  if (msg.method === 'Page.javascriptDialogOpening') {
    consoleLines.push(`[dialog:${msg.params.type}] ${msg.params.message}`);
    ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url });

const start = Date.now();
let ready = false;
while (Date.now() - start < timeout) {
  try { if (await evaluate(`!!(${waitExpr})`)) { ready = true; break; } } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const scriptPath = opt('--script', null);
let value;
if (scriptPath) {
  const { readFileSync } = await import('node:fs');
  const body = readFileSync(scriptPath, 'utf8');
  try { value = await evaluate(`(async () => { ${body} })()`); } catch (e) { exceptions.push(`script: ${e.message}`); }
} else {
  try { value = await evaluate(evalExpr); } catch (e) { exceptions.push(`eval: ${e.message}`); }
}
const shot = opt('--shot', null);
if (shot) {
  const { writeFileSync } = await import('node:fs');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (r.result?.data) { writeFileSync(shot, Buffer.from(r.result.data, 'base64')); console.log(`--- screenshot: ${shot} ---`); }
}
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
if (consoleLines.length) console.log('--- console ---\n' + consoleLines.join('\n'));
if (exceptions.length) console.log('--- exceptions ---\n' + exceptions.join('\n'));
if (!ready) console.log(`--- timeout: la condición de espera no se cumplió en ${timeout} ms ---`);
ws.close();
chrome.kill();
process.exit(ready && exceptions.length === 0 ? 0 : 1);
