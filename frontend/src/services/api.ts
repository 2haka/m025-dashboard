import { config } from '../config';
import { isStatusMessage, isViolation, type StatusMessage, type Violation } from '../types/contract';

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${config.apiUrl}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Initial snapshot: latest status per device. Invalid entries are dropped. */
export async function fetchStatus(): Promise<StatusMessage[]> {
  const data = await getJson('/api/status');
  return Array.isArray(data) ? data.filter(isStatusMessage) : [];
}

export interface ViolationFilter {
  workerId?: string;
  toolId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function fetchViolations(filter: ViolationFilter = {}): Promise<Violation[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const data = (await getJson(`/api/violations?${qs}`)) as { items?: unknown };
  return Array.isArray(data?.items) ? data.items.filter(isViolation) : [];
}
