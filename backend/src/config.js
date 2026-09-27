// Environment + device mapping. Fails fast on a bad devices.json.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true }); // reads backend/.env (npm runs workspace scripts from backend/)

const int = (name, fallback) => {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number`);
  return v;
};

export const config = {
  port: int('PORT', 4000),
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017',
  mongoDb: process.env.MONGO_DB ?? 'm025',
  linkTimeoutMs: int('LINK_TIMEOUT_MS', 3000),
  heartbeatPushMs: int('HEARTBEAT_PUSH_MS', 500),
  relayConfirmMs: int('RELAY_CONFIRM_MS', 5000),
  logMqtt: process.env.LOG_MQTT === '1',
};

const ID = /^[A-Za-z0-9_-]{1,32}$/;

/** @typedef {{deviceId:string, workerId:string, toolId:string, helmetTopic:string, tempTopic:string|null, relayTopic:string|null}} DeviceConfig */

/** @returns {DeviceConfig[]} */
export function loadDevices(path = fileURLToPath(new URL('../devices.json', import.meta.url))) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = raw?.devices;
  if (!Array.isArray(list) || list.length === 0) throw new Error('devices.json: "devices" must be a non-empty array');

  const seenIds = new Set();
  const seenTopics = new Set();
  return list.map((d, i) => {
    const where = `devices.json → devices[${i}]`;
    for (const k of ['deviceId', 'workerId', 'toolId']) {
      if (typeof d[k] !== 'string' || !ID.test(d[k])) throw new Error(`${where}.${k} must match ${ID}`);
    }
    if (typeof d.helmetTopic !== 'string' || !d.helmetTopic) throw new Error(`${where}.helmetTopic is required`);
    for (const k of ['tempTopic', 'relayTopic']) {
      if (d[k] !== null && d[k] !== undefined && typeof d[k] !== 'string') throw new Error(`${where}.${k} must be a string or null`);
    }
    if (seenIds.has(d.deviceId)) throw new Error(`${where}: duplicate deviceId ${d.deviceId}`);
    seenIds.add(d.deviceId);
    for (const t of [d.helmetTopic, d.tempTopic, d.relayTopic].filter(Boolean)) {
      if (/[+#]/.test(t)) throw new Error(`${where}: wildcards are not allowed in topics (${t})`);
      if (seenTopics.has(t)) throw new Error(`${where}: topic ${t} is used twice`);
      seenTopics.add(t);
    }
    return {
      deviceId: d.deviceId,
      workerId: d.workerId,
      toolId: d.toolId,
      helmetTopic: d.helmetTopic,
      tempTopic: d.tempTopic ?? null,
      relayTopic: d.relayTopic ?? null,
    };
  });
}
