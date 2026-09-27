import { config } from '../config';
import { computeStats, downloadCsv, resetLatency, useLatencySamples } from '../lib/latency';

const fmt = (ms: number) => `${Math.round(ms)} ms`;

export function LatencyPanel() {
  const samples = useLatencySamples();
  const stats = computeStats(samples, config.spec3LimitMs);

  return (
    <section className="panel" aria-labelledby="latency-title">
      <header className="panel__head">
        <div>
          <h2 id="latency-title">Spec 3 — update latency</h2>
          <p className="panel__hint">
            serverTs → painted on screen. Limit {config.spec3LimitMs / 1000} s. Valid only when backend and
            browser run on the same machine.
          </p>
        </div>
        <div className="panel__actions">
          <button type="button" onClick={() => downloadCsv(samples)} disabled={!stats}>
            Export CSV
          </button>
          <button type="button" className="btn--ghost" onClick={resetLatency} disabled={!stats}>
            Reset
          </button>
        </div>
      </header>

      {stats ? (
        <dl className="stats">
          <div>
            <dt>Samples</dt>
            <dd>{stats.n}</dd>
          </div>
          <div>
            <dt>Mean</dt>
            <dd>{fmt(stats.mean)}</dd>
          </div>
          <div>
            <dt>p95</dt>
            <dd>{fmt(stats.p95)}</dd>
          </div>
          <div>
            <dt>Max</dt>
            <dd>{fmt(stats.max)}</dd>
          </div>
          <div>
            <dt>Last</dt>
            <dd>{fmt(stats.last)}</dd>
          </div>
          <div>
            <dt>Over limit</dt>
            <dd className={stats.overLimit ? 'text--danger' : undefined}>{stats.overLimit}</dd>
          </div>
        </dl>
      ) : (
        <p className="empty">Waiting for status messages…</p>
      )}
    </section>
  );
}
