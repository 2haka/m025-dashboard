// Fake ESP32s on a REAL MQTT broker — test the backend without hardware.
// Publishes exactly like the firmware: one ASCII char '1' (worn) / '0' (removed).
//
//   npm run fake-helmet                      helmet publishes every 500 ms (continuous)
//   npm run fake-helmet -- --on-change       helmet publishes only when the state changes
//   npm run fake-helmet -- --with-tool       also emulate the tool ESP32 (relay + 3 s fail-safe)
//
// Topics come from backend/devices.json (first device). Broker from MQTT_URL in backend/.env.
// Type + Enter:  w = wear   r = remove   s = stop/resume sending (simulated link loss)   q = quit

import dotenv from 'dotenv';
import readline from 'node:readline';
import mqtt from 'mqtt';
import { loadDevices } from '../src/config.js';

dotenv.config({ quiet: true });

const args = new Set(process.argv.slice(2));
const onChangeOnly = args.has('--on-change');
const withTool = args.has('--with-tool');
const url = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const dev = loadDevices()[0];

const PUBLISH_MS = 500;
const TOOL_TIMEOUT_MS = 3000;

let worn = true;
let sending = true;
let temp = 34.5;

const log = (m) => console.log(`[fake ${new Date().toLocaleTimeString('en-GB')}] ${m}`);

// ------------------------------------------------------------ helmet ESP32
const helmet = mqtt.connect(url, { clientId: `fake-helmet-${process.pid}`, reconnectPeriod: 2000 });
helmet.on('connect', () => log(`helmet connected to ${url} → ${dev.helmetTopic} (${onChangeOnly ? 'on change only' : `every ${PUBLISH_MS} ms`})`));
helmet.on('error', (e) => log(`helmet MQTT error: ${e.message}`));

function publishState() {
  if (sending && helmet.connected) helmet.publish(dev.helmetTopic, worn ? '1' : '0');
}
setInterval(() => {
  if (!onChangeOnly) publishState();
  if (dev.tempTopic && sending && helmet.connected) {
    temp = Math.min(37, Math.max(33, temp + (Math.random() - 0.5) * 0.2));
    helmet.publish(dev.tempTopic, temp.toFixed(1));
  }
}, PUBLISH_MS);

// ------------------------------------------------------------ tool ESP32 (optional)
if (withTool) {
  if (!dev.relayTopic) {
    log('--with-tool needs "relayTopic" set in devices.json');
    process.exit(1);
  }
  const tool = mqtt.connect(url, { clientId: `fake-tool-${process.pid}`, reconnectPeriod: 2000 });
  let relayOn = false;
  let lastMsg = 0;
  const setRelay = (on) => {
    if (on === relayOn) return;
    relayOn = on;
    log(`tool relay ${on ? 'ON' : 'OFF'}`);
    tool.publish(dev.relayTopic, on ? '1' : '0');
  };
  tool.on('connect', () => {
    log(`tool connected → subscribes ${dev.helmetTopic}, publishes ${dev.relayTopic}`);
    tool.subscribe(dev.helmetTopic);
  });
  tool.on('message', (_t, payload) => {
    const c = String.fromCharCode(payload[0] ?? 0);
    if (c !== '1' && c !== '0') return;
    lastMsg = Date.now();
    setRelay(c === '1');
  });
  setInterval(() => {
    if (relayOn && Date.now() - lastMsg > TOOL_TIMEOUT_MS) setRelay(false); // same fail-safe as the firmware
    if (tool.connected) tool.publish(dev.relayTopic, relayOn ? '1' : '0'); // 1 s report
  }, 1000);
}

// ------------------------------------------------------------ keyboard
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const c = line.trim().toLowerCase();
  if (c === 'w' || c === 'r') {
    worn = c === 'w';
    log(`helmet ${worn ? 'WORN (1)' : 'REMOVED (0)'}`);
    publishState(); // change is sent immediately in both modes
  } else if (c === 's') {
    sending = !sending;
    log(sending ? 'helmet sending again' : 'helmet STOPPED sending (simulated link loss)');
  } else if (c === 'q') process.exit(0);
  else if (c) log('commands: w | r | s | q');
});

log('commands: w = wear, r = remove, s = stop/resume sending, q = quit');
