import { WebSocketServer, WebSocket } from "ws";

const globalForWs = global as unknown as {
  wss: WebSocketServer | undefined;
  clients: Set<WebSocket> | undefined;
};

const globalForScheduler = global as unknown as {
  queueInterval: NodeJS.Timeout | undefined;
};

export function startBackgroundScheduler() {
  if (!globalForScheduler.queueInterval) {
    console.log("[Background Scheduler] Initializing email queue worker...");
    globalForScheduler.queueInterval = setInterval(async () => {
      try {
        // Dynamically import to resolve circular dependency with broadcastStatusUpdate
        const { processQueue } = await import("./queue-processor");
        const outcome = await processQueue();
        if (outcome.results && outcome.results.length > 0) {
          console.log(`[Background Scheduler] Processed ${outcome.processedCount} emails:`, outcome.results);
        }
      } catch (err: any) {
        console.error("[Background Scheduler] Error running queue:", err.message);
      }
    }, 15000); // Check every 15 seconds
  }
}

export function getWsServer() {
  if (!globalForWs.wss) {
    const port = 8080;
    try {
      globalForWs.wss = new WebSocketServer({ port });
      globalForWs.clients = new Set<WebSocket>();
      console.log(`[WebSocket] Server successfully started on port ${port}`);

      // Start background email queue scheduler
      try {
        startBackgroundScheduler();
      } catch (err) {
        console.error("[Background Scheduler] Failed to start:", err);
      }

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

