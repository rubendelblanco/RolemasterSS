/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  RULES_SKILL, matchRulesSkill, getRulesSkillEntry, getActorRulesSkill, getActorRulesSkillBonus
} from "../module/core/skills/rules_skills.js";

const skill = (name, bonus, source) => ({
  type: "skill", name, system: { total_bonus: bonus }, ...(source ? { _stats: { compendiumSource: source } } : {})
});
const ENTRY = { uuid: "Item.abc123", name: "Trascender armadura" };

describe("matchRulesSkill", () => {
  it("finds the copy that came from the chosen catalog skill, whatever it is called now", () => {
    const items = [skill("Otra cosa", 5), skill("Algo con otro nombre", 30, "Item.abc123")];
    expect(matchRulesSkill(items, ENTRY)?.name).toBe("Algo con otro nombre");
  });

  it("falls back to the same name, compared as a slug: case and accents don't matter", () => {
    expect(matchRulesSkill([skill("TRASCENDER ARMADURA", 12)], ENTRY)?.system.total_bonus).toBe(12);
    expect(matchRulesSkill([skill("trascender  armadura", 12)], ENTRY)).not.toBeNull();
  });

  it("the origin wins over a skill that merely has the same name", () => {
    const items = [skill("Trascender armadura", 99), skill("Distinta", 10, "Item.abc123")];
    expect(matchRulesSkill(items, ENTRY)?.name).toBe("Distinta");
  });

  it("with several copies, the best bonus wins", () => {
    const items = [skill("Trascender armadura", 10), skill("Trascender Armadura", 40)];
    expect(matchRulesSkill(items, ENTRY)?.system.total_bonus).toBe(40);
  });

  it("also knows the catalog skill's current name, in case it was renamed after choosing it", () => {
    expect(matchRulesSkill([skill("Trascendencia de armadura", 8)], ENTRY, ["Trascendencia de armadura"])?.system.total_bonus).toBe(8);
  });

  it("nothing matches: null. Items that are not skills are ignored", () => {
    expect(matchRulesSkill([skill("Otra", 5)], ENTRY)).toBeNull();
    expect(matchRulesSkill([{ type: "item", name: "Trascender armadura", system: { total_bonus: 9 } }], ENTRY)).toBeNull();
  });

  it("no chosen skill, no match", () => {
    expect(matchRulesSkill([skill("Trascender armadura", 10)], null)).toBeNull();
    expect(matchRulesSkill([skill("Trascender armadura", 10)], {})).toBeNull();
  });

  it("an entry with only a uuid still works through the origin", () => {
    expect(matchRulesSkill([skill("Lo que sea", 7, "Item.abc123")], { uuid: "Item.abc123" })?.system.total_bonus).toBe(7);
  });
});

describe("settings glue", () => {
  let previousGame;
  beforeEach(() => { previousGame = globalThis.game; });
  afterEach(() => { globalThis.game = previousGame; });

  const withSetting = (value) => {
    globalThis.game = { settings: { get: (ns, key) => (ns === "rmss" && key === "rulesSkills" ? value : undefined) } };
  };

  it("reads the chosen skill for a function", () => {
    withSetting({ transcend_armor: ENTRY });
    expect(getRulesSkillEntry(RULES_SKILL.TRANSCEND_ARMOR)).toEqual(ENTRY);
  });

  it("nothing chosen, or no game at all: null, never an error", () => {
    withSetting({});
    expect(getRulesSkillEntry(RULES_SKILL.TRANSCEND_ARMOR)).toBeNull();
    globalThis.game = undefined;
    expect(getRulesSkillEntry(RULES_SKILL.TRANSCEND_ARMOR)).toBeNull();
  });

  it("the actor's skill and its bonus", () => {
    withSetting({ transcend_armor: ENTRY });
    const actor = { items: [skill("Trascender armadura", 35)] };
    expect(getActorRulesSkill(actor, RULES_SKILL.TRANSCEND_ARMOR)?.name).toBe("Trascender armadura");
    expect(getActorRulesSkillBonus(actor, RULES_SKILL.TRANSCEND_ARMOR)).toBe(35);
  });

  it("an actor without the skill has a bonus of 0", () => {
    withSetting({ transcend_armor: ENTRY });
    expect(getActorRulesSkillBonus({ items: [] }, RULES_SKILL.TRANSCEND_ARMOR)).toBe(0);
  });

  it("with none chosen the bonus is 0 even if the actor has a skill of that name", () => {
    withSetting({});
    expect(getActorRulesSkillBonus({ items: [skill("Trascender armadura", 35)] }, RULES_SKILL.TRANSCEND_ARMOR)).toBe(0);
  });
});
