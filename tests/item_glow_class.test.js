/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { getItemGlowClass } from "../module/actors/utils/item_identity_util.js";

const item = (system) => ({ type: "item", system: { identified: true, ...system } });

describe("item icon glow", () => {
  it("weapons and items keep their own glow, by priority: consecrated > slaying > magical", () => {
    expect(getItemGlowClass(item({ holy: true, magical: true }))).toBe("rmss-glow--consecrated");
    expect(getItemGlowClass(item({ unholy: true }))).toBe("rmss-glow--consecrated");
    expect(getItemGlowClass(item({ isSlaying: true, magical: true }))).toBe("rmss-glow--slaying");
    expect(getItemGlowClass(item({ magical: true }))).toBe("rmss-glow--magical");
    expect(getItemGlowClass(item({}))).toBe("");
  });

  it("ammunition glows like a weapon with the same property, from system.ammo_effects", () => {
    expect(getItemGlowClass(item({ ammo_effects: { holy: true } }))).toBe("rmss-glow--consecrated");
    expect(getItemGlowClass(item({ ammo_effects: { unholy: true } }))).toBe("rmss-glow--consecrated");
    expect(getItemGlowClass(item({ ammo_effects: { isSlaying: true, magical: true } }))).toBe("rmss-glow--slaying");
    expect(getItemGlowClass(item({ ammo_effects: { magical: true } }))).toBe("rmss-glow--magical");
  });

  it("plain ammunition (the defaults) has no glow", () => {
    expect(getItemGlowClass(item({ ammo_effects: { holy: false, unholy: false, isSlaying: false, magical: false } }))).toBe("");
    expect(getItemGlowClass(item({ ammo_effects: {} }))).toBe("");
  });

  it("an unidentified item never glows, so it does not give its magic away", () => {
    global.game = { ...global.game, user: { isGM: false } };
    expect(getItemGlowClass({ type: "item", system: { identified: false, ammo_effects: { holy: true } } })).toBe("");
    expect(getItemGlowClass({ type: "item", system: { identified: false, magical: true } })).toBe("");
  });
});
