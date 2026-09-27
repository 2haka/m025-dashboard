// Mirrors docs/contract.md. If the contract changes, change this file in the same commit.

export const HELMET_STATES = ['UNKNOWN', 'WORN', 'REMOVED', 'LINK_LOST'] as const;
export const TOOL_STATES = ['UNKNOWN', 'ENABLED', 'DISABLED'] as const;
export const EVENT_TYPES = ['HELMET_REMOVED', 'LINK_LOST'] as const;
/** UNKNOWN = the tool ESP32 did not report its relay state, so the action is not claimed. */
export const ACTIONS = ['TOOL_DISABLED', 'NONE', 'UNKNOWN'] as const;

export type HelmetState = (typeof HELMET_STATES)[number];
export type ToolState = (typeof TOOL_STATES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Action = (typeof ACTIONS)[number];

export interface StatusMessage {
  type: 'status';
  deviceId: string;
  workerId: string;
  toolId: string;
  seq: number;
  helmetState: HelmetState;
  toolState: ToolState;
  /** Forehead skin temperature (non-medical). null = no valid reading. */
  tempC: number | null;
  /** Device-side time. null: current firmware sends no timestamp (payload is one char). */
  deviceTs: string | null;
  /** Backend receive-and-validate time. Start point of the Spec 3 measurement. */
  serverTs: string;
}

export interface Violation {
  id: string;
  deviceId: string;
  workerId: string;
  toolId: string;
  eventType: EventType;
  action: Action;
  /** When the relay report confirmed the action (only for TOOL_DISABLED confirmed after the fact). */
  actionTs?: string;
  deviceTs: string | null;
  serverTs: string;
}

export interface ViolationMessage {
  type: 'violation';
  violation: Violation;
}

export type ServerMessage = StatusMessage | ViolationMessage;

// ---------------------------------------------------------------- runtime guards
// Never trust the wire: a malformed message must be dropped, not rendered as "safe".

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null;
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isIso = (x: unknown): x is string => isStr(x) && !Number.isNaN(Date.parse(x));
const oneOf = <T extends readonly string[]>(list: T, x: unknown): x is T[number] =>
  typeof x === 'string' && (list as readonly string[]).includes(x);

export function isStatusMessage(x: unknown): x is StatusMessage {
  return (
    isObj(x) &&
    x.type === 'status' &&
    isStr(x.deviceId) &&
    isStr(x.workerId) &&
    isStr(x.toolId) &&
    Number.isInteger(x.seq) &&
    oneOf(HELMET_STATES, x.helmetState) &&
    oneOf(TOOL_STATES, x.toolState) &&
    (x.tempC === null || typeof x.tempC === 'number') &&
    (x.deviceTs === null || isIso(x.deviceTs)) &&
    isIso(x.serverTs)
  );
}

export function isViolation(x: unknown): x is Violation {
  return (
    isObj(x) &&
    isStr(x.id) &&
    isStr(x.deviceId) &&
    isStr(x.workerId) &&
    isStr(x.toolId) &&
    oneOf(EVENT_TYPES, x.eventType) &&
    oneOf(ACTIONS, x.action) &&
    (x.deviceTs === null || isIso(x.deviceTs)) &&
    isIso(x.serverTs)
  );
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isStatusMessage(data)) return data;
  if (isObj(data) && data.type === 'violation' && isViolation(data.violation)) {
    return data as unknown as ViolationMessage;
  }
  return null;
}
