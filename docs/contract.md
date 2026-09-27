# Interface Contract — Backend ⇄ Dashboard (v0.1, draft)

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
  "deviceTs": "2026-10-05T09:15:02.120Z",
  "serverTs": "2026-10-05T09:15:02.184Z"
}
```

Rules:
- `seq` increases monotonically per `deviceId`. The dashboard ignores `seq <= lastSeq`, **except**
  when `seq` is lower **and** `serverTs` is newer — that is treated as a device reboot (counter reset).
  Backend note: after a reboot the same `seq` can come back, so a unique index on `{deviceId, seq}`
  alone will reject valid events — add a `bootId` (random per boot) to the key, or reset on reconnect.
- `tempC` may be `null` if no valid reading. It is **forehead skin temperature**, non-medical.
- `serverTs` = time the backend **received and validated** the device message (ISO 8601, UTC).
  This is the start point for measuring **Spec 3** (≤ 2 s).
- Devices send a heartbeat every **1 s**. If the dashboard receives nothing for a device for
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
    "deviceTs": "2026-10-05T09:15:07.010Z",
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

- [ ] Final MQTT topic + payload from the ESP32 (Osama).
- [ ] Helmet sensor: capacitive or pressure? (affects wording only, not this contract).
- [ ] Add `bootId` to the device payload so `{deviceId, bootId, seq}` is unique across reboots (Osama + Ayman).
- [ ] Auth for `/ws` and REST (token in query / header) — after PPR.
