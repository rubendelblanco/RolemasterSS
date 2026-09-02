import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBridge } from "./ws-bridge.js";
import { registerTools } from "./mcp-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // .env is optional if the vars are already set in the environment
}

const port = Number(process.env.RMSS_BRIDGE_PORT || 31000);
const secret = process.env.FOUNDRY_BRIDGE_SECRET;

if (!secret) {
  console.error("FOUNDRY_BRIDGE_SECRET is not set (mcp-server/.env or environment). Refusing to start.");
  process.exit(1);
}

const bridge = createBridge({ port, secret });
console.log(`[ws-bridge] listening on ws://localhost:${port}`);

const mcpServer = new McpServer({ name: "rmss-foundry-bridge", version: "0.1.0" });
registerTools(mcpServer, bridge);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
