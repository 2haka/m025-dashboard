// Entry point: wires MQTT → DeviceHub → (MongoDB, WebSocket).

import { config, loadDevices } from './config.js';
import { DeviceHub } from './deviceHub.js';
import { createServer } from './http.js';
import { startMqtt } from './mqttBridge.js';
import { Store } from './store.js';

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${msg}`);

const devices = loadDevices();
const hub = new DeviceHub(devices, config);
const store = new Store({ url: config.mongoUrl, dbName: config.mongoDb, log });
store.onReady = () => store.upsertDevices(devices);

const mqtt = startMqtt({ url: config.mqttUrl, hub, logTraffic: config.logMqtt, log });
const { server, broadcast, close } = createServer({ hub, store, mqtt, log });

// ---------------------------------------------------------------- hub → outputs
hub.on('status', (status) => broadcast(status)); // live path: never waits for the database

// Store first so the table normally reflects what was logged, but never hold the dashboard
// longer than DB_WAIT_MS: a slow or dead database must not delay the violation on screen.
const DB_WAIT_MS = 1000;
const atMost = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

hub.on('violation', async (v) => {
  log(`VIOLATION ${v.eventType} ${v.deviceId} (worker ${v.workerId}, tool ${v.toolId})`);
  await atMost(store.insertViolation(v), DB_WAIT_MS);
  broadcast({ type: 'violation', violation: v });
});

hub.on('violation-update', async (v) => {
  log(`relay confirmed ${v.action} for ${v.deviceId}`);
  await atMost(store.updateViolationAction(v), DB_WAIT_MS);
  broadcast({ type: 'violation', violation: v });
});

hub.on('event', (e) => {
  log(`${e.deviceId} ${e.type === 'HELMET_STATE' ? 'helmet' : 'tool'}: ${e.from} → ${e.to}`);
  void store.insertEvent(e);
});

hub.on('temperature', (t) => void store.insertTemperature(t));

const lastInvalidLog = new Map();
hub.on('invalid', (e) => {
  const now = Date.now();
  if (now - (lastInvalidLog.get(e.topic) ?? 0) < 5000) return; // at most one log + record per topic per 5 s
  lastInvalidLog.set(e.topic, now);
  log(`rejected ${e.kind} payload on ${e.topic}: '${e.payload}'`);
  void store.insertInvalid({ ...e, serverTs: new Date(now).toISOString() });
});

const tick = setInterval(() => hub.tick(), 250);

// ---------------------------------------------------------------- start
store.start();
server.listen(config.port, () => {
  log(`backend on http://localhost:${config.port}  (ws://localhost:${config.port}/ws)`);
  log(`MQTT ${config.mqttUrl} · MongoDB ${config.mongoUrl}/${config.mongoDb} · link timeout ${config.linkTimeoutMs} ms`);
  for (const d of devices) {
    const extra = [d.tempTopic && `temp=${d.tempTopic}`, d.relayTopic && `relay=${d.relayTopic}`].filter(Boolean).join(' ');
    log(`device ${d.deviceId}: helmet=${d.helmetTopic} ${extra} → worker ${d.workerId}, tool ${d.toolId}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log(`port ${config.port} is busy — is the mock server still running? Stop it first.`);
  else log(`server error: ${err.message}`);
  process.exit(1);
});

// ---------------------------------------------------------------- shutdown
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log('shutting down…');
  clearInterval(tick);
  await Promise.allSettled([mqtt.stop(), close(), store.stop()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
