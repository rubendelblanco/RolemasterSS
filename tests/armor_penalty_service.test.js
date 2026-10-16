/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { rmss } from "../module/config.js";
import { findArmorSkill, getMovingManeuverPenalty, getArmorPenaltyForSkill, getPenaltyArmorType, getArmorPenalties, getMissilePenaltyForWeapon } from "../module/core/armor/armor_penalty_service.js";

const skill = (name, categorySlug, total_bonus) => ({ type: "skill", name, system: { categorySlug, total_bonus } });
const actor = (armor_type, ...items) => ({ system: { armor_info: { armor_type } }, items });

describe("findArmorSkill", () => {
  it("finds a skill by its English or Spanish name, ignoring accents and case", () => {
    expect(findArmorSkill(actor(9, skill("Rigid Leather", "armor-light", 10)), "rigid_leather")?.name).toBe("Rigid Leather");
    expect(findArmorSkill(actor(9, skill("Cuero Rígido", "armor-light", 10)), "rigid_leather")?.name).toBe("Cuero Rígido");
    expect(findArmorSkill(actor(7, skill("cuero blando", "armor-light", 10)), "soft_leather")?.name).toBe("cuero blando");
  });

  it("soft and rigid leather are told apart by name, never mixed up", () => {
    const a = actor(9, skill("Soft Leather", "armor-light", 30), skill("Rigid Leather", "armor-light", 5));
    expect(findArmorSkill(a, "rigid_leather")?.system.total_bonus).toBe(5);
    expect(findArmorSkill(a, "soft_leather")?.system.total_bonus).toBe(30);
  });

  it("leather with no skill of that name is null even if Armor - Light has another one", () => {
    expect(findArmorSkill(actor(9, skill("Soft Leather", "armor-light", 30)), "rigid_leather")).toBeNull();
  });

  it("chain and plate fall back to the only skill of their category when the name differs", () => {
    expect(findArmorSkill(actor(14, skill("Cota de anillas", "armor-medium", 20)), "chain")?.name).toBe("Cota de anillas");
    expect(findArmorSkill(actor(18, skill("Armadura completa", "armor-heavy", 20)), "plate")?.name).toBe("Armadura completa");
  });

  it("no fallback when the category has more than one skill, or none", () => {
    const many = actor(14, skill("Otra", "armor-medium", 5), skill("Otra más", "armor-medium", 9));
    expect(findArmorSkill(many, "chain")).toBeNull();
    expect(findArmorSkill(actor(14), "chain")).toBeNull();
  });

  it("ignores items that are not skills", () => {
    const a = actor(18, { type: "item", name: "Plate", system: { total_bonus: 99 } });
    expect(findArmorSkill(a, "plate")).toBeNull();
  });
});

describe("getMovingManeuverPenalty", () => {
  it("rules example: AT 18 with a +80 plate skill -> -30", () => {
    const r = getMovingManeuverPenalty(actor(18, skill("Plate", "armor-heavy", 80)));
    expect(r).toMatchObject({ armorType: 18, group: "plate", skillBonus: 80, mmp: -30 });
  });

  it("a wearer with no skill in the armor is untrained: the armor's maximum", () => {
    const r = getMovingManeuverPenalty(actor(10));
    expect(r).toMatchObject({ armorType: 10, group: "rigid_leather", skill: null, skillBonus: 0, mmp: -70 });
  });

  it("no armor or light clothing: no penalty, and no skill needed", () => {
    expect(getMovingManeuverPenalty(actor(1)).mmp).toBe(0);
    expect(getMovingManeuverPenalty(actor(4)).mmp).toBe(0);
  });

  it("a missing armor type counts as no armor", () => {
    expect(getMovingManeuverPenalty({ system: {}, items: [] }).mmp).toBe(0);
    expect(getMovingManeuverPenalty(null).mmp).toBe(0);
  });
});

