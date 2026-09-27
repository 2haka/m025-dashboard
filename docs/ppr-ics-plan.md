# PPR — ICS Frontend Demonstration Plan (Khalid)

| Item | Requirement | What the prototype shows | Evidence to collect | Status |
|------|-------------|--------------------------|---------------------|--------|
| **C2** | Dashboard is web-based and built with open-source frameworks | Runs in any browser, no client install. Stack: React, Vite, Node, ws, MongoDB, Mosquitto (all open-source) | Screenshot in 2 browsers + table of frameworks and licenses | Not yet verified |
| **Spec 3** | Dashboard updates worker compliance status within **2 s** of data transmission | Built-in latency panel: `render time − serverTs` per message | CSV export, N ≥ 100 messages, report mean / p95 / max | Not yet verified |
| **IS1** | Detect helmet removal and update the dashboard within **5 s**, ≥ **95 %** accuracy | Real helmet ESP32 → backend → dashboard | 60 fps video of helmet + screen; ≥ 40 wear/remove trials; count correct | Not yet verified |

## Measurement notes

- **Spec 3**: backend and browser must run on the **same machine** so `serverTs` and the browser
  clock are the same clock. Otherwise the result is invalid.
- **IS1**: time is measured from the video (frame of removal → frame the card changes).
  Accuracy = correct detections ÷ total trials.
- No number goes into slides/report until it is measured. Until then: "Not yet verified".
