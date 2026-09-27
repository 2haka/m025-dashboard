// REST API (docs/contract.md §4) + WebSocket hub (§3) on one HTTP server.

import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { StoreUnavailableError } from './store.js';

const EVENT_TYPES = new Set(['HELMET_REMOVED', 'LINK_LOST']);
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const ALLOWED_PARAMS = new Set(['workerId', 'toolId', 'eventType', 'from', 'to', 'limit']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * @param {{hub: import('./deviceHub.js').DeviceHub, store: import('./store.js').Store,
 *          mqtt: {isConnected:()=>boolean, unknownTopicMsgs:()=>number}, log:(m:string)=>void}} deps
 */
export function createServer({ hub, store, mqtt, log }) {
  const app = express();
  // 'simple' parser: every query value is a plain string, never an object.
  // Blocks NoSQL operator injection such as ?workerId[$ne]=x.
  app.set('query parser', 'simple');
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // local network prototype; restrict when auth is added
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const startedAt = Date.now();

  app.get('/api/health', (_req, res) => {
    res.json({
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      mqtt: { connected: mqtt.isConnected(), unknownTopicMsgs: mqtt.unknownTopicMsgs() },
      db: store.stats(),
      dashboards: wss.clients.size,
      devices: hub.health(),
    });
  });

  app.get('/api/status', (_req, res) => res.json(hub.snapshot()));

  app.get('/api/violations', async (req, res) => {
    const q = req.query;
    const bad = (msg) => res.status(400).json({ error: msg });
    const unknown = Object.keys(q).filter((k) => !ALLOWED_PARAMS.has(k));
    if (unknown.length) return bad(`unknown parameter: ${unknown.join(', ')}`);
    for (const k of ['workerId', 'toolId']) {
      if (q[k] !== undefined && (typeof q[k] !== 'string' || !ID.test(q[k]))) return bad(`invalid ${k}`);
    }
    if (q.eventType !== undefined && !EVENT_TYPES.has(q.eventType)) return bad('invalid eventType');
    for (const k of ['from', 'to']) {
      if (q[k] !== undefined && (typeof q[k] !== 'string' || !ISO.test(q[k]))) return bad(`${k} must be ISO 8601 UTC`);
    }
    const limit = q.limit === undefined ? 100 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return bad('limit must be 1–1000');

    try {
      const items = await store.queryViolations({
        workerId: q.workerId,
        toolId: q.toolId,
        eventType: q.eventType,
        from: q.from,
        to: q.to,
        limit,
      });
      res.json({ items });
    } catch (err) {
      if (err instanceof StoreUnavailableError) return res.status(503).json({ error: 'database not connected' });
      log(`GET /api/violations failed: ${err.message}`);
      res.status(500).json({ error: 'internal error' });
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  // ws re-emits HTTP server errors (e.g. EADDRINUSE); index.js reports them on the server itself.
  wss.on('error', () => {});

  wss.on('connection', (socket, req) => {
    socket.isAlive = true;
    socket.on('pong', () => (socket.isAlive = true));
    socket.on('message', () => {}); // server → browser only; ignore anything sent
    log(`dashboard connected (${req.socket.remoteAddress}) — ${wss.clients.size} open`);
    socket.on('close', () => log(`dashboard disconnected — ${wss.clients.size} open`));
  });

  // Drop dead browser connections (laptop sleep, Wi-Fi drop).
  const ping = setInterval(() => {
    for (const s of wss.clients) {
      if (!s.isAlive) {
        s.terminate();
        continue;
      }
      s.isAlive = false;
      s.ping();
    }
  }, 15_000);

  /** @param {object} msg */
  const broadcast = (msg) => {
    const frame = JSON.stringify(msg);
    for (const s of wss.clients) if (s.readyState === s.OPEN) s.send(frame);
  };

  const close = () =>
    new Promise((resolve) => {
      clearInterval(ping);
      for (const s of wss.clients) s.terminate();
      wss.close();
      server.close(() => resolve(undefined));
    });

  return { server, broadcast, close };
}
