import { z } from "zod";

export function registerTools(mcpServer, bridge) {
  mcpServer.registerTool(
    "foundry_create_item",
    {
      title: "Create Foundry item",
      description:
        "Create a world-level Item document in the connected Foundry VTT world. " +
        "In this system (RMSS) a spell is just an Item with type \"spell\" - use " +
        "this same tool for both items and spells, passing the fields that type " +
        "expects under `system` (see the system's template.json for the exact shape).",
      inputSchema: {
        name: z.string().describe("Display name of the item/spell"),
        type: z.string().describe("Document type, e.g. \"item\", \"weapon\", \"armor\", \"spell\""),
        system: z.record(z.any()).optional().describe("System-specific data fields for this item type")
      }
    },
    async ({ name, type, system }) => {
      const result = await bridge.sendCommand("create-item", { name, type, system });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  mcpServer.registerTool(
    "foundry_get_world_info",
    {
      title: "Get connected Foundry world info",
      description: "Fetch basic info about the currently connected Foundry world - useful as a connectivity check.",
      inputSchema: {}
    },
    async () => {
      const result = await bridge.sendCommand("get-world-info", {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
