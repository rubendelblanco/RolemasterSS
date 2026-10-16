/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  ARMOR_SKILL_GROUP, getArmorTableRow, getArmorSkillGroup, computeMovingManeuverPenalty
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
