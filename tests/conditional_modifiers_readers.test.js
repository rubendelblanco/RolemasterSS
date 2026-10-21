/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { RMSSWeaponSkillManager } from "../module/combat/rmss_weapon_skill_manager.js";
import { getAreaDefenseDb } from "../module/combat/services/area_spell_resolution_service.js";
import EffectsPopupService from "../module/core/rolls/effects_popup_service.js";

/**
 * Where the conditional modifiers of an effect are read: the confirm-attack window (the defender's DB and the attacker's OB,
 * by the tags of the attack), the DB of area balls, and the resistance roll dropdown (by what the roll resists).
 */

const mod = (target, value, versus) => ({ flags: { rmss: { modifiers: [{ target, value, versus }] } } });

const actor = (effects = []) => ({
  id: undefined,
  name: "Attacker",
  img: "a.png",
  effects,
  items: { get: () => undefined, find: () => undefined },
  getFlag: () => null,
  system: { attributes: { hits: { current: 50, max: 50 }, movement_rate: { current: 50, value: 50 } } }
});

const enemy = (effects = []) => ({
  id: undefined,
  name: "Orc",
  img: "o.png",
  effects,
  items: [],
  getFlag: () => null,
  system: {
    attributes: { hits: { current: 40, max: 40 } },
    armor_info: { armor_type: 3, total_db: 40, shield_bonus: 0 }
  }
});

const sword = { id: "w1", type: "weapon", name: "Sword", system: { type: "1he", offensive_skill: "" } };
const bow = { id: "w2", type: "weapon", name: "Bow", system: { type: "mis", offensive_skill: "" } };
const spellWeapon = (attackTable, system = {}) => ({ type: "spell", system: { attack_table: attackTable, ...system } });
const spellOptions = { ob: 30, hitsTaken: 0, bleeding: 0, penaltyValue: 0, bonusValue: 0 };

let rendered;

beforeEach(() => {
  rendered = null;
  global.renderTemplate = jest.fn(async (path, data) => { rendered = { path, data }; return "<form></form>"; });
  global.Dialog = class {
    constructor(config) { this.config = config; }
    render() { this.config.buttons.cancel.callback(); }
  };
  global.game = {
    ...global.game,
    combat: null,
    i18n: { lang: "en", localize: (k) => k, format: (k, d) => `${k}::${JSON.stringify(d ?? {})}` },
    settings: { get: () => "full" }
  };
  global.ui = { notifications: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } };
});

afterEach(() => jest.restoreAllMocks());

