/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { rmss } from "../module/config.js";
import {
  MANEUVER_TYPE, getCategoryManeuverType, getSkillManeuverType, hasManeuverTypeOverride
} from "../module/core/skills/skill_maneuver_type.js";

let previousConfig;
beforeEach(() => {
  previousConfig = globalThis.CONFIG;
  globalThis.CONFIG = { rmss };
});
afterEach(() => { globalThis.CONFIG = previousConfig; });

const skill = (categorySlug, maneuver_type) => ({ system: { categorySlug, maneuver_type } });

describe("category defaults", () => {
  it("every skill category the system defines has a maneuver type", () => {
    const missing = Object.keys(rmss.skill_categories).filter((slug) => !(slug in rmss.skill_category_maneuver_type));
    expect(missing).toEqual([]);
  });

  it("only knows real categories and valid types", () => {
    for (const [slug, type] of Object.entries(rmss.skill_category_maneuver_type)) {
      expect(rmss.skill_categories[slug]).toBeDefined();
      expect(Object.values(MANEUVER_TYPE)).toContain(type);
    }
  });

  it("armor and athletic categories are moving maneuvers (RMFRP Appendix A-4)", () => {
    for (const slug of ["armor-light", "armor-medium", "armor-heavy", "athletic-brawn", "athletic-endurance", "athletic-gymnastics"]) {
      expect(getCategoryManeuverType(slug)).toBe("moving");
    }
  });

  it("perception and lore are static, weapons and martial arts are not maneuvers", () => {
    expect(getCategoryManeuverType("awareness-perceptions")).toBe("static");
    expect(getCategoryManeuverType("lore-general")).toBe("static");
    expect(getCategoryManeuverType("weapon-missile")).toBe("none");
    expect(getCategoryManeuverType("martial-arts-striking")).toBe("none");
  });

  it("a category the system doesn't know counts as static, so no armor penalty is applied by mistake", () => {
    expect(getCategoryManeuverType("some-homebrew-category")).toBe("static");
    expect(getCategoryManeuverType(undefined)).toBe("static");
  });
});

describe("getSkillManeuverType", () => {
  it("follows the category when the skill has no setting of its own", () => {
    expect(getSkillManeuverType(skill("athletic-gymnastics", ""))).toBe("moving");
    expect(getSkillManeuverType(skill("awareness-senses", undefined))).toBe("static");
  });

  it("the skill's own setting wins over the category's", () => {
    expect(getSkillManeuverType(skill("athletic-brawn", "static"))).toBe("static");
    expect(getSkillManeuverType(skill("subterfuge-stealth", "moving"))).toBe("moving");
  });

  it("an invalid setting is ignored and the category is used", () => {
    expect(getSkillManeuverType(skill("armor-heavy", "banana"))).toBe("moving");
  });

  it("copes with a missing skill", () => {
    expect(getSkillManeuverType(null)).toBe("static");
    expect(getSkillManeuverType({})).toBe("static");
  });
});

describe("hasManeuverTypeOverride", () => {
  it("true only when the skill has a valid setting of its own", () => {
    expect(hasManeuverTypeOverride(skill("armor-heavy", "static"))).toBe(true);
    expect(hasManeuverTypeOverride(skill("armor-heavy", ""))).toBe(false);
    expect(hasManeuverTypeOverride(skill("armor-heavy", "banana"))).toBe(false);
  });
});
