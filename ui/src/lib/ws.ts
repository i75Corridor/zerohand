import { useEffect, useRef, useCallback } from "react";
import type { WsMessage } from "@zerohand/shared";

type WsHandler = (msg: WsMessage) => void;

// ── Singleton WebSocket connection shared across all hook consumers ──────────

let sharedSocket: WebSocket | null = null;
let refCount = 0;
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
    // Auto-reconnect after a brief delay if there are still active consumers
    if (refCount > 0) {
      setTimeout(() => {
        if (refCount > 0) {
          sharedSocket = null;
          getSocket();
        }
      }, 2000);
    }
  };

  sharedSocket = socket;
  return socket;
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
      if (refCount === 0 && sharedSocket) {
        sharedSocket.close();
        sharedSocket = null;
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
