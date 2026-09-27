# Backend (owner: Ayman)

Reserved for the real Node.js/Express backend (MQTT subscriber → validation → MongoDB → WebSocket).

It must implement `docs/contract.md`. Until it is ready, the frontend runs against
`mock-server/`, which implements the same contract with simulated helmets.

Once it runs, point the frontend to it in `frontend/.env`:

```
VITE_WS_URL=ws://localhost:<port>/ws
VITE_API_URL=http://localhost:<port>
```
