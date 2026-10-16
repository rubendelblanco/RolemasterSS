/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  ARMOR_SKILL_GROUP, getArmorTableRow, getArmorSkillGroup, computeMovingManeuverPenalty,
  parseManeuverModOverride, resolveManeuverMods, resolveArmorPenalties, parsePenaltyAmountOverride
} from "../module/core/armor/armor_maneuver_penalty.js";

describe("getArmorTableRow (Armor Table T-3.3)", () => {
  it("reads the rows the rules print", () => {
    expect(getArmorTableRow(9)).toEqual({ at: 9, minMod: -5, maxMod: -50, missilePenalty: 0, quicknessPenalty: 0 });
    expect(getArmorTableRow(18)).toEqual({ at: 18, minMod: -20, maxMod: -110, missilePenalty: 10, quicknessPenalty: 20 });
    expect(getArmorTableRow(20)).toEqual({ at: 20, minMod: -45, maxMod: -165, missilePenalty: 40, quicknessPenalty: 40 });
  });

  it("no armor (AT 1-4) costs nothing", () => {
    for (const at of [1, 2, 3, 4]) {
      expect(getArmorTableRow(at)).toMatchObject({ minMod: 0, maxMod: 0, missilePenalty: 0, quicknessPenalty: 0 });
    }
  });

  it("accepts a numeric string and rejects what isn't in the table", () => {
    expect(getArmorTableRow("10").at).toBe(10);
    expect(getArmorTableRow(0)).toBeNull();
    expect(getArmorTableRow(21)).toBeNull();
    expect(getArmorTableRow(undefined)).toBeNull();
    expect(getArmorTableRow("abc")).toBeNull();
  });

  it("every armor type from 1 to 20 is in the table, and the minimum is never worse than the maximum", () => {
    for (let at = 1; at <= 20; at++) {
      const row = getArmorTableRow(at);
      expect(row).not.toBeNull();
      expect(row.minMod).toBeGreaterThanOrEqual(row.maxMod);
    }
  });
});

describe("getArmorSkillGroup", () => {
  it("AT 1-4 no skill, 5-8 soft leather, 9-12 rigid, 13-16 chain, 17-20 plate", () => {
    expect([1, 4].map(getArmorSkillGroup)).toEqual([ARMOR_SKILL_GROUP.NONE, ARMOR_SKILL_GROUP.NONE]);
    expect([5, 8].map(getArmorSkillGroup)).toEqual([ARMOR_SKILL_GROUP.SOFT_LEATHER, ARMOR_SKILL_GROUP.SOFT_LEATHER]);
    expect([9, 12].map(getArmorSkillGroup)).toEqual([ARMOR_SKILL_GROUP.RIGID_LEATHER, ARMOR_SKILL_GROUP.RIGID_LEATHER]);
    expect([13, 16].map(getArmorSkillGroup)).toEqual([ARMOR_SKILL_GROUP.CHAIN, ARMOR_SKILL_GROUP.CHAIN]);
    expect([17, 20].map(getArmorSkillGroup)).toEqual([ARMOR_SKILL_GROUP.PLATE, ARMOR_SKILL_GROUP.PLATE]);
  });

  it("anything outside 1-20 counts as no armor skill", () => {
    expect(getArmorSkillGroup(0)).toBe(ARMOR_SKILL_GROUP.NONE);
    expect(getArmorSkillGroup(25)).toBe(ARMOR_SKILL_GROUP.NONE);
    expect(getArmorSkillGroup(undefined)).toBe(ARMOR_SKILL_GROUP.NONE);
  });
});

describe("computeMovingManeuverPenalty", () => {
  it("rules example: Varak, rigid leather breastplate (AT 9), skill +27 -> -23", () => {
    expect(computeMovingManeuverPenalty(9, 27)).toBe(-23);
  });

  it("rules example: Dral, breastplate and greaves (AT 18), +80 -> -30", () => {
    expect(computeMovingManeuverPenalty(18, 80)).toBe(-30);
  });

  it("rules example: Dral, breastplate only (AT 17), +80 -> -15, the armor's minimum", () => {
    expect(computeMovingManeuverPenalty(17, 80)).toBe(-15);
  });

  it("an untrained wearer suffers the armor's maximum", () => {
    expect(computeMovingManeuverPenalty(10, 0)).toBe(-70);
    expect(computeMovingManeuverPenalty(20, 0)).toBe(-165);
  });

  it("a very high skill never gets past the minimum", () => {
    expect(computeMovingManeuverPenalty(10, 500)).toBe(-10);
    expect(computeMovingManeuverPenalty(12, 1000)).toBe(-15);
  });

  it("a negative skill bonus makes it worse than the maximum", () => {
    expect(computeMovingManeuverPenalty(9, -10)).toBe(-60);
  });

  it("no armor, or an unknown armor type, has no penalty", () => {
    expect(computeMovingManeuverPenalty(1, 0)).toBe(0);
    expect(computeMovingManeuverPenalty(4, 50)).toBe(0);
    expect(computeMovingManeuverPenalty(99, 0)).toBe(0);
    expect(Object.is(computeMovingManeuverPenalty(1, 0), 0)).toBe(true);
  });

  it("a missing skill bonus counts as zero", () => {
    expect(computeMovingManeuverPenalty(9)).toBe(-50);
    expect(computeMovingManeuverPenalty(9, "x")).toBe(-50);
  });
});

