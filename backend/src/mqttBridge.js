// MQTT client: subscribes to every configured topic and feeds messages to the DeviceHub.
// mqtt.js reconnects on its own. While the broker is unreachable no messages arrive, so the
// hub's tick() marks every helmet LINK_LOST after LINK_TIMEOUT_MS — the correct outcome.

import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';

/**
 * @param {{url:string, hub:import('./deviceHub.js').DeviceHub, logTraffic:boolean, log:(m:string)=>void}} opts
 */
export function startMqtt({ url, hub, logTraffic, log }) {
  const topics = hub.topics();
  const client = mqtt.connect(url, {
    clientId: `m025-backend-${randomBytes(3).toString('hex')}`,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clean: true,
  });

  let connected = false;
  let warnedOffline = false;
  /** @type {Map<string, {count:number, last:string}>} */
  const traffic = new Map(topics.map((t) => [t, { count: 0, last: '' }]));
  let unknownTopicMsgs = 0;

  client.on('connect', () => {
    connected = true;
    warnedOffline = false;
    log(`MQTT connected (${url})`);
    client.subscribe(topics, { qos: 0 }, (err) => {
      if (err) log(`MQTT subscribe failed: ${err.message}`);
      else log(`MQTT subscribed: ${topics.join(', ')}`);
    });
  });

  client.on('close', () => {
    if (connected || !warnedOffline) log(`MQTT not connected to ${url} — retrying every 2 s`);
    connected = false;
    warnedOffline = true;
  });

  client.on('error', (err) => log(`MQTT error: ${err.message}`));

  client.on('message', (topic, payload) => {
    const t = traffic.get(topic);
    if (t) {
      t.count += 1;
      t.last = payload.toString('utf8').slice(0, 16);
    }
    if (!hub.handle(topic, payload)) unknownTopicMsgs += 1;
  });

  // Integration-day helper: shows whether the ESP32 publishes continuously or only on change.
  const TRAFFIC_WINDOW_MS = 2000;
  const timer = logTraffic
    ? setInterval(() => {
        if (!connected) return;
        const parts = [...traffic.entries()].map(([topic, s]) =>
          s.count ? `${topic}: ${s.count} msg/${TRAFFIC_WINDOW_MS / 1000}s last='${s.last}'` : `${topic}: silent`,
        );
        log(`[mqtt] ${parts.join(' | ')}`);
        for (const s of traffic.values()) s.count = 0;
      }, TRAFFIC_WINDOW_MS)
    : null;

  return {
    isConnected: () => connected,
    unknownTopicMsgs: () => unknownTopicMsgs,
    stop: () =>
      new Promise((resolve) => {
        if (timer) clearInterval(timer);
        client.end(false, {}, () => resolve(undefined));
      }),
  };
}
