/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { hitsAfterUpdate, damageTaken } from "../module/combat/services/damage_taken_experience_service.js";

describe("hitsAfterUpdate", () => {
  it("reads the hit points from an expanded update or from a dotted key", () => {
    expect(hitsAfterUpdate({ system: { attributes: { hits: { current: 12 } } } })).toBe(12);
    expect(hitsAfterUpdate({ "system.attributes.hits.current": 7 })).toBe(7);
  });

  it("is null when the update does not touch them, or the value is not a number", () => {
    expect(hitsAfterUpdate({ system: { attributes: { hits: { max: 50 } } } })).toBeNull();
    expect(hitsAfterUpdate({ name: "Bilbo" })).toBeNull();
    expect(hitsAfterUpdate({ "system.attributes.hits.current": "abc" })).toBeNull();
    expect(hitsAfterUpdate({ "system.attributes.hits.current": null })).toBeNull();
    expect(hitsAfterUpdate(undefined)).toBeNull();
  });

  it("zero is a real value", () => {
    expect(hitsAfterUpdate({ "system.attributes.hits.current": 0 })).toBe(0);
  });
});

describe("damageTaken: 1 experience point per hit point lost", () => {
  it("the difference between the hit points before and after", () => {
    expect(damageTaken(40, { "system.attributes.hits.current": 31 })).toBe(9);
    expect(damageTaken(40, { system: { attributes: { hits: { current: 25 } } } })).toBe(15);
  });

  it("counts everything lost when the hit points go below zero", () => {
    expect(damageTaken(5, { "system.attributes.hits.current": -10 })).toBe(15);
    expect(damageTaken(-3, { "system.attributes.hits.current": -8 })).toBe(5);
  });

  it("nothing for healing, resting or an update that leaves them as they were", () => {
    expect(damageTaken(10, { "system.attributes.hits.current": 25 })).toBe(0);
    expect(damageTaken(10, { "system.attributes.hits.current": 10 })).toBe(0);
  });

  it("nothing when the update does not touch the hit points or the figures are unusable", () => {
    expect(damageTaken(10, { name: "x" })).toBe(0);
    expect(damageTaken(undefined, { "system.attributes.hits.current": 3 })).toBe(0);
    expect(damageTaken("abc", { "system.attributes.hits.current": 3 })).toBe(0);
  });

  it("copes with figures that come as text", () => {
    expect(damageTaken("40", { "system.attributes.hits.current": "31" })).toBe(9);
  });
});
