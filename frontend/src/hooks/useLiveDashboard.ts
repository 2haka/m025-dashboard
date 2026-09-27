import { useCallback, useEffect, useReducer, useState } from 'react';
import { config } from '../config';
import { measureAfterPaint } from '../lib/latency';
import { fetchStatus, fetchViolations } from '../services/api';
import { connectLive, type ConnectionState } from '../services/wsClient';
import type { HelmetState, StatusMessage, ToolState, Violation } from '../types/contract';

export interface DeviceEntry {
  last: StatusMessage;
  /** Browser time (ms) when the last message for this device arrived. */
  receivedAt: number;
}

interface State {
  devices: Record<string, DeviceEntry>;
  violations: Violation[];
  invalidCount: number;
}

type Msg =
  | { kind: 'status'; status: StatusMessage; at: number }
  | { kind: 'violation'; violation: Violation }
  | { kind: 'violations-loaded'; items: Violation[] }
  | { kind: 'invalid' };

const MAX_VIOLATIONS = 500;

function reducer(state: State, msg: Msg): State {
  switch (msg.kind) {
    case 'status': {
      const prev = state.devices[msg.status.deviceId];
      if (prev && msg.status.seq <= prev.last.seq) {
        // Lower seq with a newer serverTs = the device rebooted and restarted its counter: accept.
        // Otherwise it is a duplicate or out-of-order frame: keep what we have.
        const rebooted =
          msg.status.seq < prev.last.seq && Date.parse(msg.status.serverTs) > Date.parse(prev.last.serverTs);
        if (!rebooted) return state;
      }
      return {
        ...state,
        devices: { ...state.devices, [msg.status.deviceId]: { last: msg.status, receivedAt: msg.at } },
      };
    }
    case 'violation': {
      // Same id again = update (e.g. relay confirmed TOOL_DISABLED): replace in place.
      if (state.violations.some((v) => v.id === msg.violation.id)) {
        return {
          ...state,
          violations: state.violations.map((v) => (v.id === msg.violation.id ? msg.violation : v)),
        };
      }
      return { ...state, violations: [msg.violation, ...state.violations].slice(0, MAX_VIOLATIONS) };
    }
    case 'violations-loaded': {
      const known = new Set(msg.items.map((v) => v.id));
      const liveOnly = state.violations.filter((v) => !known.has(v.id));
      const merged = [...liveOnly, ...msg.items].sort((a, b) => b.serverTs.localeCompare(a.serverTs));
      return { ...state, violations: merged.slice(0, MAX_VIOLATIONS) };
    }
    case 'invalid':
      return { ...state, invalidCount: state.invalidCount + 1 };
  }
}

/**
 * Display rules (safety-relevant — see docs/contract.md):
 *  - dashboard not connected to backend  → UNKNOWN (we cannot know)
 *  - no message from device for staleMs  → LINK_LOST
 *  - otherwise                           → what the device reported
 * Missing or stale data is never shown as WORN / ENABLED.
 */
export function effectiveState(
  entry: DeviceEntry,
  now: number,
  connection: ConnectionState,
): { helmet: HelmetState; tool: ToolState; stale: boolean } {
  if (connection !== 'open') return { helmet: 'UNKNOWN', tool: 'UNKNOWN', stale: true };
  if (now - entry.receivedAt > config.staleMs) return { helmet: 'LINK_LOST', tool: 'UNKNOWN', stale: true };
  return { helmet: entry.last.helmetState, tool: entry.last.toolState, stale: false };
}

export function useLiveDashboard() {
  const [state, dispatch] = useReducer(reducer, { devices: {}, violations: [], invalidCount: 0 });
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Clock for stale detection.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const loadSnapshot = useCallback(async () => {
    try {
      const [statuses, violations] = await Promise.all([fetchStatus(), fetchViolations({ limit: 100 })]);
      // Age snapshot entries by their serverTs, so an old last-known status is
      // immediately shown as LINK_LOST instead of looking fresh for staleMs.
      statuses.forEach((status) =>
        dispatch({ kind: 'status', status, at: Math.min(Date.now(), Date.parse(status.serverTs)) }),
      );
      dispatch({ kind: 'violations-loaded', items: violations });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    return connectLive({
      url: config.wsUrl,
      onConnectionChange: (s) => {
        setConnection(s);
        if (s === 'open') void loadSnapshot(); // (re)sync after every (re)connect
      },
      onMessage: (msg) => {
        if (msg.type === 'status') {
          dispatch({ kind: 'status', status: msg, at: Date.now() });
          measureAfterPaint(msg.deviceId, msg.seq, msg.serverTs);
        } else {
          dispatch({ kind: 'violation', violation: msg.violation });
        }
      },
      onInvalid: () => dispatch({ kind: 'invalid' }),
    });
  }, [loadSnapshot]);

  return { ...state, connection, loadError, now };
}