describe("the confirm-attack window: the defender's DB", () => {
  it("adds what the defender's effects give against this kind of weapon attack", async () => {
    const defender = enemy([mod("db", 10, ["weapon", "melee"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, sword, { facingValue: "" });
    expect(rendered.data.defenderDbValue).toBe(50);
  });

  it("a defense against missiles does not count against a sword, and does against a bow", async () => {
    const defender = enemy([mod("db", 50, ["missile"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, sword, { facingValue: "" });
    expect(rendered.data.defenderDbValue).toBe(40);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, bow, { facingValue: "" });
    expect(rendered.data.defenderDbValue).toBe(90);
  });

  it("an elemental defense does not count against a weapon", async () => {
    const defender = enemy([mod("db", 5, ["spell", "elemental"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, sword, { facingValue: "" });
    expect(rendered.data.defenderDbValue).toBe(40);
  });

  it("counts against an elemental spell attack, and only against the element it names", async () => {
    const defender = enemy([mod("db", 5, ["spell", "elemental"]), mod("db", 20, ["fire"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("fire_bolt"), spellOptions);
    expect(rendered.data.defenderDbValue).toBe(65);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("ice_bolt"), spellOptions);
    expect(rendered.data.defenderDbValue).toBe(45);
  });

  it("the elemental defense of the first version still counts against an elemental spell", async () => {
    const defender = enemy([{ flags: { rmss: { elementalDefenseBonus: 5 } } }]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("fire_bolt"), spellOptions);
    expect(rendered.data.defenderDbValue).toBe(45);
  });

  it("the tags written on the spell count too: a defense against cold also covers a force-of-cold spell attack", async () => {
    const defender = enemy([mod("db", 30, ["cold"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("water_bolt", { spell_type: "DE", spell_tags: ["cold"] }), spellOptions);
    expect(rendered.data.defenderDbValue).toBe(70);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("water_bolt", { spell_type: "DE" }), spellOptions);
    expect(rendered.data.defenderDbValue).toBe(40);
  });

  it("an area ball starts from 0 here: its DB is worked out with the area rules", async () => {
    const defender = enemy([mod("db", 5, ["spell", "elemental"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), defender, spellWeapon("fire_ball"), { ...spellOptions, areaElementalBall: true });
    expect(rendered.data.defenderDbValue).toBe(0);
  });
});

describe("the confirm-attack window: the attacker's OB", () => {
  it("adds what the attacker's effects give to weapon attacks", async () => {
    const attacker = actor([mod("ob", 15, ["weapon"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(attacker, enemy(), sword, { facingValue: "" });
    expect(rendered.data.bonusValue).toBe(15);
  });

  it("a bonus for melee does not count for a bow", async () => {
    const attacker = actor([mod("ob", 15, ["melee"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(attacker, enemy(), bow, { facingValue: "" });
    expect(rendered.data.bonusValue).toBe(0);
  });

  it("a bonus for weapons does not count for a spell attack", async () => {
    const attacker = actor([mod("ob", 15, ["weapon"])]);
    await RMSSWeaponSkillManager.attackMessagePopup(attacker, enemy(), spellWeapon("fire_bolt"), spellOptions);
    expect(rendered.data.bonusValue).toBe(0);
  });

  it("the plain Bonus effect keeps adding to every attack", async () => {
    const attacker = actor([{ name: "Bonus", flags: { rmss: { value: 10 } } }]);
    await RMSSWeaponSkillManager.attackMessagePopup(attacker, enemy(), sword, { facingValue: "" });
    expect(rendered.data.bonusValue).toBe(10);
  });
});

describe("getAreaDefenseDb", () => {
  const withEffects = (info, effects = []) => ({ system: { armor_info: info }, effects });

  it("without effects it is unchanged: total minus shield", () => {
    expect(getAreaDefenseDb(withEffects({ total_db: 30, shield_bonus: 10 }))).toBe(20);
    expect(getAreaDefenseDb(withEffects({ total_db: 30 }))).toBe(30);
  });

  it("adds what the effects give against an elemental spell, on top of the DB without the shield", () => {
    const effects = [mod("db", 5, ["spell", "elemental"])];
    expect(getAreaDefenseDb(withEffects({ total_db: 30, shield_bonus: 10 }, effects))).toBe(25);
    expect(getAreaDefenseDb(withEffects({ total_db: 30 }, effects))).toBe(35);
  });

  it("takes the element of the attack into account", () => {
    const effects = [mod("db", 20, ["fire"])];
    expect(getAreaDefenseDb(withEffects({ total_db: 30 }, effects), ["spell", "elemental", "fire", "heat"])).toBe(50);
    expect(getAreaDefenseDb(withEffects({ total_db: 30 }, effects), ["spell", "elemental", "ice", "cold"])).toBe(30);
  });

  it("an actor with no armor info has no DB even with effects", () => {
    expect(getAreaDefenseDb({ system: {}, effects: [mod("db", 5, [])] })).toBe(0);
  });
});

describe("the resistance roll dropdown", () => {
  const withRolls = (effects = []) => ({
    effects,
    system: { resistance_rolls: { essence: { total: 30 }, channeling: { total: 20 }, poison: { total: 10 } } }
  });
  const option = (options, key) => options.find((o) => o.key === key);

  it("without effects it is the total on the sheet and the plain label", () => {
    const options = EffectsPopupService._resistanceOptions(withRolls());
    expect(option(options, "essence")).toEqual({ key: "essence", label: "rmss.pc_sheet_resistances.essence", total: 30 });
  });

  it("adds what the effects give against spells to every spell category, and says so in the label", () => {
    const options = EffectsPopupService._resistanceOptions(withRolls([mod("rr", 5, ["spell"])]));
    expect(option(options, "essence").total).toBe(35);
    expect(option(options, "channeling").total).toBe(25);
    expect(option(options, "essence").label).toContain("[+5 rmss.combat.rr_from_effects]");
  });

  it("does not add it to what is not a spell", () => {
    const options = EffectsPopupService._resistanceOptions(withRolls([mod("rr", 5, ["spell"])]));
    expect(option(options, "poison")).toEqual({ key: "poison", label: "rmss.pc_sheet_resistances.poison", total: 10 });
  });

  it("a penalty shows with its sign", () => {
    const options = EffectsPopupService._resistanceOptions(withRolls([mod("rr", -10, ["essence"])]));
    expect(option(options, "essence").total).toBe(20);
    expect(option(options, "essence").label).toContain("[-10 ");
    expect(option(options, "channeling").total).toBe(20);
  });
});
