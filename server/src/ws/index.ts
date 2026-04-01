import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { WsMessage, WsIncomingChat } from "@zerohand/shared";

export class WsManager {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private chatHandler: ((msg: WsIncomingChat) => void) | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { type: string };
          if (msg.type === "chat" && this.chatHandler) {
            this.chatHandler(msg as WsIncomingChat);
          }
        } catch {
          // ignore malformed messages
        }
      });
    });
  }

  onChatMessage(handler: (msg: WsIncomingChat) => void): void {
    this.chatHandler = handler;
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