describe("an armor's own minimum and maximum", () => {
  it("parseManeuverModOverride: empty is unset, any sign means a penalty", () => {
    for (const v of [undefined, null, "", "abc", NaN]) expect(parseManeuverModOverride(v)).toBeUndefined();
    expect(parseManeuverModOverride(-30)).toBe(-30);
    expect(parseManeuverModOverride(30)).toBe(-30);
    expect(parseManeuverModOverride("15")).toBe(-15);
    expect(Object.is(parseManeuverModOverride(0), 0)).toBe(true);
  });

  it("resolveManeuverMods: the armor's values replace the table's one by one", () => {
    expect(resolveManeuverMods(9)).toEqual({ minMod: -5, maxMod: -50 });
    expect(resolveManeuverMods(9, { maxMod: -30 })).toEqual({ minMod: -5, maxMod: -30 });
    expect(resolveManeuverMods(9, { minMod: 0 })).toEqual({ minMod: 0, maxMod: -50 });
    expect(resolveManeuverMods(9, { minMod: -2, maxMod: -20 })).toEqual({ minMod: -2, maxMod: -20 });
  });

  it("the minimum is never worse than the maximum", () => {
    expect(resolveManeuverMods(9, { maxMod: -10 })).toEqual({ minMod: -5, maxMod: -10 });
    expect(resolveManeuverMods(9, { minMod: -60 })).toEqual({ minMod: -50, maxMod: -50 });
  });

  it("an unknown armor type has no mods", () => {
    expect(resolveManeuverMods(99)).toBeNull();
  });

  it("a lighter armor than the table: AT 9 with a maximum of -30 and no skill", () => {
    expect(computeMovingManeuverPenalty(9, 0, { maxMod: -30 })).toBe(-30);
  });

  it("a heavier armor than the table: AT 9 with a minimum of -20 never gets better than -20", () => {
    expect(computeMovingManeuverPenalty(9, 500, { minMod: -20 })).toBe(-20);
  });

  it("an armor that costs nothing at all", () => {
    expect(computeMovingManeuverPenalty(10, 0, { minMod: 0, maxMod: 0 })).toBe(0);
  });

  it("no overrides gives the table's result", () => {
    expect(computeMovingManeuverPenalty(9, 27, {})).toBe(-23);
    expect(computeMovingManeuverPenalty(9, 27, { minMod: null, maxMod: "" })).toBe(-23);
  });
});

describe("resolveArmorPenalties and the missile / Quickness overrides", () => {
  it("the table's values when the armor has none of its own", () => {
    expect(resolveArmorPenalties(18)).toEqual({ minMod: -20, maxMod: -110, missilePenalty: 10, quicknessPenalty: 20 });
    expect(resolveArmorPenalties(9)).toEqual({ minMod: -5, maxMod: -50, missilePenalty: 0, quicknessPenalty: 0 });
  });

  it("the armor's own missile and Quickness penalties replace the table's, each on its own", () => {
    expect(resolveArmorPenalties(18, { missilePenalty: 3 })).toMatchObject({ missilePenalty: 3, quicknessPenalty: 20 });
    expect(resolveArmorPenalties(18, { quicknessPenalty: 5 })).toMatchObject({ missilePenalty: 10, quicknessPenalty: 5 });
    expect(resolveArmorPenalties(18, { missilePenalty: 0, quicknessPenalty: 0 })).toMatchObject({ missilePenalty: 0, quicknessPenalty: 0 });
  });

  it("they are amounts to take off: the sign typed does not matter", () => {
    expect(resolveArmorPenalties(9, { missilePenalty: -7, quicknessPenalty: "-4" })).toMatchObject({ missilePenalty: 7, quicknessPenalty: 4 });
  });

  it("empty or nonsense counts as not set", () => {
    expect(resolveArmorPenalties(18, { missilePenalty: "", quicknessPenalty: null })).toMatchObject({ missilePenalty: 10, quicknessPenalty: 20 });
    expect(parsePenaltyAmountOverride("abc")).toBeUndefined();
  });

  it("carries the maneuver mods too, and is null for an unknown armor type", () => {
    expect(resolveArmorPenalties(9, { maxMod: -30 })).toMatchObject({ minMod: -5, maxMod: -30 });
    expect(resolveArmorPenalties(99)).toBeNull();
  });
});
