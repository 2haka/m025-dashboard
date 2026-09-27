import type { ConnectionState } from '../services/wsClient';

const MAP: Record<ConnectionState, { label: string; tone: string }> = {
  open: { label: 'Live', tone: 'ok' },
  connecting: { label: 'Connecting…', tone: 'warn' },
  closed: { label: 'Disconnected', tone: 'danger' },
};

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const s = MAP[state];
  return (
    <span className={`pill pill--${s.tone}`} role="status" aria-live="polite">
      <span className="pill__dot" aria-hidden="true" />
      {s.label}
    </span>
  );
}