describe("getArmorPenaltyForSkill", () => {
  let previousConfig;
  beforeEach(() => { previousConfig = globalThis.CONFIG; globalThis.CONFIG = { rmss }; });
  afterEach(() => { globalThis.CONFIG = previousConfig; });

  const character = (armorType, ...items) => ({ type: "character", system: { armor_info: { armor_type: armorType } }, items });
  const climbing = (extra = {}) => ({ type: "skill", name: "Climbing", system: { categorySlug: "athletic-gymnastics", total_bonus: 40, ...extra } });

  it("a character in armor loses the MMP on a moving maneuver", () => {
    expect(getArmorPenaltyForSkill(character(10), climbing())).toBe(-70);
  });

  it("the armor skill reduces it", () => {
    const a = character(10, skill("Rigid Leather", "armor-light", 30));
    expect(getArmorPenaltyForSkill(a, climbing())).toBe(-40);
  });

  it("a static maneuver is not touched by armor", () => {
    const perception = { type: "skill", name: "Perception", system: { categorySlug: "awareness-perceptions", total_bonus: 40 } };
    expect(getArmorPenaltyForSkill(character(18), perception)).toBe(0);
  });

  it("a skill that overrides its category to static is not penalized, and one that overrides to moving is", () => {
    expect(getArmorPenaltyForSkill(character(10), climbing({ maneuver_type: "static" }))).toBe(0);
    const stalk = { type: "skill", name: "Stalk", system: { categorySlug: "subterfuge-stealth", maneuver_type: "moving", total_bonus: 20 } };
    expect(getArmorPenaltyForSkill(character(10), stalk)).toBe(-70);
  });

  it("no armor, no penalty", () => {
    expect(getArmorPenaltyForSkill(character(1), climbing())).toBe(0);
  });

  it("NPCs and creatures are ignored", () => {
    for (const type of ["npc", "creature"]) {
      const actor = { type, system: { armor_info: { armor_type: 18 } }, items: [] };
      expect(getArmorPenaltyForSkill(actor, climbing())).toBe(0);
    }
  });
});

describe("the skill is found by its armor group, not by its name", () => {
  const marked = (name, group, bonus, categorySlug = "armor-light") => ({ type: "skill", name, system: { categorySlug, armor_group: group, total_bonus: bonus } });

  it("a skill marked with the group is found whatever it is called", () => {
    expect(findArmorSkill(actor(9, marked("Cuero de campaña", "rigid_leather", 25)), "rigid_leather")?.name).toBe("Cuero de campaña");
  });

  it("the marked skill wins over an unmarked one that happens to have a known name", () => {
    const a = actor(9, skill("Rigid Leather", "armor-light", 5), marked("Mi cuero", "rigid_leather", 40));
    expect(findArmorSkill(a, "rigid_leather")?.system.total_bonus).toBe(40);
  });

  it("Cuero endurecido is found even when it has not been marked", () => {
    expect(findArmorSkill(actor(9, skill("Cuero endurecido", "armor-light", 12)), "rigid_leather")?.name).toBe("Cuero endurecido");
  });

  it("a known name outside the Armor categories is not taken for an armor skill", () => {
    expect(findArmorSkill(actor(18, skill("Plate", "athletic-brawn", 99)), "plate")).toBeNull();
  });

  it("an armor skill marked for another group is not mistaken for the only one of its category", () => {
    expect(findArmorSkill(actor(18, marked("Algo", "chain", 10, "armor-heavy")), "plate")).toBeNull();
  });
});

