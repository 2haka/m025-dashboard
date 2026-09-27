# CLAUDE.md — M025 Supervisor Dashboard

Read this before every task in this repo.

## Project

KFUPM senior design, **Team M025**: *Helmet–Tool Safety Interlock System for Enforcing PPE
Compliance in Construction Sites*. A power tool runs only while the worker's helmet is detected as
worn. This repo is the **ICS part**: the supervisor dashboard.

| Who            | Dept | Owns                                                        |
|----------------|------|-------------------------------------------------------------|
| Khalid (user)  | ICS  | `frontend/` — React + TypeScript dashboard                  |
| Ayman          | ICS  | `backend/` — Node/Express, MQTT subscriber, MongoDB, WebSocket |
| Osama          | EE   | ESP32 firmware, sensors, relay (not in this repo)           |
| Omar           | ME   | Helmet mounting / enclosure (not in this repo)              |

Work in `frontend/` unless Khalid asks otherwise. Do not write backend code in `backend/` — that is
Ayman's; suggest changes instead.

## Architecture (do not mix these up)

```
ESP32 ──MQTT──► Broker ──► Backend ──WebSocket──► Dashboard
                              │ ▲ REST
                              ▼ │
                           MongoDB
```

- MQTT is device ⇄ backend only. The browser never speaks MQTT.
- WebSocket is backend → browser only. REST is for the initial snapshot and history.
- The dashboard is **outside the safety path**. The tool is disabled locally by the tool-side ESP32.
  Never describe the dashboard as disabling the tool.

## Source of truth

- `docs/contract.md` defines every message and endpoint. `frontend/src/types/contract.ts` mirrors
  it (types + runtime guards). Change both in the same commit.
- A contract change affects Ayman: **flag it to Khalid, don't change it silently.**
- Until the real backend exists, `mock-server/` implements the contract. Keep it in sync.

## Safety display rules — never break these

1. Backend connection not open → every helmet shows `UNKNOWN`.
2. No message from a device for `VITE_STALE_MS` (3 s) → `LINK_LOST`, tool `UNKNOWN`.
3. Invalid / malformed messages are dropped and counted, never rendered.
4. Missing or stale data is **never** shown as `WORN` or `ENABLED`.
5. `seq <= lastSeq` is ignored, except lower `seq` with newer `serverTs` (device reboot).
6. Every state has text + icon, not color only.

## PPR targets (ICS / Khalid)

| ID     | Requirement                                                              |
|--------|--------------------------------------------------------------------------|
| C2     | Dashboard is web-based, built with open-source frameworks                 |
| Spec 3 | Dashboard updates compliance status within **2 s** of data transmission    |
| IS1    | Detect helmet removal and update dashboard within **5 s**, ≥ **95 %** accuracy |

Spec 3 is measured in `frontend/src/lib/latency.ts` (`serverTs` → painted). It is only valid when
backend and browser run on the **same machine**. Plan: `docs/ppr-ics-plan.md`.

## Evidence rule (strict)

- Never invent or estimate measurements, latencies, accuracies, or trial results.
- Numbers from `mock-server/` are **not** evidence.
- Anything not measured on the real system is written as **"Not yet verified"** with a test protocol.
- Temperature is **forehead skin temperature, non-medical** — never "body temperature" or a diagnosis.

## Commands

```bash
npm install        # once
npm run dev        # mock-server :4000 + dashboard :5173 (type 1 / 2 / d1 / d2 / a to drive helmets)
npm run build      # typecheck + build — must pass before a task is done
npm run typecheck
```

## Code conventions

- TypeScript `strict`. No `any`. Validate all data from the network.
- Structure: `types/` · `services/` (I/O) · `hooks/` (state) · `lib/` (pure logic) · `components/` (UI).
- Styling: plain CSS with the tokens in `src/styles/global.css` (light + dark). No UI library
  unless Khalid agrees.
- Don't add dependencies without saying why.
- Small, focused components. Code and comments in English.

## Talking to Khalid

- Reply in **Gulf Arabic**, English for technical terms. Be concise and direct.
- Show what changed and how to try it. Don't recap every step.
