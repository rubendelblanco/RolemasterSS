/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { computeResistanceRolls, RESISTANCE_ROLL_VALUES } from "../module/actors/utils/resistance_rolls.js";

const stats = (bonuses) => Object.fromEntries(Object.entries(bonuses).map(([k, v]) => [k, { stat_bonus: v }]));
const rolls = (mods = {}) => Object.fromEntries(RESISTANCE_ROLL_VALUES.map(({ key }) => [key, { value: 0, race_mod: mods[key] ?? 0, total: 0 }]));

describe("computeResistanceRolls: total = value + racial modifier, for all ten rolls", () => {
  const s = stats({ empathy: 2, intuition: 6, presence: 4, self_discipline: 5, constitution: 3 });

  it("the values come out of the stat bonuses", () => {
    const r = computeResistanceRolls(s, rolls());
    expect(r.essence.value).toBe(6);
    expect(r.channeling.value).toBe(18);
    expect(r.mentalism.value).toBe(12);
    expect(r.fear.value).toBe(15);
    expect(r.poison.value).toBe(9);
    expect(r.disease.value).toBe(9);
    expect(r.chann_ess.value).toBe(8);
    expect(r.chann_ment.value).toBe(10);
    expect(r.ess_ment.value).toBe(6);
    expect(r.arcane.value).toBe(12);
  });

  it("the racial modifier is added to every total, poison and disease included (the case that was left out)", () => {
    const r = computeResistanceRolls(s, rolls({ poison: 20, disease: 50, essence: -5, fear: 10, arcane: -15 }));
    expect(r.disease.total).toBe(9 + 50);
    expect(r.poison.total).toBe(9 + 20);
    expect(r.essence.total).toBe(6 - 5);
    expect(r.fear.total).toBe(15 + 10);
    expect(r.arcane.total).toBe(12 - 15);
  });

  it("with no racial modifier the total is the value", () => {
    const r = computeResistanceRolls(s, rolls());
    for (const { key } of RESISTANCE_ROLL_VALUES) expect(r[key].total).toBe(r[key].value);
  });

  it("an empty or odd modifier counts as 0", () => {
    const r = computeResistanceRolls(s, rolls({ disease: "", poison: undefined, fear: "abc" }));
    expect(r.disease.total).toBe(9);
    expect(r.poison.total).toBe(9);
    expect(r.fear.total).toBe(15);
  });

  it("a roll that the actor doesn't have is skipped", () => {
    const partial = { essence: { race_mod: 3 } };
    expect(() => computeResistanceRolls(s, partial)).not.toThrow();
    expect(partial.essence.total).toBe(9);
  });
});
