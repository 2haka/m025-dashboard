import { ConnectionPill } from './components/ConnectionPill';
import { HelmetCard } from './components/HelmetCard';
import { LatencyPanel } from './components/LatencyPanel';
import { SummaryBar } from './components/SummaryBar';
import { ViolationsTable } from './components/ViolationsTable';
import { effectiveState, useLiveDashboard } from './hooks/useLiveDashboard';
import type { HelmetState } from './types/contract';

export default function App() {
  const { devices, violations, invalidCount, connection, loadError, now } = useLiveDashboard();
  const entries = Object.values(devices).sort((a, b) => a.last.deviceId.localeCompare(b.last.deviceId));

  const counts: Record<HelmetState, number> = { WORN: 0, REMOVED: 0, LINK_LOST: 0, UNKNOWN: 0 };
  for (const e of entries) counts[effectiveState(e, now, connection).helmet] += 1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <img src="/helmet.svg" alt="" width={28} height={28} />
          <div>
            <h1>Helmet–Tool Interlock</h1>
            <p>Supervisor dashboard · Team M025</p>
          </div>
        </div>
        <ConnectionPill state={connection} />
      </header>

      {connection !== 'open' && (
        <div className="banner banner--warn" role="alert">
          Not connected to the backend — helmet states are shown as <strong>Unknown</strong> until the link
          returns.
        </div>
      )}
      {loadError && connection === 'open' && (
        <div className="banner banner--danger" role="alert">
          Could not load history: {loadError}
        </div>
      )}

      <main className="content">
        <SummaryBar counts={counts} />

        <section aria-labelledby="helmets-title">
          <h2 id="helmets-title" className="section-title">
            Helmets
          </h2>
          {entries.length === 0 ? (
            <p className="empty">No helmets reporting yet.</p>
          ) : (
            <div className="grid">
              {entries.map((e) => (
                <HelmetCard key={e.last.deviceId} entry={e} now={now} connection={connection} />
              ))}
            </div>
          )}
        </section>

        <ViolationsTable items={violations} />
        <LatencyPanel />
      </main>

      <footer className="footer">
        Monitoring only — the tool is disabled locally by the machine unit, not by this dashboard. Skin
        temperature is a non-medical trend.
        {invalidCount > 0 && <span className="text--danger"> · {invalidCount} invalid messages dropped</span>}
      </footer>
    </div>
  );
}
