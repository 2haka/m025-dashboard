// In-memory state of every helmet/tool, driven by raw MQTT messages and a periodic tick().
// No I/O here: it only emits events. index.js wires them to MongoDB and the WebSocket.
//
// Events:
//   'status'            StatusMessage (docs/contract.md §3.1) — push to dashboards
//   'violation'         Violation (§3.2) — new violation
//   'violation-update'  Violation — same id, action confirmed (TOOL_DISABLED)
//   'event'             { deviceId, type, from, to, serverTs } — state change log
//   'temperature'       { deviceId, workerId, tempC, serverTs } — at most one per TEMP_SAVE_MS
//   'invalid'           { deviceId, topic, kind, payload } — rejected payload

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { parseHelmet, parseRelay, parseTemperature } from './payload.js';

const TEMP_SAVE_MS = 10_000;

export class DeviceHub extends EventEmitter {
  /**
   * @param {import('./config.js').DeviceConfig[]} devices
   * @param {{linkTimeoutMs:number, heartbeatPushMs:number, relayConfirmMs:number, now?:() => number}} opts
   */
  constructor(devices, { linkTimeoutMs, heartbeatPushMs, relayConfirmMs, now = Date.now }) {
    super();
    this.opts = { linkTimeoutMs, heartbeatPushMs, relayConfirmMs };
    this.now = now;
    /** @type {Map<string, ReturnType<typeof newState>>} */
    this.byId = new Map();
    /** @type {Map<string, {dev: ReturnType<typeof newState>, kind: 'helmet'|'temp'|'relay'}>} */
    this.byTopic = new Map();

    for (const cfg of devices) {
      const dev = newState(cfg);
      this.byId.set(cfg.deviceId, dev);
      this.byTopic.set(cfg.helmetTopic, { dev, kind: 'helmet' });
      if (cfg.tempTopic) this.byTopic.set(cfg.tempTopic, { dev, kind: 'temp' });
      if (cfg.relayTopic) this.byTopic.set(cfg.relayTopic, { dev, kind: 'relay' });
    }
  }

  /** All MQTT topics to subscribe to. */
  topics() {
    return [...this.byTopic.keys()];
  }

  /**
   * Route one MQTT message. Returns false for a topic we don't know.
   * @param {string} topic
   * @param {Buffer} payload
   */
  handle(topic, payload) {
    const route = this.byTopic.get(topic);
    if (!route) return false;
    const { dev, kind } = route;
    if (kind === 'helmet') this.#onHelmet(dev, topic, payload);
    else if (kind === 'temp') this.#onTemp(dev, topic, payload);
    else this.#onRelay(dev, topic, payload);
    return true;
  }

  /** Call periodically (e.g. every 250 ms): link timeouts, stale relay, expired confirmations. */
  tick() {
    const now = this.now();
    const { linkTimeoutMs, relayConfirmMs } = this.opts;
    for (const dev of this.byId.values()) {
      if (dev.lastSeenAt !== null && dev.helmetState !== 'LINK_LOST' && now - dev.lastSeenAt > linkTimeoutMs) {
        this.#setHelmet(dev, 'LINK_LOST', now);
        this.#violation(dev, 'LINK_LOST', now);
        this.#push(dev, now, true);
      }
      if (dev.toolLastSeenAt !== null && dev.toolState !== 'UNKNOWN' && now - dev.toolLastSeenAt > linkTimeoutMs) {
        this.#setTool(dev, 'UNKNOWN', now);
        this.#push(dev, now, true);
      }
      if (dev.pending && now - dev.pending.at > relayConfirmMs) dev.pending = null;
    }
  }

  /** Latest status per device that has reported at least once (GET /api/status). */
  snapshot() {
    return [...this.byId.values()].map((d) => d.lastStatus).filter(Boolean);
  }

  /** Diagnostics for GET /api/health. */
  health() {
    const now = this.now();
    return [...this.byId.values()].map((d) => ({
      ...d.cfg,
      helmetState: d.helmetState,
      toolState: d.toolState,
      tempC: this.#freshTemp(d, now),
      lastSeenMsAgo: d.lastSeenAt === null ? null : now - d.lastSeenAt,
      relayLastSeenMsAgo: d.toolLastSeenAt === null ? null : now - d.toolLastSeenAt,
      invalidPayloads: d.invalid,
    }));
  }

  // ------------------------------------------------------------------ handlers

