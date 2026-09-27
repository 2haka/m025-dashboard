# M025 — Supervisor Dashboard

Team M025 · Helmet–Tool Safety Interlock · ICS subsystem.

| Folder         | Owner  | What it is                                                              |
|----------------|--------|-------------------------------------------------------------------------|
| `frontend/`    | Khalid | React + TypeScript dashboard (Vite)                                     |
| `backend/`     | Ayman  | Real backend: MQTT → MongoDB → WebSocket/REST (see `backend/README.md`) |
| `mock-server/` | shared | Fake backend with simulated helmets, same contract as the real one      |
| `docs/`        | shared | `contract.md`, `ppr-ics-plan.md`, `integration-day.md` (helmet test checklist) |

## Requirements

- Node.js **20+** (22 recommended) — check with `node -v`
- Git

## Run it

```bash
npm install          # once, from the project root
npm run dev          # starts mock-server (:4000) + dashboard (:5173) together
```

The browser opens at http://localhost:5173.

While it runs, type in the same terminal and press Enter to drive the simulated helmets:

| Command | Effect                                       |
|---------|----------------------------------------------|
| `1`/`2` | Toggle helmet H-01 / H-02 (Worn ⇄ Removed)    |
| `d1`/`d2` | Drop / restore link of H-01 / H-02         |
| `a`     | Random events on/off                         |

## Run with the real backend + helmet

One-time setup (MongoDB etc.): `backend/README.md`. Then:

```bash
npm run dev:real     # backend (:4000) + dashboard (:5173)
npm run fake-helmet  # optional: fake ESP32 on a real broker (w / r / s / q)
npm test             # backend unit tests
```

Checklist for testing with the real helmet: `docs/integration-day.md`.

## Other scripts

```bash
npm run build        # type-check + production build of the dashboard
npm run typecheck    # type-check only
npm run dev:web      # dashboard only (e.g. against Ayman's real backend)
npm run dev:mock     # mock backend only
```

To point the dashboard at the real backend: copy `frontend/.env.example` to `frontend/.env`
and change `VITE_WS_URL` / `VITE_API_URL`.

## Frontend structure

```
frontend/src/
├── types/contract.ts        message types + runtime validation (mirrors docs/contract.md)
├── services/wsClient.ts     WebSocket with auto-reconnect
├── services/api.ts          REST calls (status snapshot, violation history)
├── hooks/useLiveDashboard.ts  state, ordering by seq, stale → LINK_LOST rules
├── lib/latency.ts           Spec 3 measurement + CSV export
├── components/              HelmetCard, SummaryBar, ViolationsTable, LatencyPanel, …
└── App.tsx                  page layout
```

## Safety-relevant display rules

1. Dashboard not connected to the backend → every helmet is **Unknown**.
2. No message from a helmet for 3 s → **Link lost**.
3. Invalid messages are dropped and counted, never displayed.
4. The dashboard is monitoring only; the tool is disabled locally by the machine unit.
