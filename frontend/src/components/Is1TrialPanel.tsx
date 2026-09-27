import { useState } from 'react';
import { config } from '../config';
import { useIs1Trials } from '../hooks/useIs1Trials';
import { canStartTrial, summarizeTrials, trialsToCsv, type Trial, type TrialExpectation } from '../lib/is1Trial';
import type { HelmetState } from '../types/contract';
import { HelmetBadge } from './StateBadge';

const fmtMs = (ms: number) => `${Math.round(ms)} ms`;

const RESULT: Record<Trial['result'], { label: string; icon: string; tone: string }> = {
  PASS: { label: 'Pass', icon: '✓', tone: 'ok' },
  FAIL: { label: 'Fail', icon: '✕', tone: 'danger' },
  PENDING: { label: 'Running', icon: '…', tone: 'muted' },
};

function downloadCsv(trials: readonly Trial[]): void {
  const blob = new Blob([trialsToCsv(trials)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `is1-trials-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function timeCell(t: Trial): string {
  if (t.timeToDetectMs !== null) return fmtMs(t.timeToDetectMs);
  return t.result === 'FAIL' ? 'timeout' : '—';
}

export function Is1TrialPanel({ displayed }: { displayed: Readonly<Record<string, HelmetState>> }) {
  const { trials, start, reset } = useIs1Trials(displayed, config.is1LimitMs);
  const deviceIds = Object.keys(displayed).sort();
  const [picked, setPicked] = useState('');
  const deviceId = deviceIds.includes(picked) ? picked : (deviceIds[0] ?? '');
  const current = deviceId ? displayed[deviceId] : undefined;
  const summary = summarizeTrials(trials);

  const startButton = (expected: TrialExpectation, label: string) => (
    <button
      type="button"
      onClick={() => start(deviceId, expected)}
      disabled={!canStartTrial(trials, deviceId, expected, current)}
    >
      {label}
    </button>
  );

  return (
    <section className="panel" aria-labelledby="is1-title">
      <header className="panel__head">
        <div>
          <h2 id="is1-title">IS1 trial mode — helmet removal detection</h2>
          <p className="panel__hint">
            Click start, then change the helmet. Pass = displayed state matches within {config.is1LimitMs / 1000}{' '}
            s. Times start at the click, so they include operator reaction time — the official IS1 time is
            measured from video.
          </p>
        </div>
        <div className="panel__actions">
          <button type="button" onClick={() => downloadCsv(trials)} disabled={trials.length === 0}>
            Export CSV
          </button>
          <button type="button" className="btn--ghost" onClick={reset} disabled={trials.length === 0}>
            Reset
          </button>
        </div>
      </header>

      <div className="trial-controls">
        <div className="filters">
          <label>
            Helmet
            <select value={deviceId} onChange={(e) => setPicked(e.target.value)} disabled={deviceIds.length === 0}>
              {deviceIds.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
        </div>
        {current && <HelmetBadge state={current} />}
        {startButton('REMOVED', 'Start trial: expect REMOVED')}
        {startButton('WORN', 'Start trial: expect WORN')}
      </div>

      {trials.length === 0 ? (
        <p className="empty">No trials yet.</p>
      ) : (
        <>
          <dl className="stats">
            <div>
              <dt>Trials</dt>
              <dd>{summary.total}</dd>
            </div>
            <div>
              <dt>Passed</dt>
              <dd>{summary.passed}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd className={summary.failed ? 'text--danger' : undefined}>{summary.failed}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{summary.accuracyPct === null ? '—' : `${summary.accuracyPct.toFixed(1)} %`}</dd>
            </div>
            <div>
              <dt>Max time</dt>
              <dd>{summary.maxTimeMs === null ? '—' : fmtMs(summary.maxTimeMs)}</dd>
            </div>
            <div>
              <dt>Running</dt>
              <dd>{summary.pending}</dd>
            </div>
          </dl>

          <div className="table-wrap trial-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Helmet</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Detected</th>
                  <th scope="col">Time to detect</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {[...trials].reverse().map((t) => {
                  const r = RESULT[t.result];
                  return (
                    <tr key={t.n}>
                      <td className="mono">{t.n}</td>
                      <td>{t.deviceId}</td>
                      <td>
                        <HelmetBadge state={t.expected} />
                      </td>
                      <td>{t.detected ? <HelmetBadge state={t.detected} /> : '—'}</td>
                      <td className="mono">{timeCell(t)}</td>
                      <td>
                        <span className={`chip chip--${r.tone}`}>
                          <span aria-hidden="true">{r.icon}</span> {r.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