  #onHelmet(dev, topic, payload) {
    const state = parseHelmet(payload);
    if (!state) return this.#invalid(dev, topic, 'helmet', payload);
    const now = this.now();
    dev.lastSeenAt = now;
    const prev = dev.helmetState;
    if (state === prev) return this.#push(dev, now, false); // heartbeat: throttled push
    this.#setHelmet(dev, state, now);
    // Only a WORN → REMOVED transition is a removal. Coming back from UNKNOWN / LINK_LOST as
    // REMOVED is logged as an event but is not counted as a new removal violation.
    if (prev === 'WORN' && state === 'REMOVED') this.#violation(dev, 'HELMET_REMOVED', now);
    this.#push(dev, now, true);
  }

  #onTemp(dev, topic, payload) {
    const t = parseTemperature(payload);
    if (t === null) return this.#invalid(dev, topic, 'temperature', payload);
    const now = this.now();
    dev.lastSeenAt = now; // the helmet ESP32 is alive
    dev.tempC = t;
    dev.tempAt = now;
    // Alive again after a link loss, but the helmet state is not known until the next '1'/'0'.
    if (dev.helmetState === 'LINK_LOST') {
      this.#setHelmet(dev, 'UNKNOWN', now);
      this.#push(dev, now, true);
    } else {
      this.#push(dev, now, false);
    }
    if (now - dev.tempSavedAt >= TEMP_SAVE_MS) {
      dev.tempSavedAt = now;
      this.emit('temperature', { deviceId: dev.cfg.deviceId, workerId: dev.cfg.workerId, tempC: t, serverTs: iso(now) });
    }
  }

  #onRelay(dev, topic, payload) {
    const state = parseRelay(payload);
    if (!state) return this.#invalid(dev, topic, 'relay', payload);
    const now = this.now();
    dev.toolLastSeenAt = now;
    if (state === dev.toolState) return;
    this.#setTool(dev, state, now);
    // IS3 evidence: the tool ESP32 reported relay OFF shortly after a removal violation.
    if (state === 'DISABLED' && dev.pending && now - dev.pending.at <= this.opts.relayConfirmMs) {
      const v = { ...dev.pending.violation, action: 'TOOL_DISABLED', actionTs: iso(now) };
      dev.pending = null;
      this.emit('violation-update', v);
    }
    this.#push(dev, now, true);
  }

  // ------------------------------------------------------------------ helpers

  #setHelmet(dev, to, now) {
    const from = dev.helmetState;
    dev.helmetState = to;
    this.emit('event', { deviceId: dev.cfg.deviceId, type: 'HELMET_STATE', from, to, serverTs: iso(now) });
  }

  #setTool(dev, to, now) {
    const from = dev.toolState;
    dev.toolState = to;
    this.emit('event', { deviceId: dev.cfg.deviceId, type: 'TOOL_STATE', from, to, serverTs: iso(now) });
  }

  #violation(dev, eventType, now) {
    const { deviceId, workerId, toolId, relayTopic } = dev.cfg;
    /** @type {'TOOL_DISABLED'|'UNKNOWN'} */
    const action = relayTopic && dev.toolState === 'DISABLED' ? 'TOOL_DISABLED' : 'UNKNOWN';
    const violation = { id: randomUUID(), deviceId, workerId, toolId, eventType, action, deviceTs: null, serverTs: iso(now) };
    if (eventType === 'HELMET_REMOVED' && relayTopic && action === 'UNKNOWN') dev.pending = { violation, at: now };
    this.emit('violation', violation);
  }

  /** Push a status to dashboards: always on change, otherwise at most every heartbeatPushMs. */
  #push(dev, now, force) {
    if (!force && now - dev.lastPushAt < this.opts.heartbeatPushMs) return;
    dev.seq += 1;
    dev.lastPushAt = now;
    dev.lastStatus = {
      type: 'status',
      deviceId: dev.cfg.deviceId,
      workerId: dev.cfg.workerId,
      toolId: dev.cfg.toolId,
      seq: dev.seq, // restarts at 1 with the backend; the dashboard accepts a lower seq with a newer serverTs
      helmetState: dev.helmetState,
      toolState: dev.toolState,
      tempC: this.#freshTemp(dev, now),
      deviceTs: null,
      serverTs: iso(now),
    };
    this.emit('status', dev.lastStatus);
  }

  #freshTemp(dev, now) {
    return dev.tempAt !== null && now - dev.tempAt <= this.opts.linkTimeoutMs ? dev.tempC : null;
  }

  #invalid(dev, topic, kind, payload) {
    dev.invalid += 1;
    this.emit('invalid', { deviceId: dev.cfg.deviceId, topic, kind, payload: payload.toString('utf8').slice(0, 32) });
  }
}

function newState(cfg) {
  return {
    cfg,
    /** @type {'UNKNOWN'|'WORN'|'REMOVED'|'LINK_LOST'} */
    helmetState: 'UNKNOWN',
    /** @type {'UNKNOWN'|'ENABLED'|'DISABLED'} */
    toolState: 'UNKNOWN',
    /** @type {number|null} */ tempC: null,
    /** @type {number|null} */ tempAt: null,
    tempSavedAt: -Infinity,
    /** @type {number|null} */ lastSeenAt: null,
    /** @type {number|null} */ toolLastSeenAt: null,
    seq: 0,
    lastPushAt: -Infinity,
    /** @type {object|null} */ lastStatus: null,
    /** @type {{violation: object, at: number}|null} */ pending: null,
    invalid: 0,
  };
}

const iso = (ms) => new Date(ms).toISOString();
