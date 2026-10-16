/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  slugify, armorGroupFromName, computeAutoArmorGroup, getSkillArmorGroup, isArmorCategory
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

describe("computeAutoArmorGroup", () => {
  it("fills in the group for an Armor-category skill with a known name and no group yet", () => {
    expect(computeAutoArmorGroup({ name: "Cuero endurecido", categorySlug: "armor-light", currentGroup: "" })).toBe("rigid_leather");
    expect(computeAutoArmorGroup({ name: "Plate", categorySlug: "armor-heavy", currentGroup: undefined })).toBe("plate");
  });

  it("does nothing outside the Armor categories", () => {
    expect(computeAutoArmorGroup({ name: "Plate", categorySlug: "athletic-brawn", currentGroup: "" })).toBe("");
    expect(computeAutoArmorGroup({ name: "Plate", categorySlug: undefined, currentGroup: "" })).toBe("");
  });

  it("never overwrites a group that is already set", () => {
    expect(computeAutoArmorGroup({ name: "Plate", categorySlug: "armor-heavy", currentGroup: "chain" })).toBe("");
  });

  it("a name it does not know leaves the field empty", () => {
    expect(computeAutoArmorGroup({ name: "Armadura élfica", categorySlug: "armor-light", currentGroup: "" })).toBe("");
  });
});

describe("getSkillArmorGroup / isArmorCategory", () => {
  it("returns the stored group only when it is a valid one", () => {
    expect(getSkillArmorGroup({ system: { armor_group: "chain" } })).toBe("chain");
    expect(getSkillArmorGroup({ system: { armor_group: "banana" } })).toBe("");
    expect(getSkillArmorGroup({ system: {} })).toBe("");
    expect(getSkillArmorGroup(null)).toBe("");
  });

  it("the three Armor categories", () => {
    expect(["armor-light", "armor-medium", "armor-heavy"].every(isArmorCategory)).toBe(true);
    expect(isArmorCategory("weapon-missile")).toBe(false);
  });
});
