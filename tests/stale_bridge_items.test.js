/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { findStaleBridgeItems } from "../module/sheets/items/embedded_spell_flag_util.js";

const item = (id, { bridge = false, open = false } = {}) => ({
  id,
  getFlag: (scope, key) => (bridge && scope === "rmss" && key === "embeddedSpellEdit" ? { spellListUuid: "Item.list", spellIndex: 0 } : undefined),
  sheet: { rendered: open }
});

describe("findStaleBridgeItems", () => {
  it("finds bridge copies whose sheet is closed, and nothing else", () => {
    const items = [
      item("plain-spell"),
      item("bridge-left-over", { bridge: true }),
      item("another-left-over", { bridge: true }),
      item("bridge-being-edited", { bridge: true, open: true })
    ];
    expect(findStaleBridgeItems(items).map((i) => i.id)).toEqual(["bridge-left-over", "another-left-over"]);
  });

  it("never touches a normal item, even one with a sheet closed", () => {
    expect(findStaleBridgeItems([item("a"), item("b")])).toEqual([]);
  });

  it("works on any iterable (a Foundry collection) and on an empty world", () => {
    expect(findStaleBridgeItems(new Set([item("x", { bridge: true })])).map((i) => i.id)).toEqual(["x"]);
    expect(findStaleBridgeItems([])).toEqual([]);
  });

  it("falls back to the raw flags when the item has no getFlag", () => {
    const raw = { id: "raw", flags: { rmss: { embeddedSpellEdit: { spellIndex: 1 } } }, sheet: { rendered: false } };
    expect(findStaleBridgeItems([raw]).map((i) => i.id)).toEqual(["raw"]);
  });
});
