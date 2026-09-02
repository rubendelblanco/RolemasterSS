import { z } from "zod";

// Every read-only command the foundry-api-bridge module supports. Kept as an allowlist
// (rather than a raw passthrough) so foundry_read can never be used to create, update,
// delete, roll, or execute anything - only look at what's already there.
const READ_COMMANDS = [
  "get-world-info",
  "get-actors", "get-actor", "filter-actors", "get-actor-items", "get-actor-effects",
  "get-items", "get-item", "filter-items",
  "get-journals", "get-journal",
  "get-compendiums", "get-compendium", "get-compendium-index", "get-compendium-document",
  "search-compendium", "search-compendiums", "search-compendium-pages", "resolve-uuid",
  "get-scene", "get-scenes-list", "get-scene-tokens",
  "get-combat-state", "get-combat-turn-context",
  "get-chat-messages",
  "get-walls", "get-notes",
  "get-folders", "get-folder",
  "get-macros", "get-macro",
  "get-playlists", "get-playlist",
  "get-world-time", "get-pause-state"
];

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
    "foundry_update_item",
    {
      title: "Update Foundry item",
      description:
        "Patch an existing world-level Item document (name, img, folder, and/or system fields). " +
        "Only the keys you pass are touched - system is merged into the existing data, not replaced " +
        "(note: Foundry replaces arrays wholesale rather than merging them element-by-element, so " +
        "resending an array field overwrites it entirely). There is deliberately no delete tool - " +
        "the user deletes items themselves in Foundry.",
      inputSchema: {
        id: z.string().describe("The item's document id (from foundry_create_item or foundry_read)"),
        name: z.string().optional(),
        img: z.string().optional(),
        folder: z.string().optional().describe("Folder id to move the item into"),
        system: z.record(z.any()).optional().describe("Partial system data to merge in")
      }
    },
    async ({ id, name, img, folder, system }) => {
      const result = await bridge.sendCommand("update-item", { itemId: id, name, img, folder, system });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  mcpServer.registerTool(
    "foundry_read",
    {
      title: "Read data from Foundry",
      description:
        "Read-only access to everything already in the connected Foundry world: items, actors, " +
        "journals, compendiums (incl. searching them), scenes, tokens, combat state, chat, walls, " +
        "notes, folders, macros, playlists, world time. Cannot create, update, delete, roll, or " +
        "execute anything - use foundry_create_item for creation. `type` is the exact command name, " +
        "e.g. \"get-actors\", \"get-item\" (params: {id}), \"filter-items\" (params: {type} to list " +
        "all items of a given type, e.g. all \"skill\" or \"profession\" items), \"search-compendium\" " +
        "(params: {pack, query}), \"get-folder\" (params: {id}). Pass {} for commands that take no params.",
      inputSchema: {
        type: z.enum(READ_COMMANDS).describe("Which read command to run"),
        params: z.record(z.any()).optional().describe("Parameters for that command, e.g. {id: \"...\"}")
      }
    },
    async ({ type, params }) => {
      const result = await bridge.sendCommand(type, params || {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
