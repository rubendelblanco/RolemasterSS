/**
 * Tests for spell adder selection (getMatchingSpellAdder).
 */
import { getMatchingSpellAdder } from "../module/actors/utils/power_points_util.js";

function mockActor(realm, itemList) {
  return {
    system: { fixed_info: { realm } },
    items: itemList
  };
}

function mockItem(type, flags, systemExtra) {
  const base = { type, system: { ...systemExtra } };
  if (type === "item") {
    base.system.worn = flags.equippedOrWorn === true;
  } else {
    base.system.equipped = flags.equippedOrWorn === true;
  }
  return base;
}

describe("getMatchingSpellAdder", () => {
  test("returns null without actor realm", () => {
    const actor = mockActor("", []);
    expect(getMatchingSpellAdder(actor)).toBeNull();
  });

  test("among unused adders, picks highest spell_adder bonus (order-independent)", () => {
    const low = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 1,
      spell_adder_uses_remaining: 1,
      spell_adder_realm: "all"
    });
    const high = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_uses_remaining: 2,
      spell_adder_realm: "all"
    });
    const actor = mockActor("essence", [low, high]);
    const r = getMatchingSpellAdder(actor);
    expect(r).not.toBeNull();
    expect(r.value).toBe(2);
    expect(r.item).toBe(high);
  });

  test("same bonus: first in equipped order wins", () => {
    const first = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_uses_remaining: 2,
      spell_adder_realm: "all"
    });
    const second = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_uses_remaining: 2,
      spell_adder_realm: "all"
    });
    const actor = mockActor("essence", [first, second]);
    const r = getMatchingSpellAdder(actor);
    expect(r.item).toBe(first);
  });

  test("if any adder is partially used, only committed pool applies (cannot switch to higher full)", () => {
    const weakPartial = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_uses_remaining: 1,
      spell_adder_realm: "all"
    });
    const strongFull = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 3,
      spell_adder_uses_remaining: 3,
      spell_adder_realm: "all"
    });
    const actor = mockActor("essence", [weakPartial, strongFull]);
    const r = getMatchingSpellAdder(actor);
    expect(r.item).toBe(weakPartial);
    expect(r.value).toBe(2);
    expect(r.usesRemaining).toBe(1);
  });

  test("committed adder with 0 uses: no spell adder available even if another is full", () => {
    const drained = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_uses_remaining: 0,
      spell_adder_realm: "all"
    });
    const full = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 5,
      spell_adder_uses_remaining: 5,
      spell_adder_realm: "all"
    });
    const actor = mockActor("essence", [drained, full]);
    expect(getMatchingSpellAdder(actor)).toBeNull();
  });

  test("missing uses_remaining defaults to full (uncommitted)", () => {
    const item = mockItem("weapon", { equippedOrWorn: true }, {
      spell_adder: 2,
      spell_adder_realm: "all"
    });
    const actor = mockActor("essence", [item]);
    const r = getMatchingSpellAdder(actor);
    expect(r.usesRemaining).toBe(2);
    expect(r.value).toBe(2);
  });
});
