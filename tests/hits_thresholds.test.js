/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { evaluateHitsThreshold, shouldWakeUp, HITS_OUTCOME } from "../module/combat/services/hits_thresholds.js";

// Un personaje con 50 puntos de vida y 70 de Constitución temporal: inconsciente a 0, muerto a -70
const pj = (priorHits, newHits, constitutionTemp = 70) => evaluateHitsThreshold({ priorHits, newHits, constitutionTemp });

describe("evaluateHitsThreshold: a player character falls unconscious at 0 and dies at minus their Constitution", () => {
  it("losing all the hit points leaves them unconscious, not dead", () => {
    expect(pj(50, 0)).toBe(HITS_OUTCOME.UNCONSCIOUS);
    expect(pj(50, -1)).toBe(HITS_OUTCOME.UNCONSCIOUS);
    expect(pj(10, -30)).toBe(HITS_OUTCOME.UNCONSCIOUS);
  });

  it("they die when their hit points reach minus their temporary Constitution (the -70 of the example)", () => {
    expect(pj(-30, -70)).toBe(HITS_OUTCOME.DEAD);
    expect(pj(-30, -71)).toBe(HITS_OUTCOME.DEAD);
    expect(pj(-69, -70)).toBe(HITS_OUTCOME.DEAD);
  });

  it("one point above the limit they are still alive", () => {
    expect(pj(-30, -69)).toBeNull();
    expect(pj(0, -69)).toBeNull();
  });

  it("a blow that takes them from conscious straight past the limit kills them, without a stop at unconscious", () => {
    expect(pj(50, -70)).toBe(HITS_OUTCOME.DEAD);
    expect(pj(5, -200)).toBe(HITS_OUTCOME.DEAD);
  });

  it("bleeding while unconscious can kill them: from -60 to -75", () => {
    expect(pj(-60, -75)).toBe(HITS_OUTCOME.DEAD);
  });

  it("nothing happens while they stay conscious, stay unconscious, or are already dead", () => {
    expect(pj(50, 20)).toBeNull();
    expect(pj(-10, -40)).toBeNull();
    expect(pj(-70, -90)).toBeNull();
    expect(pj(-80, -120)).toBeNull();
  });

  it("healing never kills or knocks out", () => {
    expect(pj(-30, 10)).toBeNull();
    expect(pj(0, 30)).toBeNull();
  });

  it("a different Constitution moves the limit", () => {
    expect(pj(-40, -50, 50)).toBe(HITS_OUTCOME.DEAD);
    expect(pj(-40, -50, 90)).toBeNull();
  });

  it("with no usable Constitution they die at 0, like an NPC", () => {
    expect(pj(10, 0, 0)).toBe(HITS_OUTCOME.DEAD);
    expect(evaluateHitsThreshold({ priorHits: 10, newHits: -5 })).toBe(HITS_OUTCOME.DEAD);
    expect(pj(10, -5, "abc")).toBe(HITS_OUTCOME.DEAD);
    expect(pj(10, 0, -20)).toBe(HITS_OUTCOME.DEAD);
  });

  it("copes with figures that come as text and with garbage", () => {
    expect(evaluateHitsThreshold({ priorHits: "50", newHits: "0", constitutionTemp: "70" })).toBe(HITS_OUTCOME.UNCONSCIOUS);
    expect(evaluateHitsThreshold({ priorHits: "x", newHits: 0, constitutionTemp: 70 })).toBeNull();
    expect(evaluateHitsThreshold({ priorHits: 5, newHits: undefined, constitutionTemp: 70 })).toBeNull();
    expect(evaluateHitsThreshold()).toBeNull();
  });
});

describe("shouldWakeUp", () => {
  it("back above 0 from 0 or below wakes them", () => {
    expect(shouldWakeUp(0, 1)).toBe(true);
    expect(shouldWakeUp(-30, 12)).toBe(true);
  });

  it("not when they stay at 0 or below, were already conscious, or the update does not touch the hit points", () => {
    expect(shouldWakeUp(-30, 0)).toBe(false);
    expect(shouldWakeUp(-30, -5)).toBe(false);
    expect(shouldWakeUp(10, 40)).toBe(false);
    expect(shouldWakeUp(-30, null)).toBe(false);
    expect(shouldWakeUp(-30, undefined)).toBe(false);
    expect(shouldWakeUp("x", 5)).toBe(false);
  });
});
