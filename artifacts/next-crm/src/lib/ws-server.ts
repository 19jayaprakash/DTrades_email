import { WebSocketServer, WebSocket } from "ws";

const globalForWs = global as unknown as {
  wss: WebSocketServer | undefined;
  clients: Set<WebSocket> | undefined;
};

export function getWsServer() {
  if (!globalForWs.wss) {
    const port = 8080;
    try {
      globalForWs.wss = new WebSocketServer({ port });
      globalForWs.clients = new Set<WebSocket>();
      console.log(`[WebSocket] Server successfully started on port ${port}`);

      globalForWs.wss.on("connection", (ws) => {
        globalForWs.clients?.add(ws);
        
        ws.on("close", () => {
          globalForWs.clients?.delete(ws);
        });

        ws.on("error", (err) => {
          console.error("[WebSocket] Client connection error:", err);
          globalForWs.clients?.delete(ws);
        });
      });

      globalForWs.wss.on("error", (err) => {
        console.error("[WebSocket] Server error:", err);
      });

    } catch (err) {
      console.error("[WebSocket] Failed to start WebSocket server:", err);
    }
  }

  return {
    wss: globalForWs.wss,
    clients: globalForWs.clients || new Set<WebSocket>(),
  };
}

export function broadcastStatusUpdate(data: any) {
  const { clients } = getWsServer();
  if (clients.size === 0) return;
  
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error("[WebSocket] Failed to send message to client:", err);
      }
    }
  }
}
