/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { evaluateMovement } from "../module/combat/services/movement_cost_service.js";

const move = (cost, extra = {}) => ({ pending: { cost, waypoints: [{ action: "walk" }] }, ...extra });

describe("evaluateMovement", () => {
  it("spends the route cost from the remaining movement", () => {
    expect(evaluateMovement(50, move(35))).toEqual({ cost: 35, remaining: 50, allowed: true, newRemaining: 15 });
  });

  it("charges the terrain surcharge: 15 ft free plus 10 ft at x2 costs 35, not 25", () => {
    const result = evaluateMovement(30, move(15 + 10 * 2));
    expect(result.allowed).toBe(false);
    expect(result.cost).toBe(35);
  });

  it("allows a move that uses exactly what is left", () => {
    expect(evaluateMovement(20, move(20))).toMatchObject({ allowed: true, newRemaining: 0 });
  });

  it("rejects a move that costs more than what is left and leaves the remaining untouched", () => {
    expect(evaluateMovement(10, move(11))).toMatchObject({ allowed: false, newRemaining: 10 });
  });

  it("rejects an impassable route (infinite cost)", () => {
    expect(evaluateMovement(100, move(Infinity))).toMatchObject({ allowed: false, cost: Infinity });
  });

  it("rounds cost and remaining like the old hook did", () => {
    expect(evaluateMovement(20.4, move(12.6))).toMatchObject({ cost: 13, remaining: 20, newRemaining: 7 });
  });

  it("treats a missing remaining as zero", () => {
    expect(evaluateMovement(undefined, move(5))).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("spends nothing for displacement (pushes, teleports)", () => {
    const displace = { pending: { cost: 40, waypoints: [{ action: "displace" }] } };
    expect(evaluateMovement(10, displace)).toBeNull();
  });

  it("spends nothing when undoing a move", () => {
    expect(evaluateMovement(10, move(30, { method: "undo" }))).toBeNull();
  });

  it("spends nothing when the move has no cost or Foundry gave none", () => {
    expect(evaluateMovement(10, move(0))).toBeNull();
    expect(evaluateMovement(10, { pending: {} })).toBeNull();
    expect(evaluateMovement(10, undefined)).toBeNull();
  });
});
