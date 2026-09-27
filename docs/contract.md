# Interface Contract — Backend ⇄ Dashboard (v0.2, draft)

> Owner: Khalid (frontend) & Ayman (backend). Any change to this file must be agreed by both
> **before** it is implemented. Bump the version at the top when it changes.

## 1. Architecture

```
Helmet ESP32 ──MQTT──► Broker (Mosquitto) ──► Backend (Node/Express) ──WebSocket──► Dashboard (React)
                                                  │  ▲
                                                  ▼  │ REST (initial load, history)
                                               MongoDB
```

- MQTT is used **only** between devices and the backend. The browser never talks MQTT.
- WebSocket (RFC 6455) is used **only** between the backend and the browser (live push).
- REST is used for the initial snapshot and for violation history.
- The dashboard is **outside the safety path**: the tool relay is disabled locally by the tool-side
  ESP32. The dashboard only displays and logs.

### 1.1 Device layer — MQTT (current firmware, from Osama)

| Item            | Current value                                                        |
|-----------------|----------------------------------------------------------------------|
| Broker          | Mosquitto, port 1883 (runs on the laptop, same Wi-Fi as the ESP32s)   |
| Helmet topic    | `helmet/pin7` (named after the sender GPIO)                           |
| Payload         | one ASCII character: `'1'` = worn, `'0'` = removed. Anything else is ignored |
| Tool ESP32      | subscribes to `helmet/pin7`, drives the relay on GPIO 4               |
| Tool fail-safe  | relay OFF on Wi-Fi loss, MQTT loss, or no message for **3 s**         |
| Timestamp / seq | **none** — the payload is only the character                          |

What the backend adds (the device does not send these):
- `deviceId`, `workerId`, `toolId` — from a mapping table in MongoDB (topic → helmet → worker → tool).
- `seq` — per-device counter assigned by the backend.
- `serverTs` — backend receive time. `deviceTs` is `null`.
- `toolState` — `UNKNOWN` until the tool ESP32 publishes its relay state (see open questions).
  The backend must **not** infer the tool state from the helmet state.

Proposed topic scheme once there is more than one helmet (to agree with Osama):
`m025/helmet/<H-01>/state` (payload `'1'`/`'0'`) and `m025/tool/<T-01>/relay` (payload `'1'`/`'0'`).
The backend subscribes to `m025/helmet/+/state` and `m025/tool/+/relay`.

## 2. Enumerations

| Name          | Values                                          |
|---------------|-------------------------------------------------|
| `HelmetState` | `UNKNOWN`, `WORN`, `REMOVED`, `LINK_LOST`        |
| `ToolState`   | `UNKNOWN`, `ENABLED`, `DISABLED`                 |
| `EventType`   | `HELMET_REMOVED`, `LINK_LOST`                    |
| `Action`      | `TOOL_DISABLED`, `NONE`                          |

## 3. WebSocket — `ws://<host>:<port>/ws`

Server → browser only. Every frame is one JSON object with a `type` field.

### 3.1 `status` (sent on every device message, including heartbeats)

```json
{
  "type": "status",
  "deviceId": "H-01",
  "workerId": "W-7F3A",
  "toolId": "T-01",
  "seq": 1042,
  "helmetState": "WORN",
  "toolState": "ENABLED",
  "tempC": 34.6,
  "deviceTs": null,
  "serverTs": "2026-10-05T09:15:02.184Z"
}
```

Rules:
- `seq` is assigned **by the backend**, increasing per `deviceId`. The dashboard ignores
  `seq <= lastSeq`, except a lower `seq` with a newer `serverTs` (backend restarted its counter).
- `deviceTs` is `null` with the current firmware (no clock on the device side).
- `tempC` may be `null` if no valid reading. It is **forehead skin temperature**, non-medical.
- `serverTs` = time the backend **received and validated** the device message (ISO 8601, UTC).
  This is the start point for measuring **Spec 3** (≤ 2 s).
- Devices publish continuously (heartbeat, target every **1 s**). If the dashboard receives nothing for a device for
  **3 s**, it shows `LINK_LOST` on its own (stale data is never shown as safe).
- `workerId` is pseudonymous. No names or images.

### 3.2 `violation` (sent once, when a violation is stored in MongoDB)

```json
{
  "type": "violation",
  "violation": {
    "id": "66f1c2...",
    "deviceId": "H-01",
    "workerId": "W-7F3A",
    "toolId": "T-01",
    "eventType": "HELMET_REMOVED",
    "action": "TOOL_DISABLED",
    "deviceTs": null,
    "serverTs": "2026-10-05T09:15:07.066Z"
  }
}
```

## 4. REST

| Method | Path              | Purpose                                     |
|--------|-------------------|---------------------------------------------|
| GET    | `/api/status`     | Latest `status` object per device (array)   |
| GET    | `/api/violations` | Violation history, newest first             |
| POST   | `/api/login`      | Supervisor login (to be defined — later)    |

`GET /api/violations` query params (all optional): `workerId`, `toolId`, `eventType`,
`from`, `to` (ISO 8601), `limit` (default 100).

Response: `{ "items": Violation[] }`.

## 5. Open questions (to settle with Ayman / Osama)

- [x] MQTT topic + payload from the ESP32 (Osama) — see §1.1.
- [ ] Helmet sensor: capacitive or pressure? (affects wording only, not this contract).
- [ ] Helmet publish interval — must be well under the 3 s tool timeout (Osama).
- [ ] Tool ESP32 publishes its relay state, e.g. `m025/tool/T-01/relay` (Osama).
- [ ] Temperature (MLX90614): topic + format (Osama).
- [ ] Wi-Fi SSID / password / broker IP entered by the user instead of hard-coded (captive portal).
- [ ] Auth for `/ws` and REST (token in query / header) — after PPR.
