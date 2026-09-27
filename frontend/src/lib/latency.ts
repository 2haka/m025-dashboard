// Spec 3 evidence: latency from backend receipt (serverTs) to the status being painted.
//
// Validity condition: backend and browser run on the SAME machine (same clock).
// With two machines the clocks differ and the numbers are meaningless.

import { useSyncExternalStore } from 'react';

export interface LatencySample {
  deviceId: string;
  seq: number;
  serverTs: string;
  paintedAt: string;
  latencyMs: number;
}

const MAX_SAMPLES = 5000;
let samples: LatencySample[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Call right after dispatching a status update. Two animation frames later the
 * new state has been committed and painted, so that instant is the "updated" time.
 */
export function measureAfterPaint(deviceId: string, seq: number, serverTs: string): void {
  if (typeof document !== 'undefined' && document.hidden) return; // rAF is paused in background tabs
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const painted = Date.now();
      const latencyMs = painted - Date.parse(serverTs);
      if (!Number.isFinite(latencyMs)) return;
      samples = [
        ...samples.slice(-(MAX_SAMPLES - 1)),
        { deviceId, seq, serverTs, paintedAt: new Date(painted).toISOString(), latencyMs },
      ];
      notify();
    }),
  );
}

export function resetLatency(): void {
  samples = [];
  notify();
}

export function useLatencySamples(): LatencySample[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => samples,
  );
}

export interface LatencyStats {
  n: number;
  mean: number;
  p95: number;
  max: number;
  last: number;
  overLimit: number;
}

export function computeStats(list: LatencySample[], limitMs: number): LatencyStats | null {
  if (list.length === 0) return null;
  const values = list.map((s) => s.latencyMs).sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const p95 = values[Math.min(values.length - 1, Math.ceil(0.95 * values.length) - 1)];
  return {
    n: values.length,
    mean: sum / values.length,
    p95,
    max: values[values.length - 1],
    last: list[list.length - 1].latencyMs,
    overLimit: values.filter((v) => v > limitMs).length,
  };
}

export function downloadCsv(list: LatencySample[]): void {
  const header = 'deviceId,seq,serverTs,paintedAt,latencyMs';
  const rows = list.map((s) => [s.deviceId, s.seq, s.serverTs, s.paintedAt, s.latencyMs].join(','));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `latency-spec3-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
