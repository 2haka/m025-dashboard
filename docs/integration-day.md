# Integration Day — Dashboard ⇄ Helmet (checklist)

Goal: real helmet ESP32 → Osama's Mosquitto → our backend → MongoDB → dashboard, then collect
evidence for **Spec 3** and **IS1**.

## A. Before the meeting (Khalid)

- [ ] MongoDB installed and running (`brew services list` shows `mongodb-community started`)
- [ ] `npm install` done, `backend/.env` created from `.env.example`
- [ ] Dry run at home: `brew services start mosquitto`, `MQTT_URL=mqtt://localhost:1883`,
      `npm run dev:real` + `npm run fake-helmet` → wear/remove/stop all show on the dashboard
- [ ] Laptop charged + charger; disable sleep while testing
- [ ] Osama brings: helmet ESP32, tool ESP32 + load, his laptop with Mosquitto, the hotspot phone

## B. Network (at the hub)

Recommended: **keep Osama's broker** — no firmware change needed.

1. Connect the Mac to the same hotspot as the ESP32s.
2. Get the broker laptop's IP (Mac: `ipconfig getifaddr en0` · Windows: `ipconfig`).
   It should match `mqttBroker` in the firmware (was `172.20.10.4`).
3. Check it is reachable from the Mac: `nc -vz <IP> 1883` → `succeeded`.
4. In `backend/.env`: `MQTT_URL=mqtt://<IP>:1883` and `LOG_MQTT=1`.
5. In `backend/devices.json`: `helmetTopic` = the firmware topic (`helmet/pin7`). Leave
   `tempTopic` / `relayTopic` as `null` unless Osama publishes them.

## C. Start

```bash
npm run dev:real
```

Expected in the terminal:

```
MQTT connected (mqtt://<IP>:1883)
MQTT subscribed: helmet/pin7
MongoDB connected (...)
[mqtt] helmet/pin7: 4 msg/2s last='1'
H-01 helmet: UNKNOWN → WORN
```

The `msg/2s` number answers the heartbeat question on the spot:
- about 2 s ÷ publish interval (e.g. `4 msg/2s` = every 500 ms) → continuous
- `silent` while nothing changes → the helmet only publishes on change (see T2)

## D. Tests (in this order)

| # | Test | Pass when | Evidence |
|---|------|-----------|----------|
| T1 | Wear / remove 5× | Card follows every change; each removal adds a *Helmet removed* row | screenshot |
| T2 | Wear and wait 10 s | Stays **Worn**, tool load stays ON | note |
| T3 | Unplug the helmet ESP32 | **Link lost** within ~3 s, *Link lost* row, tool load turns OFF | screenshot |
| T4 | Spec 3: *Reset* latency panel, run ~2 min (≥ 100 samples) | Max < 2000 ms | **Export CSV** |
| T5 | IS1: 40 trials (20 remove, 20 wear) with the IS1 panel, filmed at 60 fps (helmet + screen in one shot) | ≥ 95 % pass, each ≤ 5 s (time from video) | **Export CSV** + video |
| T6 | Stop the backend (Ctrl + C), start again | Dashboard shows **Unknown**, then recovers; history still there | screenshot |

If T2 fails (Link lost after 3 s while worn): the helmet publishes only on change. The fix is in
the firmware (publish the state every ~500 ms) — the tool relay has the same 3 s timeout, so the
load would also switch off.

## E. After

- [ ] Put CSVs, video and screenshots in `TEAM M025-3/…/Evidence/` with the date
- [ ] Update `docs/ppr-ics-plan.md` statuses — only with measured numbers
- [ ] Optional DB export: `brew install mongodb-database-tools` then
      `mongoexport --db m025 --collection violations --out violations.json`

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `MQTT not connected … retrying` | wrong IP / different network / broker only listens on localhost | step B.3; broker config `listener 1883 0.0.0.0` + `allow_anonymous true` |
| `[mqtt] helmet/pin7: silent` | ESP32 not connected or different topic | check the ESP32 serial monitor; match `helmetTopic` |
| `rejected helmet payload …` | firmware sends something other than `'1'`/`'0'` | check the `publish()` call |
| `port 4000 is busy` | mock server still running | stop `npm run dev` first |
| Dashboard *Disconnected* | backend not running | `npm run dev:real` |
| History error banner / 503 | MongoDB not running | `brew services start mongodb-community` |
