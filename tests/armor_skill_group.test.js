/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  slugify, armorGroupFromName, isArmorCategory
} from "../module/core/armor/armor_skill_group.js";

describe("slugify", () => {
  it("lowercases, drops accents and punctuation", () => {
    expect(slugify("Cuero Endurecido")).toBe("cuero-endurecido");
    expect(slugify("  Cuero   Rígido! ")).toBe("cuero-rigido");
    expect(slugify("Rigid_Leather")).toBe("rigid-leather");
  });

  it("copes with non-strings", () => {
    expect(slugify(undefined)).toBe("");
    expect(slugify(null)).toBe("");
  });
});

describe("armorGroupFromName", () => {
  it("Rigid Leather is Cuero endurecido, however it is written", () => {
    for (const name of ["Rigid Leather", "rigid leather", "RIGID-LEATHER", "Cuero endurecido", "cuero ENDURECIDO", "Cuero Rígido"]) {
      expect(armorGroupFromName(name)).toBe("rigid_leather");
    }
  });

  it("recognises the other three groups in both languages", () => {
    expect(armorGroupFromName("Soft Leather")).toBe("soft_leather");
    expect(armorGroupFromName("Cuero blando")).toBe("soft_leather");
    expect(armorGroupFromName("Chain")).toBe("chain");
    expect(armorGroupFromName("Cota de malla")).toBe("chain");
    expect(armorGroupFromName("Plate")).toBe("plate");
    expect(armorGroupFromName("Placas")).toBe("plate");
  });

  it("a name that is not a known one gives nothing, not a guess", () => {
    expect(armorGroupFromName("Armadura élfica")).toBe("");
    expect(armorGroupFromName("Cuero")).toBe("");
    expect(armorGroupFromName("")).toBe("");
  });
});

describe("isArmorCategory", () => {
  it("the three Armor categories", () => {
    expect(["armor-light", "armor-medium", "armor-heavy"].every(isArmorCategory)).toBe(true);
    expect(isArmorCategory("weapon-missile")).toBe(false);
  });
});
