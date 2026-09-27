import { parseServerMessage, type ServerMessage } from '../types/contract';

export type ConnectionState = 'connecting' | 'open' | 'closed';

interface Options {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onConnectionChange: (state: ConnectionState) => void;
  onInvalid?: (raw: string) => void;
}

/**
 * WebSocket client with exponential-backoff reconnect (0.5 s → 8 s).
 * Invalid frames are dropped and reported, never passed to the UI.
 * Returns a function that closes the connection for good.
 */
export function connectLive({ url, onMessage, onConnectionChange, onInvalid }: Options): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    onConnectionChange('connecting');
    socket = new WebSocket(url);

    socket.onopen = () => {
      retry = 0;
      onConnectionChange('open');
    };

    socket.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : '';
      const msg = parseServerMessage(raw);
      if (msg) onMessage(msg);
      else onInvalid?.(raw);
    };

    socket.onclose = () => {
      onConnectionChange('closed');
      if (stopped) return;
      const delay = Math.min(8000, 500 * 2 ** retry++);
      timer = setTimeout(open, delay);
    };

    socket.onerror = () => socket?.close();
  };

  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
