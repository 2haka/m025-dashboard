// MongoDB persistence. Collections: devices, events, violations, temperatures.
//
// Design rule: the database is NOT in the live path. If MongoDB is down, status updates keep
// flowing to the dashboard; writes are skipped (and counted) and history queries return 503.
// The connection is retried in the background.

import { MongoClient } from 'mongodb';

const RETRY_MS = 5000;
const RETENTION_DAYS = 90; // violation / event / temperature records expire after this (data minimisation)

export class StoreUnavailableError extends Error {}

export class Store {
  /** @param {{url:string, dbName:string, log:(msg:string)=>void}} opts */
  constructor({ url, dbName, log }) {
    this.url = url;
    this.dbName = dbName;
    this.log = log;
    this.client = null;
    this.db = null;
    this.ready = false;
    this.skippedWrites = 0;
    this.failedWrites = 0;
    this.stopped = false;
    /** @type {(() => Promise<void>) | null} */
    this.onReady = null;
  }

  /** Starts connecting in the background; never throws. */
  start() {
    void this.#connectLoop();
  }

  async #connectLoop() {
    while (!this.stopped && !this.ready) {
      try {
        this.client = new MongoClient(this.url, { serverSelectionTimeoutMS: 3000, heartbeatFrequencyMS: 2000 });
        // Follow the server's health after the first connect, so a DB that dies mid-run is noticed
        // within ~2 s: writes are then skipped immediately instead of hanging.
        this.client.on('serverHeartbeatFailed', () => {
          if (this.ready) this.log('MongoDB connection lost — live monitoring continues, logging paused');
          this.ready = false;
        });
        this.client.on('serverHeartbeatSucceeded', () => {
          if (!this.ready && this.db) this.log('MongoDB connection restored');
          if (this.db) this.ready = true;
        });
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        await this.#ensureIndexes();
        this.ready = true;
        this.log(`MongoDB connected (${this.url}/${this.dbName})`);
        if (this.onReady) await this.onReady();
      } catch (err) {
        this.log(`MongoDB not available (${errMsg(err)}) — retrying in ${RETRY_MS / 1000} s. Live monitoring continues.`);
        await this.client?.close().catch(() => {});
        await sleep(RETRY_MS);
      }
    }
  }

  async #ensureIndexes() {
    const ttl = { expireAfterSeconds: RETENTION_DAYS * 24 * 3600 };
    const specs = [
      ['devices', { deviceId: 1 }, { unique: true }],
      ['violations', { id: 1 }, { unique: true }],
      ['violations', { serverTs: -1 }],
      ['violations', { workerId: 1, serverTs: -1 }],
      ['violations', { toolId: 1, serverTs: -1 }],
      ['violations', { serverAt: 1 }, ttl],
      ['events', { deviceId: 1, serverTs: -1 }],
      ['events', { serverAt: 1 }, ttl],
      ['temperatures', { deviceId: 1, serverTs: -1 }],
      ['temperatures', { serverAt: 1 }, ttl],
    ];
    for (const [coll, keys, opts] of specs) {
      try {
        await this.db.collection(coll).createIndex(keys, opts ?? {});
      } catch (err) {
        this.log(`index ${coll} ${JSON.stringify(keys)} not created: ${errMsg(err)}`);
      }
    }
  }

  /** @param {import('./config.js').DeviceConfig[]} devices */
  async upsertDevices(devices) {
    await this.#write('devices', (c) =>
      c.bulkWrite(
        devices.map((d) => ({
          updateOne: { filter: { deviceId: d.deviceId }, update: { $set: { ...d, updatedAt: new Date() } }, upsert: true },
        })),
      ),
    );
  }

  insertViolation(v) {
    return this.#write('violations', (c) => c.insertOne({ ...v, serverAt: new Date(v.serverTs) }));
  }

  updateViolationAction(v) {
    return this.#write('violations', (c) => c.updateOne({ id: v.id }, { $set: { action: v.action, actionTs: v.actionTs } }));
  }

  insertEvent(e) {
    return this.#write('events', (c) => c.insertOne({ ...e, serverAt: new Date(e.serverTs) }));
  }

  insertInvalid(e) {
    return this.#write('events', (c) => c.insertOne({ ...e, type: 'INVALID_PAYLOAD', serverAt: new Date(e.serverTs) }));
  }

  insertTemperature(t) {
    return this.#write('temperatures', (c) => c.insertOne({ ...t, serverAt: new Date(t.serverTs) }));
  }

  /**
   * @param {{workerId?:string, toolId?:string, eventType?:string, from?:string, to?:string, limit:number}} q
   *   Already validated by the HTTP layer (plain strings only).
   */
  async queryViolations(q) {
    if (!this.ready) throw new StoreUnavailableError('database not connected');
    return this.#query(q).catch((err) => {
      throw new StoreUnavailableError(errMsg(err)); // e.g. DB died between heartbeats
    });
  }

  #query(q) {
    const filter = {};
    if (q.workerId) filter.workerId = q.workerId;
    if (q.toolId) filter.toolId = q.toolId;
    if (q.eventType) filter.eventType = q.eventType;
    if (q.from || q.to) {
      filter.serverTs = {};
      if (q.from) filter.serverTs.$gte = q.from;
      if (q.to) filter.serverTs.$lte = q.to;
    }
    return this.db
      .collection('violations')
      .find(filter, { projection: { _id: 0, serverAt: 0 } })
      .sort({ serverTs: -1 })
      .limit(q.limit)
      .toArray();
  }

  stats() {
    return { connected: this.ready, skippedWrites: this.skippedWrites, failedWrites: this.failedWrites };
  }

  async stop() {
    this.stopped = true;
    await this.client?.close().catch(() => {});
  }

  async #write(coll, fn) {
    if (!this.ready) {
      this.skippedWrites += 1;
      return false;
    }
    try {
      await fn(this.db.collection(coll));
      return true;
    } catch (err) {
      this.failedWrites += 1;
      this.log(`MongoDB write to ${coll} failed: ${errMsg(err)}`);
      return false;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errMsg = (err) => (err instanceof Error ? err.message : String(err));
