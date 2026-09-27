import type { HelmetState, ToolState } from '../types/contract';

// Every state has text + icon, never color alone.
const HELMET: Record<HelmetState, { label: string; icon: string; tone: string }> = {
  WORN: { label: 'Worn', icon: '✓', tone: 'ok' },
  REMOVED: { label: 'Removed', icon: '✕', tone: 'danger' },
  LINK_LOST: { label: 'Link lost', icon: '⚠', tone: 'warn' },
  UNKNOWN: { label: 'Unknown', icon: '?', tone: 'muted' },
};

const TOOL: Record<ToolState, { label: string; tone: string }> = {
  ENABLED: { label: 'Tool enabled', tone: 'ok' },
  DISABLED: { label: 'Tool disabled', tone: 'danger' },
  UNKNOWN: { label: 'Tool unknown', tone: 'muted' },
};

export function HelmetBadge({ state, large = false }: { state: HelmetState; large?: boolean }) {
  const s = HELMET[state];
  return (
    <span className={`badge badge--${s.tone}${large ? ' badge--lg' : ''}`}>
      <span aria-hidden="true" className="badge__icon">
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}

export function ToolBadge({ state }: { state: ToolState }) {
  const s = TOOL[state];
  return <span className={`chip chip--${s.tone}`}>{s.label}</span>;
}
