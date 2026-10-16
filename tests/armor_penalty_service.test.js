/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { rmss } from "../module/config.js";
import { findArmorSkill, getMovingManeuverPenalty, getArmorPenaltyForSkill, getPenaltyArmorType, getArmorPenalties, getMissilePenaltyForWeapon, getCastingPenalty } from "../module/core/armor/armor_penalty_service.js";

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

describe("the leather skills are the ones chosen in the settings", () => {
  let previousGame;
  beforeEach(() => { previousGame = globalThis.game; });
  afterEach(() => { globalThis.game = previousGame; });

  const choose = (setting) => {
    globalThis.game = { settings: { get: (ns, key) => (ns === "rmss" && key === "rulesSkills" ? setting : undefined) } };
  };

  it("the skill chosen for AT 9-12 is found whatever it is called", () => {
    choose({ rigid_leather_armor: { name: "Cuero de campaña" } });
    expect(findArmorSkill(actor(9, skill("Cuero de campaña", "armor-light", 25), skill("Otro cuero", "armor-light", 5)), "rigid_leather")?.system.total_bonus).toBe(25);
  });

  it("the two leathers of Armor - Light are told apart by the setting, never mixed up", () => {
    choose({ soft_leather_armor: { name: "Piel" }, rigid_leather_armor: { name: "Coraza de cuero" } });
    const a = actor(9, skill("Piel", "armor-light", 30), skill("Coraza de cuero", "armor-light", 5));
    expect(findArmorSkill(a, "soft_leather")?.system.total_bonus).toBe(30);
    expect(findArmorSkill(a, "rigid_leather")?.system.total_bonus).toBe(5);
  });

  it("the choice wins over an unchosen skill that happens to have a known name", () => {
    choose({ rigid_leather_armor: { name: "Mi cuero" } });
    const a = actor(9, skill("Rigid Leather", "armor-light", 5), skill("Mi cuero", "armor-light", 40));
    expect(findArmorSkill(a, "rigid_leather")?.system.total_bonus).toBe(40);
  });

  it("with nothing chosen, a known name is still found", () => {
    choose({});
    expect(findArmorSkill(actor(9, skill("Cuero endurecido", "armor-light", 12)), "rigid_leather")?.name).toBe("Cuero endurecido");
  });

  it("chain and plate need no setting, whatever their names", () => {
    choose({});
    expect(findArmorSkill(actor(14, skill("Cota de anillas", "armor-medium", 20)), "chain")?.name).toBe("Cota de anillas");
    expect(findArmorSkill(actor(18, skill("Armadura completa", "armor-heavy", 20)), "plate")?.name).toBe("Armadura completa");
  });

  it("a known name outside the Armor categories is not taken for an armor skill", () => {
    choose({});
    expect(findArmorSkill(actor(18, skill("Plate", "athletic-brawn", 99)), "plate")).toBeNull();
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

describe("getCastingPenalty: what the armor and helmet worn take off a spell", () => {
  const piece = (slot, system) => ({ type: "armor", system: { equipped: true, armorSlot: slot, ...system } });
  const character = (armorInfo, ...items) => ({ type: "character", system: { armor_info: armorInfo }, items });

  it("body armor counts by its penalty AT, not the AT it protects as", () => {
    const a = character({}, piece("body", { at: 9, at_penalty: 15 }));
    expect(getCastingPenalty(a, "essence")).toEqual({ armor: -70, helmet: 0, relief: 0, total: -70 });
  });

  it("a helmet adds to the armor's penalty, by its kind", () => {
    const a = character({}, piece("body", { at: 10 }), piece("helmet", { helmet_type: "metal" }));
    expect(getCastingPenalty(a, "essence")).toEqual({ armor: -25, helmet: -40, relief: 0, total: -65 });
  });

  it("body armor never hampers mentalism, but the helmet does", () => {
    const a = character({}, piece("body", { at: 20 }), piece("helmet", { helmet_type: "leather" }));
    expect(getCastingPenalty(a, "mentalism")).toEqual({ armor: 0, helmet: -30, relief: 0, total: -30 });
  });

  it("a shield counts for nothing", () => {
    const a = character({}, piece("shield", { at: 20, isShield: true, db: 25 }));
    expect(getCastingPenalty(a, "essence").total).toBe(0);
  });

  it("an unequipped armor or helmet counts for nothing", () => {
    const a = character({}, { type: "armor", system: { equipped: false, armorSlot: "body", at: 20 } },
      { type: "armor", system: { equipped: false, armorSlot: "helmet", helmet_type: "metal" } });
    expect(getCastingPenalty(a, "essence").total).toBe(0);
  });

  it("the items' own values win over the table's", () => {
    const a = character({}, piece("body", { at: 10, cast_penalty_essence: -5 }),
      piece("helmet", { helmet_type: "metal", cast_penalty_essence: 0 }));
    expect(getCastingPenalty(a, "essence")).toEqual({ armor: -5, helmet: 0, relief: 0, total: -5 });
  });

  it("a spell of two realms takes the worst for each piece", () => {
    const a = character({}, piece("body", { at: 15 }), piece("helmet", { helmet_type: "metal" }));
    expect(getCastingPenalty(a, "essence/mentalism")).toEqual({ armor: -70, helmet: -60, relief: 0, total: -130 });
  });

  it("with no body armor equipped it reads the AT typed on the sheet", () => {
    expect(getCastingPenalty(character({ armor_type: 12 }), "essence").armor).toBe(-50);
  });

  it("NPCs and creatures are ignored", () => {
    for (const type of ["npc", "creature"]) {
      const a = { type, system: { armor_info: { armor_type: 20 } }, items: [piece("helmet", { helmet_type: "metal" })] };
      expect(getCastingPenalty(a, "essence")).toEqual({ armor: 0, helmet: 0, relief: 0, total: 0 });
    }
  });
});

describe("getCastingPenalty with Transcend Armor", () => {
  let previousGame;
  beforeEach(() => {
    previousGame = globalThis.game;
    globalThis.game = { settings: { get: () => ({ transcend_armor: { uuid: "Item.t1", name: "Trascender armadura" } }) } };
  });
  afterEach(() => { globalThis.game = previousGame; });

  const piece = (slot, system) => ({ type: "armor", system: { equipped: true, armorSlot: slot, ...system } });
  const transcend = (bonus) => ({ type: "skill", name: "Trascender armadura", system: { total_bonus: bonus } });
  const character = (...items) => ({ type: "character", system: { armor_info: {} }, items });

  it("is applied once against armor and helmet together: -25 and -40 with +30 leaves -35", () => {
    const a = character(piece("body", { at: 10 }), piece("helmet", { helmet_type: "metal" }), transcend(30));
    expect(getCastingPenalty(a, "essence")).toEqual({ armor: -25, helmet: -40, relief: 30, total: -35 });
  });

  it("cancels the penalty at most: it never turns it into a bonus", () => {
    const a = character(piece("body", { at: 10 }), transcend(500));
    expect(getCastingPenalty(a, "essence")).toEqual({ armor: -25, helmet: 0, relief: 25, total: 0 });
  });

  it("without the skill, or without any penalty, nothing is relieved", () => {
    expect(getCastingPenalty(character(piece("body", { at: 10 })), "essence").relief).toBe(0);
    expect(getCastingPenalty(character(piece("body", { at: 20 }), transcend(80)), "mentalism").relief).toBe(0);
  });
});
