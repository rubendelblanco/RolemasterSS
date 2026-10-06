/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { RMSSWeaponSkillManager } from "../module/combat/rmss_weapon_skill_manager.js";

/**
 * Smoke test of the confirm-attack dialog: it only checks that building it does not throw and that the
 * template receives the parry / shield values. It exists because a const used before its declaration in
 * attackMessagePopup (parryAuto) broke EVERY attack, and nothing in the unit tests ran that function.
 */

const actor = (extra = {}) => ({
  id: undefined,
  name: "Attacker",
  img: "a.png",
  effects: [],
  items: { get: () => undefined, find: () => undefined },
  getFlag: () => null,
  system: {
    attributes: { hits: { current: 50, max: 50 }, movement_rate: { current: 50, value: 50 } },
    ...extra.system
  },
  ...extra
});

const enemy = (system = {}) => ({
  id: undefined,
  name: "Orc",
  img: "o.png",
  effects: [],
  items: [],
  getFlag: () => null,
  system: {
    attributes: { hits: { current: 40, max: 40 } },
    armor_info: { armor_type: 3, total_db: 40, shield_bonus: 15 },
    ...system
  }
});

const weapon = (system = {}) => ({ id: "w1", type: "weapon", name: "Sword", system: { type: "1he", offensive_skill: "", ...system } });

let rendered;

beforeEach(() => {
  rendered = null;
  global.renderTemplate = jest.fn(async (path, data) => { rendered = { path, data }; return "<form></form>"; });
  // The dialog resolves as soon as it is "rendered": press Cancel
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

describe("attackMessagePopup (smoke)", () => {
  it("builds the dialog without throwing, even with no combat started", async () => {
    const result = await RMSSWeaponSkillManager.attackMessagePopup(actor(), enemy(), weapon());
    expect(result).toEqual({ confirmed: false });
    expect(rendered.path).toBe("systems/rmss/templates/combat/confirm-attack.hbs");
  });

  it("frontal attack against a shield: the shield counts in the DB", async () => {
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), enemy(), weapon(), { facingValue: "" });
    expect(rendered.data.defenderDbValue).toBe(40);
    expect(rendered.data.shieldBonus).toBe(15);
  });

  it("flank attack against a shield: the shield is taken out of the DB", async () => {
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), enemy(), weapon(), { facingValue: "15" });
    expect(rendered.data.defenderDbValue).toBe(25);
  });

  it("with parry switched off the dialog still builds, with no parry pre-filled and the shield always counting", async () => {
    global.game.settings.get = () => "off";
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), enemy(), weapon(), { facingValue: "15" });
    expect(rendered.data.attackerParryValue).toBe(0);
    expect(rendered.data.defenderParryValue).toBe(0);
    expect(rendered.data.shieldBonus).toBe(0);
    expect(rendered.data.defenderDbValue).toBe(40);
  });

  it("with parry in manual mode nothing is pre-filled either", async () => {
    global.game.settings.get = () => "manual";
    await RMSSWeaponSkillManager.attackMessagePopup(actor(), enemy(), weapon(), { facingValue: "" });
    expect(rendered.data.attackerParryValue).toBe(0);
    expect(rendered.data.defenderParryValue).toBe(0);
  });
});
