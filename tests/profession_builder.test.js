/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { rmss } from "../module/config.js";
import { buildProfessionSystem, findSkillByNames, formatProfessionReport } from "../module/tools/profession_builder.js";
import { PROFESSION_DEFINITIONS, parseProfessionTxt, PROFESSION_COSTS, getSpellCategoryCosts } from "../module/tools/profession_txt_parser.js";

const skill = (name, slug) => ({ name, system: { slug } });

describe("findSkillByNames", () => {
  const skills = [skill("Trascender armadura", "trascender-armadura"), skill("Religión", "religion")];

  it("finds a skill by any of its names, ignoring accents and case", () => {
    expect(findSkillByNames(["Transcend Armor", "trascender ARMADURA"], skills)?.name).toBe("Trascender armadura");
    expect(findSkillByNames(["Religion"], skills)?.name).toBe("Religión");
  });

  it("null when none of the names is in the catalog", () => {
    expect(findSkillByNames(["Justa", "Torneo"], skills)).toBeNull();
    expect(findSkillByNames([], skills)).toBeNull();
    expect(findSkillByNames(undefined, skills)).toBeNull();
  });
});

describe("the Paladin (Character Law 2.9)", () => {
  const def = PROFESSION_DEFINITIONS.Paladin;
  const { costs } = parseProfessionTxt(PROFESSION_COSTS.Paladin);

  it("is a semi spell user of Channeling, with Self Discipline and Intuition as prime stats", () => {
    expect(def.spellUserType).toBe("semi");
    expect(def.spellRealm).toBe("channeling");
    expect(def.primeStats.slice(0, 2)).toEqual(["self_discipline", "intuition"]);
  });

  it("Special Defenses cost 40, as the book says", () => {
    expect(costs["special-defenses"]).toBe("40");
  });

  it("a few costs straight from the book's table", () => {
    expect(costs["armor-light"]).toBe("1/1/1");
    expect(costs["weapon-1-h-edged"]).toBe("2/5");
    expect(costs["power-manipulation"]).toBe("6/12");
    expect(costs["body-development"]).toBe("4/10");
    expect(costs["subterfuge-attack"]).toBe("15");
  });

  it("its spell costs are the semi spell user's: base lists 6, open 8/8, closed 10/10", () => {
    const spell = getSpellCategoryCosts("semi", rmss);
    expect(spell["spells-own-realm-own-base-lists"]).toBe("6/6/6");
    expect(spell["spells-own-realm-open-lists"]).toBe("8/8");
    expect(spell["spells-own-realm-closed-lists"]).toBe("10/10");
  });

  it("base lists of the own realm allow three ranks per level, as \"6/6/6\" and not a single \"6\" (a pure caster: 3/3/3)", () => {
    expect(getSpellCategoryCosts("semi", rmss)["spells-own-realm-own-base-lists"]).toBe("6/6/6");
    expect(getSpellCategoryCosts("pure", rmss)["spells-own-realm-own-base-lists"]).toBe("3/3/3");
    expect(getSpellCategoryCosts("hybrid", rmss)["spells-own-realm-own-base-lists"]).toBe("3/3/3");
  });

  it("profession bonuses: armor +5, athletic +5, awareness +5, weapons +10, combat maneuvers +10, power manipulation +5, body development +10", () => {
    const { system } = buildProfessionSystem(def, costs, {});
    const bySlug = Object.fromEntries(system.professionBonuses.filter((b) => b.type === "category").map((b) => [b.slug, b.bonus]));
    for (const s of ["armor-light", "armor-medium", "armor-heavy", "athletic-brawn", "athletic-endurance", "athletic-gymnastics",
      "awareness-perceptions", "awareness-searching", "awareness-senses", "power-manipulation"]) expect(bySlug[s]).toBe(5);
    for (const s of ["weapon-1-h-edged", "weapon-1-h-concussion", "weapon-2-handed", "weapon-missile", "weapon-missile-artillery",
      "weapon-pole-arms", "weapon-thrown", "combat-maneuvers", "body-development"]) expect(bySlug[s]).toBe(10);
    expect(Object.keys(bySlug)).toHaveLength(19);
  });

  it("links the +20 Transcend Armor, the designations and the base lists that are in the catalog", () => {
    const catalog = {
      skills: [skill("Trascender armadura", "trascender-armadura"), skill("Religión", "religion"), skill("Justa", "justa")],
      spellLists: ["Comunión", "Exorcismos", "Armas Sagradas", "Curación Sagrada", "Escudos Sagrados", "Caminos Inspiradores"]
        .map((name, i) => ({ name, uuid: `Item.list${i}` }))
    };
    const { system, report } = buildProfessionSystem(def, costs, catalog);
    expect(system.professionBonuses).toContainEqual({ slug: "trascender-armadura", bonus: 20, type: "skill" });
    expect(system.skillDesignations).toEqual([
      { slug: "justa", designation: "Everyman" },
      { slug: "religion", designation: "Occupational" }
    ]);
    expect(system.basicSpellLists).toHaveLength(6);
    expect(system.basicSpellLists[0]).toEqual({ uuid: "Item.list0", name: "Comunión" });
    expect(formatProfessionReport(report).every((l) => l.startsWith("✔"))).toBe(true);
  });

  it("what the catalog lacks is left out and reported, never invented", () => {
    const catalog = { skills: [skill("Religión", "religion")], spellLists: [{ name: "Comunión", uuid: "Item.c" }] };
    const { system, report } = buildProfessionSystem(def, costs, catalog);
    expect(system.professionBonuses.some((b) => b.type === "skill")).toBe(false);
    expect(system.skillDesignations).toEqual([{ slug: "religion", designation: "Occupational" }]);
    expect(system.basicSpellLists).toEqual([{ uuid: "Item.c", name: "Comunión" }]);
    const lines = formatProfessionReport(report);
    expect(lines.filter((l) => l.startsWith("✘"))).toHaveLength(2 + 5);
  });

  it("always four prime stats, a spells block and the costs it was given", () => {
    const { system } = buildProfessionSystem({ spellUserType: "none" }, { "armor-light": "1" }, {});
    expect(system.primeStats).toEqual(["", "", "", ""]);
    expect(system.skillCategoryCosts).toEqual({ "armor-light": "1" });
    expect(system.spells).toEqual({ lists: [] });
  });
});
