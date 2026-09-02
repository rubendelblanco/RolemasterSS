import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const COMMAND_TIMEOUT_MS = 15000;

export function createBridge({ port, secret }) {
  const wss = new WebSocketServer({ port });
  let activeSocket = null;
  const pending = new Map();

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url, "http://localhost");
    const apiKey = url.searchParams.get("apiKey");

    if (apiKey !== secret) {
      socket.close(4001, "invalid apiKey");
      return;
    }

    if (activeSocket && activeSocket !== socket) {
      activeSocket.close(4000, "replaced by a new connection");
    }
    activeSocket = socket;
    console.log("[ws-bridge] Foundry module connected");

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn("[ws-bridge] received non-JSON message, ignoring");
        return;
      }
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.success) waiter.resolve(msg.data);
      else waiter.reject(new Error(msg.error || "Foundry command failed"));
    });

    socket.on("close", () => {
      if (activeSocket === socket) {
        activeSocket = null;
        console.log("[ws-bridge] Foundry module disconnected");
      }
    });

    socket.on("error", (err) => {
      console.error("[ws-bridge] socket error:", err.message);
    });
  });

  function isConnected() {
    return activeSocket !== null && activeSocket.readyState === activeSocket.OPEN;
  }

  function sendCommand(type, params) {
    if (!isConnected()) {
      return Promise.reject(new Error("No Foundry module is currently connected to the bridge."));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Foundry command "${type}" timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      activeSocket.send(JSON.stringify({ id, type, params }));
    });
  }

  return { isConnected, sendCommand, close: () => wss.close() };
}
