/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { buildSkillManeuverBadge } from "../module/core/skills/skill_maneuver_badge.js";
import { modifierColor, modifierStyle, MODIFIER_COLOR } from "../module/core/skills/modifier_tone.js";

describe("buildSkillManeuverBadge", () => {
  it("a moving maneuver that armor penalizes shows the walking figure and the penalty", () => {
    expect(buildSkillManeuverBadge("moving", -23)).toEqual({
      icon: "fa-solid fa-person-walking", penalty: -23, tooltipKey: "rmss.skill.badge_moving_penalty"
    });
  });

  it("a moving maneuver armor doesn't touch shows nothing", () => {
    expect(buildSkillManeuverBadge("moving", 0)).toBeNull();
    expect(buildSkillManeuverBadge("moving", -0)).toBeNull();
    expect(buildSkillManeuverBadge("moving", undefined)).toBeNull();
    expect(buildSkillManeuverBadge("moving", "x")).toBeNull();
  });

  it("a positive number is never shown as a penalty", () => {
    expect(buildSkillManeuverBadge("moving", 15)).toBeNull();
  });

  it("static maneuvers and what is not a maneuver show nothing, whatever the penalty", () => {
    expect(buildSkillManeuverBadge("static", -50)).toBeNull();
    expect(buildSkillManeuverBadge("none", -50)).toBeNull();
    expect(buildSkillManeuverBadge(undefined, -50)).toBeNull();
  });
});

describe("modifierColor / modifierStyle (colours in the maneuver dialog)", () => {
  it("green when positive, red when negative, grey when zero", () => {
    expect(modifierColor(10)).toBe(MODIFIER_COLOR.POSITIVE);
    expect(modifierColor(-5)).toBe(MODIFIER_COLOR.NEGATIVE);
    expect(modifierColor(0)).toBe(MODIFIER_COLOR.NEUTRAL);
  });

  it("copes with missing or non-numeric values: grey", () => {
    expect(modifierColor(undefined)).toBe(MODIFIER_COLOR.NEUTRAL);
    expect(modifierColor(null)).toBe(MODIFIER_COLOR.NEUTRAL);
    expect(modifierColor("abc")).toBe(MODIFIER_COLOR.NEUTRAL);
  });

  it("numeric strings count by their value", () => {
    expect(modifierColor("-30")).toBe(MODIFIER_COLOR.NEGATIVE);
    expect(modifierColor("20")).toBe(MODIFIER_COLOR.POSITIVE);
  });

  it("a modifier that is not zero is also bold, so it stands out; a zero is not", () => {
    expect(modifierStyle(-23)).toContain("font-weight:600");
    expect(modifierStyle(-23)).toContain(MODIFIER_COLOR.NEGATIVE);
    expect(modifierStyle(8)).toContain(MODIFIER_COLOR.POSITIVE);
    expect(modifierStyle(0)).not.toContain("font-weight");
    expect(modifierStyle(0)).toContain(MODIFIER_COLOR.NEUTRAL);
  });
});
