/// <reference types="vite/client" />
import { useEffect, useRef, useCallback } from "react";
import type { WsMessage } from "@zerohand/shared";

type WsHandler = (msg: WsMessage) => void;

// ── Singleton WebSocket connection shared across all hook consumers ──────────

let sharedSocket: WebSocket | null = null;
let refCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<WsHandler>();

function getSocket(): WebSocket {
  if (sharedSocket && sharedSocket.readyState !== WebSocket.CLOSED) {
    return sharedSocket;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  const socket = new WebSocket(url);

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as WsMessage;
      handlers.forEach((h) => h(msg));
    } catch {
      // ignore malformed messages
    }
  };

  socket.onerror = (err) => console.error("[WS] Error:", err);

  socket.onclose = () => {
    // Only clear sharedSocket if it's still this socket (not a newer one)
    if (sharedSocket === socket) sharedSocket = null;
    // Auto-reconnect, but only if no socket was created in the meantime
    // (guards against React Strict Mode's mount→cleanup→remount creating a new
    // socket via getSocket() before this onclose timer fires)
    if (refCount > 0) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (refCount > 0 && !sharedSocket) {
          getSocket();
        }
      }, 2000);
    }
  };

  sharedSocket = socket;
  return socket;
}

// ── HMR cleanup — prevents stale sockets accumulating across Vite hot-reloads ─
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (sharedSocket) {
      sharedSocket.onerror = () => {};
      sharedSocket.onmessage = null;
      sharedSocket.close();
      sharedSocket = null;
    }
    handlers.clear();
    refCount = 0;
  });
}

export function useWebSocket(onMessage: WsHandler) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Stable wrapper that delegates to the latest callback ref
  const stableHandler = useRef<WsHandler>((msg) => onMessageRef.current(msg));

  useEffect(() => {
    const handler = stableHandler.current;
    handlers.add(handler);
    refCount++;
    getSocket(); // ensure connection exists

    return () => {
      handlers.delete(handler);
      refCount--;
      if (refCount === 0) {
        // Cancel any pending reconnect — we no longer need a connection
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (sharedSocket) {
          // Suppress browser warnings and prevent stale message delivery during the
          // CLOSING handshake (the socket can still receive frames between .close()
          // and the onclose event firing).
          sharedSocket.onerror = () => {};
          sharedSocket.onmessage = null;
          sharedSocket.close();
          sharedSocket = null;
        }
      }
    };
  }, []);

  const send = useCallback((data: unknown) => {
    if (sharedSocket?.readyState === WebSocket.OPEN) {
      sharedSocket.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
