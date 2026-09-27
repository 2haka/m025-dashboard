import type { HelmetState } from '../types/contract';

const ORDER: { state: HelmetState; label: string; tone: string }[] = [
  { state: 'WORN', label: 'Worn', tone: 'ok' },
  { state: 'REMOVED', label: 'Removed', tone: 'danger' },
  { state: 'LINK_LOST', label: 'Link lost', tone: 'warn' },
  { state: 'UNKNOWN', label: 'Unknown', tone: 'muted' },
];

export function SummaryBar({ counts }: { counts: Record<HelmetState, number> }) {
  return (
    <section className="summary" aria-label="Compliance summary">
      {ORDER.map(({ state, label, tone }) => (
        <div key={state} className={`summary__item summary__item--${tone}`}>
          <span className="summary__value">{counts[state]}</span>
          <span className="summary__label">{label}</span>
        </div>
      ))}
    </section>
  );
}
