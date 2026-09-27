// Single place for environment-dependent settings (see .env.example).

export const config = {
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000/ws',
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  staleMs: Number(import.meta.env.VITE_STALE_MS ?? 3000),
  /** Spec 3 limit (ms). */
  spec3LimitMs: 2000,
} as const;
