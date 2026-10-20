/* 用 CDP 在真实手机视口下截图（解决 Edge headless 窗口最小宽度把布局撑宽的问题）
 * 用法：node tools/shot.cjs <url> <out.png> [width] [height] [dpr]
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const url = process.argv[2] || 'http://qint.top/brick/';
const out = process.argv[3] || path.join(__dirname, '..', '_shot.png');
const W = Number(process.argv[4] || 390);
const H = Number(process.argv[5] || 844);
const DPR = Number(process.argv[6] || 2);
const EXPR = process.argv[7] || '';
const WAIT = Number(process.argv[8] || 1400);
const PORT = 9333;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(os.tmpdir(), 'edge-cdp-' + Date.now());

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function jsonGet(p) {
  const r = await fetch('http://127.0.0.1:' + PORT + p);
  return r.json();
}

(async () => {
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await jsonGet('/json/version'); break; } catch (e) { await sleep(150); }
  }
  if (!version) { console.error('浏览器没起来'); proc.kill(); process.exit(1); }

  const target = await fetch(
    'http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'),
    { method: 'PUT' }
  ).then(r => r.json());

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg.method);
    }
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, (m) => m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
  });

  await new Promise(r => ws.addEventListener('open', r));

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: DPR, mobile: true
  });
  await send('Emulation.setScrollbarsHidden', { hidden: true });
  await send('Page.navigate', { url });

  for (let i = 0; i < 100; i++) {
    if (events.includes('Page.loadEventFired')) break;
    await sleep(100);
  }
  await sleep(600);

  if (EXPR) {
    await send('Runtime.enable');
    const ev = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
    if (ev && ev.result && ev.result.value !== undefined) console.log('eval:', JSON.stringify(ev.result.value));
    await sleep(WAIT);
  }

  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
  console.log('saved ' + out + '  ' + W + 'x' + H + ' @' + DPR + 'x');

  ws.close();
  proc.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
