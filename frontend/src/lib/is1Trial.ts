// IS1 evidence: after the operator starts a trial, does the helmet's DISPLAYED state
// reach the expected value within the limit?
//
// Pure logic only (no React, no DOM, no clock) so it can be unit-tested.
// Timing caveat: the start is a button click, so every time here includes the
// operator's reaction time. The official IS1 timing comes from video.

import type { HelmetState } from '../types/contract';

export type TrialExpectation = Extract<HelmetState, 'WORN' | 'REMOVED'>;
export type TrialResult = 'PENDING' | 'PASS' | 'FAIL';

export interface Trial {
  n: number;
  deviceId: string;
  expected: TrialExpectation;
  /** Wall-clock start, for the CSV. */
  startedAtIso: string;
  /** Monotonic start (performance.now()), used for elapsed time. */
  startedAt: number;
  /** Displayed state when the trial ended (null while pending). */
  detected: HelmetState | null;
  /** Click → expected state displayed. null while pending or on timeout. */
  timeToDetectMs: number | null;
  result: TrialResult;
}

export interface Is1Summary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  /** Passed / finished trials, 0–100. null when nothing has finished. */
  accuracyPct: number | null;
  /** Slowest detection among trials that detected the state. null if none. */
  maxTimeMs: number | null;
}

/** Operator may start a trial only if the helmet is not already showing the expected state
 *  and no trial for that helmet is still running. */
export function canStartTrial(
  trials: readonly Trial[],
  deviceId: string,
  expected: TrialExpectation,
  displayed: HelmetState | undefined,
): boolean {
  if (displayed === undefined || displayed === expected) return false;
  return !trials.some((t) => t.deviceId === deviceId && t.result === 'PENDING');
}

export function startTrial(
  trials: readonly Trial[],
  deviceId: string,
  expected: TrialExpectation,
  startedAt: number,
  startedAtIso: string,
): Trial[] {
  const n = trials.length === 0 ? 1 : trials[trials.length - 1].n + 1;
  return [
    ...trials,
    { n, deviceId, expected, startedAt, startedAtIso, detected: null, timeToDetectMs: null, result: 'PENDING' },
  ];
}

/**
 * Settle pending trials against the states currently displayed.
 * Only an exact WORN / REMOVED match counts; LINK_LOST and UNKNOWN never match.
 * A match seen after the limit is a FAIL (time kept); no match by the limit is a timeout FAIL.
 * Returns the same array when nothing changed.
 */
export function evaluateTrials(
  trials: Trial[],
  displayed: Readonly<Record<string, HelmetState>>,
  now: number,
  limitMs: number,
): Trial[] {
  let changed = false;
  const next = trials.map((t) => {
    if (t.result !== 'PENDING') return t;
    const state = displayed[t.deviceId] ?? 'UNKNOWN';
    const elapsed = now - t.startedAt;
    if (state === t.expected) {
      changed = true;
      return { ...t, detected: state, timeToDetectMs: elapsed, result: elapsed <= limitMs ? 'PASS' : 'FAIL' } as const;
    }
    if (elapsed > limitMs) {
      changed = true;
      return { ...t, detected: state, timeToDetectMs: null, result: 'FAIL' } as const;
    }
    return t;
  });
  return changed ? next : trials;
}

export function summarizeTrials(trials: readonly Trial[]): Is1Summary {
  const passed = trials.filter((t) => t.result === 'PASS').length;
  const failed = trials.filter((t) => t.result === 'FAIL').length;
  const finished = passed + failed;
  const times = trials.flatMap((t) => (t.timeToDetectMs === null ? [] : [t.timeToDetectMs]));
  return {
    total: trials.length,
    passed,
    failed,
    pending: trials.length - finished,
    accuracyPct: finished === 0 ? null : (passed / finished) * 100,
    maxTimeMs: times.length === 0 ? null : Math.max(...times),
  };
}

export function trialsToCsv(trials: readonly Trial[]): string {
  const header = 'n,deviceId,expected,detected,startedAt,timeToDetectMs,result';
  const rows = trials.map((t) =>
    [
      t.n,
      t.deviceId,
      t.expected,
      t.detected ?? '',
      t.startedAtIso,
      t.timeToDetectMs === null ? (t.result === 'FAIL' ? 'timeout' : '') : Math.round(t.timeToDetectMs),
      t.result,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}
