# Backend

MQTT (ESP32) → validation → MongoDB → WebSocket / REST (dashboard). Implements `docs/contract.md`.

v1 written by Khalid (with Claude) so the dashboard can be connected to the helmet. Ayman can take
ownership from here — the structure is small on purpose.

```
backend/
├── devices.json          topic → helmet → worker → tool mapping (edit this, restart)
├── .env.example          copy to .env: broker URL, MongoDB URL, timeouts
├── src/
│   ├── index.js          wiring + startup/shutdown
│   ├── config.js         env + devices.json validation
│   ├── payload.js        parse '1' / '0' / "34.6" from the firmware (pure)
│   ├── deviceHub.js      state machine: states, link timeout, violations, relay confirm (pure)
│   ├── mqttBridge.js     MQTT subscribe + traffic log
│   ├── store.js          MongoDB (never blocks the live path)
│   └── http.js           REST + WebSocket
├── scripts/fake-helmet.js  fake ESP32s on a real broker (test without hardware)
└── test/                 node:test unit tests (npm test)
```

## One-time setup (macOS)

```bash
# 1. Homebrew (skip if `brew -v` works)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. MongoDB, running in the background (starts again after reboot)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# 3. Mosquitto — only if the broker runs on THIS laptop (not needed if we use Osama's broker)
brew install mosquitto

# 4. Project dependencies (from the repo root)
npm install

# 5. Config
cp backend/.env.example backend/.env
```

## Run

```bash
npm run dev:real      # backend (:4000) + dashboard (:5173)
```

The backend and the mock both use port 4000 — run one or the other, not both.

## Test without hardware

Needs a broker on this laptop (`brew services start mosquitto`, see note below) and
`MQTT_URL=mqtt://localhost:1883` in `backend/.env`.

```bash
npm run dev:real                           # terminal 1
npm run fake-helmet                        # terminal 2 — type w / r / s / q
npm run fake-helmet -- --on-change         # helmet publishes only on change
npm run fake-helmet -- --with-tool         # also a fake tool ESP32 (needs relayTopic in devices.json)
```

Mosquitto 2.x only accepts connections from the same machine by default. For the ESP32s to reach a
broker on this laptop, add to `/opt/homebrew/etc/mosquitto/mosquitto.conf`:

```
listener 1883 0.0.0.0
allow_anonymous true
```

(Intel Mac: `/usr/local/etc/mosquitto/mosquitto.conf`), then `brew services restart mosquitto`. (Anonymous access is acceptable for the closed demo network only.)

## Unit tests

```bash
npm test
```

## Diagnostics

- `http://localhost:4000/api/health` — MQTT / MongoDB connection, each device's state and how long
  ago it was last heard from.
- With `LOG_MQTT=1` the terminal prints every 2 s how many messages each topic received, e.g.
  `helmet/pin7: 4 msg/2s last='1'` — shows at a glance whether the ESP32 publishes continuously.
