/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import ShieldService from "../module/combat/services/shield_service.js";

const actor = (total_db, shield_bonus) => ({ system: { armor_info: { total_db, shield_bonus } } });

describe("ShieldService", () => {
  it("a frontal attack keeps the shield bonus in the DB", () => {
    expect(ShieldService.getDefenseDb(actor(40, 15), "")).toBe(40);
    expect(ShieldService.getDefenseDb(actor(40, 15), null)).toBe(40);
  });

  it("flank, rear flank and rear attacks take the shield bonus out", () => {
    for (const facing of ["15", "25", "35"]) {
      expect(ShieldService.getDefenseDb(actor(40, 15), facing)).toBe(25);
    }
  });

  it("without a shield nothing changes", () => {
    expect(ShieldService.getDefenseDb(actor(40, 0), "35")).toBe(40);
    expect(ShieldService.getDefenseDb(actor(40, undefined), "35")).toBe(40);
    expect(ShieldService.getShieldBonus(actor(40, 0))).toBe(0);
  });

  it("never goes below zero, and tolerates missing armor info", () => {
    expect(ShieldService.getDefenseDb(actor(5, 15), "15")).toBe(0);
    expect(ShieldService.getDefenseDb({ system: {} }, "15")).toBe(0);
    expect(ShieldService.getDefenseDb(null, "")).toBe(0);
  });

  it("isFrontal only for the empty facing value", () => {
    expect(ShieldService.isFrontal("")).toBe(true);
    expect(ShieldService.isFrontal(undefined)).toBe(true);
    expect(ShieldService.isFrontal("15")).toBe(false);
  });
});
