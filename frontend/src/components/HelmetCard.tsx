import type { ConnectionState } from '../services/wsClient';
import { effectiveState, type DeviceEntry } from '../hooks/useLiveDashboard';
import { HelmetBadge, ToolBadge } from './StateBadge';

interface Props {
  entry: DeviceEntry;
  now: number;
  connection: ConnectionState;
}

export function HelmetCard({ entry, now, connection }: Props) {
  const { helmet, tool, stale } = effectiveState(entry, now, connection);
  const { last } = entry;
  const ageS = Math.max(0, (now - entry.receivedAt) / 1000);

  return (
    <article className={`card card--${helmet.toLowerCase()}`} aria-label={`Helmet ${last.deviceId}`}>
      <header className="card__head">
        <div>
          <h3 className="card__title">{last.deviceId}</h3>
          <p className="card__sub">
            Worker <strong>{last.workerId}</strong> · Tool <strong>{last.toolId}</strong>
          </p>
        </div>
        <ToolBadge state={tool} />
      </header>

      <div className="card__state">
        <HelmetBadge state={helmet} large />
      </div>

      <dl className="card__meta">
        <div>
          <dt>Skin temp.</dt>
          <dd>{!stale && last.tempC !== null ? `${last.tempC.toFixed(1)} °C` : '—'}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>{ageS < 1 ? 'just now' : `${ageS.toFixed(0)} s ago`}</dd>
        </div>
        <div>
          <dt>Seq</dt>
          <dd>{last.seq}</dd>
        </div>
      </dl>
    </article>
  );
}
