/**
 * @jest-environment node
 */
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import { parseManualRoll, SPELL_FAILURE_CHOICES, SPELL_FAILURE_CODES } from "../module/combat/services/manual_fumble_service.js";
import SpellFailureService from "../module/spells/services/spell_failure_service.js";
import WeaponFumbleService from "../module/combat/services/weapon_fumble_service.js";

afterEach(() => jest.restoreAllMocks());

describe("parseManualRoll", () => {
  it("blank means roll the dice", () => {
    expect(parseManualRoll("")).toEqual({ roll: null, invalid: false });
    expect(parseManualRoll("   ")).toEqual({ roll: null, invalid: false });
    expect(parseManualRoll(undefined)).toEqual({ roll: null, invalid: false });
    expect(parseManualRoll(null)).toEqual({ roll: null, invalid: false });
  });

  it("accepts whole numbers inside the limits", () => {
    expect(parseManualRoll("57", { min: 1, max: 100 })).toEqual({ roll: 57, invalid: false });
    expect(parseManualRoll(100, { min: 1, max: 100 })).toEqual({ roll: 100, invalid: false });
    expect(parseManualRoll("1", { min: 1, max: 100 })).toEqual({ roll: 1, invalid: false });
  });

  it("rejects out-of-range, non-integer and non-numeric input", () => {
    expect(parseManualRoll("0", { min: 1, max: 100 }).invalid).toBe(true);
    expect(parseManualRoll("101", { min: 1, max: 100 }).invalid).toBe(true);
    expect(parseManualRoll("12.5", { min: 1, max: 100 }).invalid).toBe(true);
    expect(parseManualRoll("abc", { min: 1, max: 100 }).invalid).toBe(true);
    expect(parseManualRoll("abc").roll).toBeNull();
  });

  it("a spell failure roll may be open-ended in both directions", () => {
    expect(parseManualRoll("-20", { min: -999, max: 9999 })).toEqual({ roll: -20, invalid: false });
    expect(parseManualRoll("140", { min: -999, max: 9999 })).toEqual({ roll: 140, invalid: false });
  });
});

describe("choices offered by the fumble tab", () => {
  it("every spell family maps to a real column of the failure table", () => {
    for (const c of SPELL_FAILURE_CHOICES) {
      expect(SpellFailureService.getColumnForSpellType(c.type)).toBe(c.column);
    }
    expect(SPELL_FAILURE_CHOICES.map((c) => c.column).sort()).toEqual(["elemental", "force", "informational", "other"]);
  });

  it("the failure severities are the multipliers the casting flow already uses", () => {
    expect(SPELL_FAILURE_CODES.map((c) => SpellFailureService.getModifierMultiplier(c))).toEqual([1, 2, 3]);
  });

  it("every weapon type of the game picks a column of the fumble table", () => {
    for (const type of ["1he", "2h", "1hc", "mis", "pa1h", "pa2h", "th"]) {
      expect(["1he", "2h", "pa", "th", "mis"]).toContain(WeaponFumbleService.getColumnForWeaponType(type));
    }
  });
});

describe("SpellFailureService.rollFailure with a typed roll", () => {
  const table = {
    ranges: [
      { min: null, max: 50, other: "Minor mishap", force: "F low", elemental: "E low", informational: "I low" },
      { min: 51, max: null, other: "Big mishap", force: "F high", elemental: "E high", informational: "I high" }
    ]
  };

  it("uses the typed roll as the natural roll, with no dice involved", async () => {
    jest.spyOn(SpellFailureService, "loadTable").mockResolvedValue(table);
    const roll = jest.fn();
    global.Roll = roll;
    const result = await SpellFailureService.rollFailure("F", "failure", 0, true, 80);
    expect(roll).not.toHaveBeenCalled();
    expect(result).toMatchObject({ naturalRoll: 80, finalResult: 80, column: "force", description: "F high" });
  });

  it("casting modifiers still push the typed roll up, by the failure multiplier", async () => {
    jest.spyOn(SpellFailureService, "loadTable").mockResolvedValue(table);
    const result = await SpellFailureService.rollFailure("E", "spectacular_failure", -10, true, 30);
    // -(-10) * 3 = +30 -> 60: the second range
    expect(result).toMatchObject({ naturalRoll: 30, multiplier: 3, modifierPenalty: 30, finalResult: 60, description: "Big mishap" });
  });

  it("without a typed roll it still rolls the dice as before", async () => {
    jest.spyOn(SpellFailureService, "loadTable").mockResolvedValue(table);
    global.Roll = class { constructor() { this.total = 40; } async evaluate() { return this; } };
    const result = await SpellFailureService.rollFailure("BE", "failure", 0);
    expect(result).toMatchObject({ naturalRoll: 40, column: "elemental", description: "E low" });
  });
});
