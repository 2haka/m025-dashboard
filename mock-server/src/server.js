// Mock backend for Team M025 dashboard.
// Implements docs/contract.md: WebSocket push on /ws + REST on /api/*.
// Simulates helmets that send a heartbeat every second.
//
// Controls (type in the terminal, then Enter):
//   1 / 2   toggle helmet H-01 / H-02 between WORN and REMOVED
//   d1 / d2 drop / restore the link of H-01 / H-02 (stops heartbeats)
//   a       toggle automatic random events on/off
// The same actions are available over HTTP for scripted tests:
//   POST /mock/toggle/H-01    POST /mock/link/H-01

import http from 'node:http';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 4000);
const HEARTBEAT_MS = 1000;
let autoMode = process.env.MOCK_AUTO !== '0';

/** @type {Map<string, {deviceId:string, workerId:string, toolId:string, seq:number, helmetState:'WORN'|'REMOVED', linkUp:boolean, tempC:number}>} */
const devices = new Map([
  ['H-01', { deviceId: 'H-01', workerId: 'W-7F3A', toolId: 'T-01', seq: 0, helmetState: 'WORN', linkUp: true, tempC: 34.2 }],
  ['H-02', { deviceId: 'H-02', workerId: 'W-21C9', toolId: 'T-02', seq: 0, helmetState: 'WORN', linkUp: true, tempC: 34.8 }],
]);

/** Latest status object per device (what GET /api/status returns). */
const latestStatus = new Map();
/** Violation history, newest first. */
const violations = [];

// ---------------------------------------------------------------- WebSocket
const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj) {
  const frame = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(frame);
  }
}

wss.on('connection', (socket, req) => {
  log(`dashboard connected (${req.socket.remoteAddress}) — clients: ${wss.clients.size}`);
  socket.on('close', () => log(`dashboard disconnected — clients: ${wss.clients.size}`));
});

// ---------------------------------------------------------------- Simulation
function emitStatus(dev) {
  dev.seq += 1;
  // Small random drift so the temperature looks alive (non-medical, forehead skin).
  dev.tempC = round1(clamp(dev.tempC + (Math.random() - 0.5) * 0.2, 33.0, 37.5));
  const now = new Date().toISOString();
  const status = {
    type: 'status',
    deviceId: dev.deviceId,
    workerId: dev.workerId,
    toolId: dev.toolId,
    seq: dev.seq,
    helmetState: dev.helmetState,
    toolState: dev.helmetState === 'WORN' ? 'ENABLED' : 'DISABLED',
    tempC: dev.tempC,
    deviceTs: now,
    serverTs: now, // "received & validated" instant — start of the Spec 3 measurement
  };
  latestStatus.set(dev.deviceId, status);
  broadcast(status);
}

function recordViolation(dev, eventType) {
  const now = new Date().toISOString();
  const v = {
    id: randomUUID(),
    deviceId: dev.deviceId,
    workerId: dev.workerId,
    toolId: dev.toolId,
    eventType,
    action: 'TOOL_DISABLED',
    deviceTs: now,
    serverTs: now,
  };
  violations.unshift(v);
  if (violations.length > 1000) violations.pop();
  broadcast({ type: 'violation', violation: v });
}

function toggleHelmet(id) {
  const dev = devices.get(id);
  if (!dev) return false;
  dev.helmetState = dev.helmetState === 'WORN' ? 'REMOVED' : 'WORN';
  log(`${id} → ${dev.helmetState}`);
  if (dev.linkUp) emitStatus(dev); // push immediately, don't wait for the heartbeat
  if (dev.helmetState === 'REMOVED') recordViolation(dev, 'HELMET_REMOVED');
  return true;
}

function toggleLink(id) {
  const dev = devices.get(id);
  if (!dev) return false;
  dev.linkUp = !dev.linkUp;
  log(`${id} link ${dev.linkUp ? 'restored' : 'DROPPED (heartbeats stopped)'}`);
  if (!dev.linkUp) recordViolation(dev, 'LINK_LOST');
  return true;
}

setInterval(() => {
  for (const dev of devices.values()) if (dev.linkUp) emitStatus(dev);
}, HEARTBEAT_MS);

// Random events so the dashboard is never static during development.
setInterval(() => {
  if (!autoMode) return;
  const ids = [...devices.keys()];
  const id = ids[Math.floor(Math.random() * ids.length)];
  if (Math.random() < 0.8) toggleHelmet(id);
  else {
    toggleLink(id);
    setTimeout(() => toggleLink(id), 6000); // come back after 6 s
  }
}, 8000);

// ---------------------------------------------------------------- REST
function handleHttp(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204);

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, [...latestStatus.values()]);
  }

  if (req.method === 'GET' && url.pathname === '/api/violations') {
    const q = url.searchParams;
    const from = q.get('from') ? Date.parse(q.get('from')) : -Infinity;
    const to = q.get('to') ? Date.parse(q.get('to')) : Infinity;
    const limit = Math.min(Number(q.get('limit') ?? 100), 1000);
    const items = violations
      .filter((v) => !q.get('workerId') || v.workerId === q.get('workerId'))
      .filter((v) => !q.get('toolId') || v.toolId === q.get('toolId'))
      .filter((v) => !q.get('eventType') || v.eventType === q.get('eventType'))
      .filter((v) => {
        const t = Date.parse(v.serverTs);
        return t >= from && t <= to;
      })
      .slice(0, limit);
    return send(res, 200, { items });
  }

  const m = url.pathname.match(/^\/mock\/(toggle|link)\/([\w-]+)$/);
  if (req.method === 'POST' && m) {
    const ok = m[1] === 'toggle' ? toggleHelmet(m[2]) : toggleLink(m[2]);
    return send(res, ok ? 200 : 404, { ok });
  }

  send(res, 404, { error: 'not found' });
}

function send(res, code, body) {
  res.statusCode = code;
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------- Terminal controls
// Always listen: under `npm run dev`, concurrently forwards the terminal input here (--handle-input).
{
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === '1') toggleHelmet('H-01');
    else if (cmd === '2') toggleHelmet('H-02');
    else if (cmd === 'd1') toggleLink('H-01');
    else if (cmd === 'd2') toggleLink('H-02');
    else if (cmd === 'a') {
      autoMode = !autoMode;
      log(`auto mode ${autoMode ? 'ON' : 'OFF'}`);
    } else if (cmd) log('commands: 1 | 2 | d1 | d2 | a');
  });
}

server.listen(PORT, () => {
  log(`mock backend on http://localhost:${PORT}  (ws://localhost:${PORT}/ws)`);
  log(`auto mode ${autoMode ? 'ON' : 'OFF'} — commands: 1 | 2 | d1 | d2 | a`);
});

// ---------------------------------------------------------------- utils
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