describe("getPenaltyArmorType", () => {
  const body = (system) => ({ type: "armor", system: { equipped: true, armorSlot: "body", ...system } });

  it("an armor with no penalty AT penalizes as the AT it protects as", () => {
    expect(getPenaltyArmorType(actor(1, body({ at: 9 })))).toBe(9);
    expect(getPenaltyArmorType(actor(1, body({ at: 9, at_penalty: null })))).toBe(9);
    expect(getPenaltyArmorType(actor(1, body({ at: 9, at_penalty: "" })))).toBe(9);
  });

  it("protects as AT 9 but penalizes as AT 12", () => {
    expect(getPenaltyArmorType(actor(1, body({ at: 9, at_penalty: 12 })))).toBe(12);
  });

  it("only the equipped body armor counts: not a shield, not an unequipped suit", () => {
    const shield = { type: "armor", system: { equipped: true, isShield: true, armorSlot: "shield", at: 20 } };
    const spare = { type: "armor", system: { equipped: false, armorSlot: "body", at: 20 } };
    expect(getPenaltyArmorType(actor(7, shield, spare))).toBe(7);
  });

  it("without body armor it uses the AT typed on the sheet, or 1", () => {
    expect(getPenaltyArmorType(actor(13))).toBe(13);
    expect(getPenaltyArmorType({ system: {}, items: [] })).toBe(1);
  });

  it("the armor's own minimum / maximum replace the table's in the MMP", () => {
    const lighter = actor(1, body({ at: 9, maneuver_max: -30 }), skill("Cuero endurecido", "armor-light", 10));
    expect(getMovingManeuverPenalty(lighter).mmp).toBe(-20);
    const heavier = actor(1, body({ at: 9, maneuver_min: -25 }), skill("Cuero endurecido", "armor-light", 200));
    expect(getMovingManeuverPenalty(heavier).mmp).toBe(-25);
  });

  it("empty or null overrides leave the table in charge", () => {
    const a = actor(1, body({ at: 9, maneuver_min: null, maneuver_max: "" }), skill("Cuero endurecido", "armor-light", 27));
    expect(getMovingManeuverPenalty(a).mmp).toBe(-23);
  });

  it("a light armor (AT 1-4) can still carry a penalty of its own, with no skill involved", () => {
    expect(getMovingManeuverPenalty(actor(1, body({ at: 3, maneuver_max: -15, maneuver_min: -15 }))).mmp).toBe(-15);
    expect(getMovingManeuverPenalty(actor(1, body({ at: 3 }))).mmp).toBe(0);
  });

  it("the MMP follows the penalty AT, with the skill of the penalty AT's group", () => {
    const a = actor(1, body({ at: 9, at_penalty: 12 }), skill("Cuero endurecido", "armor-light", 30));
    expect(getMovingManeuverPenalty(a)).toMatchObject({ armorType: 12, group: "rigid_leather", skillBonus: 30, mmp: -80 });
  });
});

describe("getArmorPenalties and the missile penalty on a weapon", () => {
  const body = (system) => ({ type: "armor", system: { equipped: true, armorSlot: "body", ...system } });
  const character = (armorInfo, ...items) => ({ type: "character", system: { armor_info: armorInfo }, items });
  const bow = { system: { type: "mis" } };
  const sword = { system: { type: "1he" } };

  it("takes every penalty from the equipped body armor's penalty AT, with its own values on top", () => {
    const a = character({}, body({ at: 9, at_penalty: 18, missile_penalty: 4 }));
    expect(getArmorPenalties(a)).toMatchObject({ armorType: 18, hasBodyArmor: true, missilePenalty: 4, quicknessPenalty: 20, minMod: -20, maxMod: -110 });
  });

  it("with no body armor it reads the AT typed on the sheet and says so", () => {
    expect(getArmorPenalties(character({ armor_type: 18 }))).toMatchObject({ armorType: 18, hasBodyArmor: false, missilePenalty: 10 });
  });

  it("a missile weapon loses the armor's missile penalty", () => {
    expect(getMissilePenaltyForWeapon(character({}, body({ at: 18 })), bow)).toBe(10);
  });

  it("the armor's own missile penalty wins over the table's", () => {
    expect(getMissilePenaltyForWeapon(character({}, body({ at: 18, missile_penalty: 2 })), bow)).toBe(2);
    expect(getMissilePenaltyForWeapon(character({}, body({ at: 18, missile_penalty: 0 })), bow)).toBe(0);
  });

  it("a thrown weapon loses it too", () => {
    const javelin = { system: { type: "th" } };
    expect(getMissilePenaltyForWeapon(character({}, body({ at: 18 })), javelin)).toBe(10);
  });

  it("a melee weapon is not affected", () => {
    expect(getMissilePenaltyForWeapon(character({}, body({ at: 18 })), sword)).toBe(0);
  });

  it("without a body armor equipped, the missile penalty typed on the sheet is used", () => {
    expect(getMissilePenaltyForWeapon(character({ armor_type: 1, missile_penalty: 6 }), bow)).toBe(6);
    expect(getMissilePenaltyForWeapon(character({ armor_type: 1, missile_penalty: -6 }), bow)).toBe(6);
    expect(getMissilePenaltyForWeapon(character({ armor_type: 1 }), bow)).toBe(0);
  });

  it("NPCs and creatures are ignored", () => {
    for (const type of ["npc", "creature"]) {
      const a = { type, system: { armor_info: {} }, items: [body({ at: 18 })] };
      expect(getMissilePenaltyForWeapon(a, bow)).toBe(0);
    }
  });
});
