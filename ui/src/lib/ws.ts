import { useEffect, useRef, useCallback } from "react";
import type { WsMessage } from "@zerohand/shared";

type WsHandler = (msg: WsMessage) => void;

export function useWebSocket(onMessage: WsHandler) {
  const ws = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(url);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        onMessageRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onerror = (err) => console.error("[WS] Error:", err);

    ws.current = socket;
    return () => {
      socket.close();
    };
  }, []);

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
