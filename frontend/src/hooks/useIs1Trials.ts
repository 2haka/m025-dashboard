import { useCallback, useEffect, useState } from 'react';
import { evaluateTrials, startTrial, type Trial, type TrialExpectation } from '../lib/is1Trial';
import type { HelmetState } from '../types/contract';

/**
 * Holds IS1 trials and settles them against the states the dashboard is displaying.
 * `displayed` must be the same effectiveState() output the helmet cards render, so a
 * trial only passes on what the supervisor actually sees.
 */
export function useIs1Trials(displayed: Readonly<Record<string, HelmetState>>, limitMs: number) {
  const [trials, setTrials] = useState<Trial[]>([]);

  // Runs after each commit with new displayed states (status message or the stale-clock tick).
  // The tick also enforces timeouts, so a timeout is recorded at most one tick late.
  useEffect(() => {
    setTrials((prev) => evaluateTrials(prev, displayed, performance.now(), limitMs));
  }, [displayed, limitMs]);

  const start = useCallback((deviceId: string, expected: TrialExpectation) => {
    setTrials((prev) => startTrial(prev, deviceId, expected, performance.now(), new Date().toISOString()));
  }, []);

  const reset = useCallback(() => setTrials([]), []);

  return { trials, start, reset };
}
