/**
 * @jest-environment node
 */
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import ParryService, { PARRY_REASON } from "../module/combat/services/parry_service.js";
import EquipmentService from "../module/actors/services/equipment_service.js";

const weapon = (type, extra = {}) => ({ type: "weapon", id: `w-${type}`, name: type, system: { type, ...extra } });
const attack = (limit) => ({ type: "creature_attack", id: "c1", name: "Claw", system: { parry_limit: limit } });

/** Actor stub whose flags behave like Document#setFlag (deep-merge) / unsetFlag. */
function makeActor({ effects = [], items = [], flag = null } = {}) {
  const store = { parry: flag };
  return {
    effects,
    items,
    store,
    getFlag: (_scope, key) => store[key] ?? null,
    setFlag: jest.fn(async (_scope, key, value) => {
      store[key] = (store[key] && typeof value === "object") ? { ...store[key], ...value } : value;
    }),
    unsetFlag: jest.fn(async (_scope, key) => { delete store[key]; })
  };
}

const reservation = (over = {}) => ({ points: 30, capPercent: 50, defense: 30, requested: 30, ob: 60, weaponId: "w-2h", consumed: false, ...over });
const equipped = (type) => weapon(type, { equipped: true });

afterEach(() => jest.restoreAllMocks());

describe("ParryService weapon rules", () => {
  it("1-handed weapons can reserve 100 % of the OB; two-handed and pole weapons 50 %", () => {
    for (const t of ["1he", "1hc"]) expect(ParryService.getItemCapPercent(weapon(t))).toBe(100);
    for (const t of ["2h", "pa1h", "pa2h"]) expect(ParryService.getItemCapPercent(weapon(t))).toBe(50);
  });

  it("creature attacks use their own limit, 100 unless set to 50", () => {
    expect(ParryService.getItemCapPercent(attack(50))).toBe(50);
    expect(ParryService.getItemCapPercent(attack(100))).toBe(100);
    expect(ParryService.getItemCapPercent(attack(undefined))).toBe(100);
    expect(ParryService.getItemCapPercent(attack(7))).toBe(100);
  });

  it("Stunned caps parry at 50 %, and does not stack with a weapon's own 50 %", () => {
    const stunned = makeActor({ effects: [{ name: "Stunned", duration: { value: 2 } }] });
    const fine = makeActor();
    expect(ParryService.getCapPercent(weapon("1he"), stunned)).toBe(50);
    expect(ParryService.getCapPercent(weapon("2h"), stunned)).toBe(50);   // not 25
    expect(ParryService.getCapPercent(weapon("2h"), fine)).toBe(50);
    expect(ParryService.getCapPercent(weapon("1he"), fine)).toBe(100);
    expect(ParryService.getCapPercent(attack(50), stunned)).toBe(50);
  });

  it("an expired Stunned effect (0 rounds left) does not cap anything", () => {
    const actor = makeActor({ effects: [{ name: "Stunned", duration: { value: 0 } }] });
    expect(ParryService.getCapPercent(weapon("1he"), actor)).toBe(100);
  });

  it("missile and thrown weapons can neither parry nor be parried; melee and creature attacks can", () => {
    for (const t of ["mis", "th"]) {
      expect(ParryService.canParryWith(weapon(t))).toBe(false);
      expect(ParryService.isParryableAttack(weapon(t))).toBe(false);
    }
    for (const t of ["1he", "1hc", "2h", "pa1h", "pa2h"]) {
      expect(ParryService.canParryWith(weapon(t))).toBe(true);
      expect(ParryService.isParryableAttack(weapon(t))).toBe(true);
    }
    expect(ParryService.canParryWith(attack(1))).toBe(true);
    expect(ParryService.isParryableAttack(attack(1))).toBe(true);
    expect(ParryService.canParryWith({ type: "armor", system: {} })).toBe(false);
  });

  it("a spell is never parryable, whatever the weapon", () => {
    expect(ParryService.isParryableAttack(weapon("1he"), { isSpell: true })).toBe(false);
  });

  it("getMaxReservable is the cap's share of the OB, rounded down", () => {
    expect(ParryService.getMaxReservable(60, 100)).toBe(60);
    expect(ParryService.getMaxReservable(60, 50)).toBe(30);
    expect(ParryService.getMaxReservable(61, 50)).toBe(30);
    expect(ParryService.getMaxReservable(0, 50)).toBe(0);
    expect(ParryService.getMaxReservable(-10, 100)).toBe(0);
  });

  it("computeReservation: always 1 OB = 1 DB, clamped to what the cap allows", () => {
    expect(ParryService.computeReservation(30, 60, 100)).toEqual({ spent: 30, defense: 30, max: 60 });
    expect(ParryService.computeReservation(100, 60, 100)).toEqual({ spent: 60, defense: 60, max: 60 });
    expect(ParryService.computeReservation(100, 60, 50)).toEqual({ spent: 30, defense: 30, max: 30 });
    expect(ParryService.computeReservation(31, 60, 50)).toEqual({ spent: 30, defense: 30, max: 30 });
    expect(ParryService.computeReservation(-5, 60, 100)).toEqual({ spent: 0, defense: 0, max: 60 });
    expect(ParryService.computeReservation(10, 0, 100)).toEqual({ spent: 0, defense: 0, max: 0 });
  });
});

describe("ParryService.getParryCandidates", () => {
  it("lists equipped melee weapons and creature attacks, not missile/thrown", () => {
    const sword = weapon("1he");
    const bow = weapon("mis");
    const claw = attack(1);
    const actor = makeActor({ items: [sword, bow, claw] });
    jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([sword, bow]);
    expect(ParryService.getParryCandidates(actor)).toEqual([sword, claw]);
  });
});

describe("ParryService.canReserveNow", () => {
  const combatant = { id: "me" };
  const turns = [{ id: "a" }, { id: "me" }, { id: "b" }];

  it("the GM can always reserve", () => {
    expect(ParryService.canReserveNow({ started: true, combatant: { id: "a" }, turns, round: 3, turn: 0 }, combatant, true).allowed).toBe(true);
  });

  it("a player can on their own turn (flagged as such)", () => {
    expect(ParryService.canReserveNow({ started: true, combatant: { id: "me" }, turns, round: 2, turn: 1 }, combatant, false))
      .toEqual({ allowed: true, ownTurn: true });
  });

  it("a player can before the combat starts, and before their first turn in round 1", () => {
    expect(ParryService.canReserveNow({ started: false, turns }, combatant, false).allowed).toBe(true);
    expect(ParryService.canReserveNow({ started: true, combatant: { id: "a" }, turns, round: 1, turn: 0 }, combatant, false))
      .toEqual({ allowed: true, ownTurn: false });
  });

  it("a player cannot out of turn once they have already had their first turn", () => {
    expect(ParryService.canReserveNow({ started: true, combatant: { id: "b" }, turns, round: 1, turn: 2 }, combatant, false).allowed).toBe(false);
    expect(ParryService.canReserveNow({ started: true, combatant: { id: "a" }, turns, round: 2, turn: 0 }, combatant, false).allowed).toBe(false);
  });
});

describe("ParryService reservation lifecycle", () => {
  it("reserves on the actor: a two-handed weapon is capped at 50 % of the OB, 1:1", async () => {
    const actor = makeActor();
    const res = await ParryService.reserve(actor, { item: weapon("2h"), requested: 60, ob: 60, combatId: "cmb" });
    expect(res.ok).toBe(true);
    expect(actor.store.parry).toMatchObject({ points: 30, capPercent: 50, defense: 30, requested: 60, ob: 60, consumed: false, combatId: "cmb" });
  });

  it("a 1-handed weapon can reserve all the OB", async () => {
    const actor = makeActor();
    await ParryService.reserve(actor, { item: weapon("1he"), requested: 60, ob: 60 });
    expect(actor.store.parry).toMatchObject({ points: 60, capPercent: 100, defense: 60 });
  });

  it("a stunned 1-handed fighter is capped at 50 %; a stunned two-handed one stays at 50 %", async () => {
    const effects = [{ name: "Stunned", duration: { value: 1 } }];
    const a = makeActor({ effects });
    await ParryService.reserve(a, { item: weapon("1he"), requested: 60, ob: 60 });
    expect(a.store.parry).toMatchObject({ points: 30, capPercent: 50 });
    const b = makeActor({ effects });
    await ParryService.reserve(b, { item: weapon("2h"), requested: 60, ob: 60 });
    expect(b.store.parry).toMatchObject({ points: 30, capPercent: 50 });
  });

  it("is a standing stance: nothing expires it when turns come and go", async () => {
    const sword = equipped("1he");
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 20, ob: 40 });
    await ParryService.refreshAtTurnStart(actor);
    await ParryService.refreshAtTurnStart(actor);
    expect(actor.store.parry).toMatchObject({ points: 20, defense: 20, consumed: false });
  });

  it("a new reservation replaces the old one instead of merging into it", async () => {
    const actor = makeActor({ flag: reservation({ consumed: true, paid: true, points: 50, defense: 50, capPercent: 100 }) });
    await ParryService.reserve(actor, { item: weapon("1he"), requested: 10, ob: 40 });
    expect(actor.store.parry).toMatchObject({ points: 10, defense: 10, consumed: false });
  });

  it("refuses to reserve with No parry, without a weapon that can parry, or with no OB", async () => {
    const noParry = makeActor({ effects: [{ name: "No parry", duration: { value: 2 } }] });
    expect(await ParryService.reserve(noParry, { item: weapon("1he"), requested: 10, ob: 40 })).toEqual({ ok: false, reason: "no_parry_effect" });
    const actor = makeActor();
    expect(await ParryService.reserve(actor, { item: weapon("mis"), requested: 10, ob: 40 })).toEqual({ ok: false, reason: "no_weapon" });
    expect(await ParryService.reserve(actor, { item: weapon("1he"), requested: 10, ob: 0 })).toEqual({ ok: false, reason: "no_ob" });
    expect(actor.store.parry).toBeFalsy();
  });

  it("consumeDefense keeps the points (the OB stays spent) but marks the defense used", async () => {
    const actor = makeActor({ flag: reservation() });
    await ParryService.consumeDefense(actor);
    expect(actor.store.parry).toMatchObject({ consumed: true, points: 30, defense: 30 });
  });

  it("an expired (cleared) flag reads as no reservation", () => {
    expect(ParryService.getReservation(makeActor())).toBeNull();
    expect(ParryService.getReservation(makeActor({ flag: reservation({ points: 0 }) }))).toBeNull();
  });
});

describe("ParryService.refreshAtTurnStart", () => {
  it("does nothing without a reservation", async () => {
    expect(await ParryService.refreshAtTurnStart(makeActor())).toBe("none");
  });

  it("re-arms a consumed parry when the owner's turn starts, keeping the points", async () => {
    const sword = equipped("1he");
    const actor = makeActor({ items: [sword], flag: reservation({ weaponId: sword.id, points: 30, defense: 30, requested: 30, ob: 60, capPercent: 100, consumed: true }) });
    expect(await ParryService.refreshAtTurnStart(actor)).toBe("kept");
    expect(actor.store.parry).toMatchObject({ points: 30, defense: 30, consumed: false });
  });

  it("re-applies the Stunned cap, and gives the points back once the stun is over", async () => {
    const sword = equipped("1he");
    const base = reservation({ weaponId: sword.id, points: 60, defense: 60, requested: 60, ob: 60, capPercent: 100 });
    const stunned = makeActor({ items: [sword], flag: base, effects: [{ name: "Stunned", duration: { value: 1 } }] });
    await ParryService.refreshAtTurnStart(stunned);
    expect(stunned.store.parry).toMatchObject({ points: 30, defense: 30, capPercent: 50 });

    stunned.effects = [];
    await ParryService.refreshAtTurnStart(stunned);
    expect(stunned.store.parry).toMatchObject({ points: 60, defense: 60, capPercent: 100 });
  });

  it("drops the stance if the weapon is gone, unequipped, or can no longer parry", async () => {
    const sword = equipped("1he");
    const flag = reservation({ weaponId: sword.id, capPercent: 100 });

    const gone = makeActor({ items: [], flag });
    expect(await ParryService.refreshAtTurnStart(gone)).toBe("dropped");
    expect(gone.store.parry).toBeUndefined();

    const unequipped = makeActor({ items: [{ ...sword, system: { ...sword.system, equipped: false } }], flag });
    expect(await ParryService.refreshAtTurnStart(unequipped)).toBe("dropped");

    const bow = { ...equipped("mis"), id: sword.id };
    expect(await ParryService.refreshAtTurnStart(makeActor({ items: [bow], flag }))).toBe("dropped");
  });

  it("a creature attack stance is kept (creature attacks need no equipping)", async () => {
    const claw = attack(100);
    const actor = makeActor({ items: [claw], flag: reservation({ weaponId: claw.id, capPercent: 100, consumed: true, points: 20, defense: 20, requested: 20, ob: 40 }) });
    expect(await ParryService.refreshAtTurnStart(actor)).toBe("kept");
    expect(actor.store.parry.consumed).toBe(false);
  });

  it("scenario: the orc parries Zirga's attack, and parries again on the next round without re-reserving", async () => {
    const sword = equipped("1he");
    const orc = makeActor({ items: [sword] });
    const zirgaAttack = weapon("1he");

    // Pre-combat stance: 30 OB of 60.
    await ParryService.reserve(orc, { item: sword, requested: 30, ob: 60 });

    // Round 1, Zirga attacks: parried, then spent.
    let r = ParryService.evaluateDefender({ defender: orc, attackWeapon: zirgaAttack, facingValue: "" });
    expect(r).toMatchObject({ applies: true, defense: 30 });
    await ParryService.consumeDefense(orc);
    expect(ParryService.evaluateDefender({ defender: orc, attackWeapon: zirgaAttack, facingValue: "" }).reason).toBe(PARRY_REASON.CONSUMED);

    // The orc's own turn: re-armed, and his attack still loses the 30 OB.
    await ParryService.refreshAtTurnStart(orc);
    expect(ParryService.getAttackerDeduction(orc, 60)).toEqual({ value: -30, points: 30 });

    // Round 2, Zirga attacks again: parried again.
    r = ParryService.evaluateDefender({ defender: orc, attackWeapon: zirgaAttack, facingValue: "" });
    expect(r).toMatchObject({ applies: true, defense: 30 });
  });

  it("a No parry critical suspends the stance (no parry, and the OB is back) and it resumes afterwards", async () => {
    const sword = equipped("1he");
    const actor = makeActor({ items: [sword], flag: reservation({ weaponId: sword.id, capPercent: 100, points: 30, defense: 30, requested: 30, ob: 60 }) });
    actor.effects = [{ name: "No parry", duration: { value: 2 } }];
    expect(ParryService.getAttackerDeduction(actor, 60)).toBeNull();
    expect(ParryService.evaluateDefender({ defender: actor, attackWeapon: weapon("1he"), facingValue: "" }).reason).toBe(PARRY_REASON.NO_PARRY);
    expect(ParryService.getReservation(actor)).not.toBeNull();

    actor.effects = [];
    expect(ParryService.getAttackerDeduction(actor, 60)?.value).toBe(-30);
    expect(ParryService.evaluateDefender({ defender: actor, attackWeapon: weapon("1he"), facingValue: "" }).applies).toBe(true);
  });
});

describe("ParryService.getAttackerDeduction", () => {
  it("deducts the reserved OB, floored so the attacker keeps attacking at OB 0", () => {
    const actor = makeActor({ flag: reservation({ points: 30 }) });
    expect(ParryService.getAttackerDeduction(actor, 50)).toEqual({ value: -30, points: 30 });
    expect(ParryService.getAttackerDeduction(actor, 20)).toEqual({ value: -20, points: 30 });
    expect(ParryService.getAttackerDeduction(actor, 0)).toBeNull();
    expect(ParryService.getAttackerDeduction(actor, -10)).toBeNull();
  });

  it("applies even after the defense was consumed (the OB is still spent)", () => {
    const actor = makeActor({ flag: reservation({ consumed: true }) });
    expect(ParryService.getAttackerDeduction(actor, 50)?.value).toBe(-30);
  });

  it("is null with no reservation", () => {
    expect(ParryService.getAttackerDeduction(makeActor(), 50)).toBeNull();
  });
});

describe("ParryService.evaluateDefender", () => {
  const melee = weapon("1he");
  const defender = (over) => makeActor({ flag: reservation(over) });

  it("applies the reserved defense to a frontal melee attack", () => {
    expect(ParryService.evaluateDefender({ defender: defender(), attackWeapon: melee, facingValue: "" }))
      .toEqual({ applies: true, defense: 30, points: 30, reason: null });
  });

  it("does not apply from the flank, rear flank or rear", () => {
    for (const facing of ["15", "25", "35"]) {
      const r = ParryService.evaluateDefender({ defender: defender(), attackWeapon: melee, facingValue: facing });
      expect(r).toMatchObject({ applies: false, defense: 0, reason: PARRY_REASON.NOT_FRONT });
    }
  });

  it("does not apply to missile, thrown or spell attacks", () => {
    for (const t of ["mis", "th"]) {
      expect(ParryService.evaluateDefender({ defender: defender(), attackWeapon: weapon(t), facingValue: "" }).reason).toBe(PARRY_REASON.NOT_PARRYABLE);
    }
    expect(ParryService.evaluateDefender({ defender: defender(), attackWeapon: melee, isSpell: true, facingValue: "" }).reason).toBe(PARRY_REASON.SPELL);
  });

  it("only one attack is parried: a consumed reservation does nothing", () => {
    expect(ParryService.evaluateDefender({ defender: defender({ consumed: true }), attackWeapon: melee, facingValue: "" }))
      .toMatchObject({ applies: false, defense: 0, reason: PARRY_REASON.CONSUMED });
  });

  it("No parry blocks an already reserved parry", () => {
    const d = makeActor({ flag: reservation(), effects: [{ name: "No parry", duration: { value: 1 } }] });
    expect(ParryService.evaluateDefender({ defender: d, attackWeapon: melee, facingValue: "" }).reason).toBe(PARRY_REASON.NO_PARRY);
  });

  it("a creature attack is a parryable attack", () => {
    expect(ParryService.evaluateDefender({ defender: defender(), attackWeapon: attack(1), facingValue: "" }).applies).toBe(true);
  });

  it("reports NONE when nothing was reserved", () => {
    expect(ParryService.evaluateDefender({ defender: makeActor(), attackWeapon: melee, facingValue: "" }).reason).toBe(PARRY_REASON.NONE);
    expect(ParryService.evaluateDefender({ defender: null, attackWeapon: melee, facingValue: "" }).reason).toBe(PARRY_REASON.NONE);
  });
});

describe("ParryService paid rule (no free parry by releasing before attacking)", () => {
  const sword = equipped("1he");

  it("a new reservation starts unpaid and an attack with it on marks it paid", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    expect(actor.store.parry.paid).toBe(false);
    await ParryService.markPaid(actor);
    expect(actor.store.parry.paid).toBe(true);
    await ParryService.markPaid(actor); // idempotent
    expect(actor.setFlag).toHaveBeenCalledTimes(2); // the reserve + one markPaid
  });

  it("a player can't release an unpaid stance: the orc can't parry for free and then attack at 100%", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    expect(ParryService.canRelease(actor, false)).toBe(false);
    expect(await ParryService.clear(actor, { isGM: false })).toEqual({ ok: false, reason: "unpaid_lower" });
    expect(actor.store.parry).toBeDefined();
  });

  it("once an attack has paid for it, the player can release it freely", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    await ParryService.markPaid(actor);
    expect(await ParryService.clear(actor, { isGM: false })).toEqual({ ok: true });
    expect(actor.store.parry).toBeUndefined();
  });

  it("the GM can always release, and the system can force it (end of combat)", async () => {
    const a = makeActor({ items: [sword] });
    await ParryService.reserve(a, { item: sword, requested: 30, ob: 60 });
    expect((await ParryService.clear(a, { isGM: true })).ok).toBe(true);
    const b = makeActor({ items: [sword] });
    await ParryService.reserve(b, { item: sword, requested: 30, ob: 60 });
    expect((await ParryService.clear(b, { force: true })).ok).toBe(true);
  });

  it("an unpaid stance can be raised but not lowered by a player; the GM can lower it", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    expect(await ParryService.reserve(actor, { item: sword, requested: 10, ob: 60 })).toEqual({ ok: false, reason: "unpaid_lower" });
    expect(actor.store.parry.points).toBe(30);
    expect((await ParryService.reserve(actor, { item: sword, requested: 45, ob: 60 })).ok).toBe(true);
    expect(actor.store.parry.points).toBe(45);
    expect((await ParryService.reserve(actor, { item: sword, requested: 10, ob: 60, isGM: true })).ok).toBe(true);
    expect(actor.store.parry.points).toBe(10);
  });

  it("a paid stance can be lowered; the new one then has to be paid in turn", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    await ParryService.markPaid(actor);
    expect((await ParryService.reserve(actor, { item: sword, requested: 10, ob: 60 })).ok).toBe(true);
    expect(actor.store.parry).toMatchObject({ points: 10, paid: false });
  });

  it("the re-arm at turn start keeps the paid state", async () => {
    const actor = makeActor({ items: [sword] });
    await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 });
    await ParryService.markPaid(actor);
    await ParryService.refreshAtTurnStart(actor);
    expect(actor.store.parry.paid).toBe(true);
  });
});

describe("ParryService 'must parry' criticals", () => {
  const mp = (value, rounds = 1) => ({ name: "Parry", duration: { value: rounds }, flags: { rmss: { value } } });
  const sword = equipped("1he");
  const axe2h = equipped("2h");

  it("sums the penalties of the active 'Parry' effects only, and reports the longest duration", () => {
    const actor = makeActor({ effects: [
      mp(-20, 2),
      mp(-40, 1),
      mp(-10, 0),                                            // expired
      { name: "Parry +30", duration: { value: 999 }, flags: { rmss: { parryStance: true } } } // our own stance marker
    ] });
    expect(ParryService.getMustParryPenalty(actor)).toBe(-60);
    expect(ParryService.getMustParryRounds(actor)).toBe(2);
    expect(ParryService.getMustParryEffects(actor)).toHaveLength(2);
  });

  it("a critical with rounds only (no value) forces the parry but adds no penalty", () => {
    const actor = makeActor({ effects: [{ name: "Parry", duration: { value: 1 }, flags: { rmss: {} } }] });
    expect(ParryService.getMustParryPenalty(actor)).toBe(0);
    expect(ParryService.isMustParry(actor)).toBe(true);
  });

  it("No parry wins: no obligation to parry, but the penalty still applies", () => {
    const actor = makeActor({ effects: [mp(-30), { name: "No parry", duration: { value: 2 } }] });
    expect(ParryService.isMustParry(actor)).toBe(false);
    expect(ParryService.getMustParryPenalty(actor)).toBe(-30);
    expect(ParryService.getMinReservable(actor, 60, 100)).toBe(0);
  });

  it("the forced minimum is half the OB, never above the cap, and zero without the effect", () => {
    const forced = makeActor({ effects: [mp(-20)] });
    expect(ParryService.getMinReservable(forced, 60, 100)).toBe(30);
    expect(ParryService.getMinReservable(forced, 60, 50)).toBe(30);
    expect(ParryService.getMinReservable(forced, 61, 50)).toBe(30);
    expect(ParryService.getMinReservable(makeActor(), 60, 100)).toBe(0);
  });

  it("a player can't reserve below the minimum, can reach it or go above; the GM can go under", async () => {
    const actor = makeActor({ items: [sword], effects: [mp(-20)] });
    expect(await ParryService.reserve(actor, { item: sword, requested: 20, ob: 60 })).toEqual({ ok: false, reason: "must_parry_min" });
    expect((await ParryService.reserve(actor, { item: sword, requested: 30, ob: 60 })).ok).toBe(true);
    expect((await ParryService.reserve(actor, { item: sword, requested: 45, ob: 60 })).ok).toBe(true);
    expect((await ParryService.reserve(actor, { item: sword, requested: 10, ob: 60, isGM: true })).ok).toBe(true);
  });

  it("while it lasts the stance can't be released even if paid, except by the GM", async () => {
    const actor = makeActor({ items: [sword], effects: [mp(-20)], flag: reservation({ weaponId: sword.id, capPercent: 100, paid: true }) });
    expect(ParryService.canRelease(actor, false)).toBe(false);
    expect(await ParryService.clear(actor, { isGM: false })).toEqual({ ok: false, reason: "must_parry_min" });
    expect(ParryService.canRelease(actor, true)).toBe(true);
    actor.effects = [];
    expect(ParryService.canRelease(actor, false)).toBe(true);
  });

  describe("enforceMustParry", () => {
    const obOf = (item) => ({ [sword.id]: 60, [axe2h.id]: 100 }[item.id] ?? 0);

    it("does nothing without a 'must parry' effect", async () => {
      const actor = makeActor({ items: [sword] });
      jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([sword]);
      expect(await ParryService.enforceMustParry(actor, { getOb: obOf })).toBeNull();
      expect(actor.store.parry).toBeFalsy();
    });

    it("creates the stance at half the OB with the weapon that can reserve the most", async () => {
      const actor = makeActor({ items: [sword, axe2h], effects: [mp(-20)] });
      jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([sword, axe2h]);
      // sword: OB 60 -> max 60; two-handed axe: OB 100 capped at 50% -> max 50. The sword wins.
      const res = await ParryService.enforceMustParry(actor, { getOb: obOf });
      expect(res).toMatchObject({ points: 30, defense: 30, weaponId: sword.id });
      expect(actor.store.parry.points).toBe(30);
    });

    it("raises a stance that fell short, and leaves a bigger one alone", async () => {
      jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([sword]);
      const low = makeActor({ items: [sword], effects: [mp(-20)], flag: reservation({ weaponId: sword.id, capPercent: 100, points: 10, defense: 10, requested: 10, ob: 60, paid: true }) });
      expect((await ParryService.enforceMustParry(low, { getOb: obOf })).points).toBe(30);

      const high = makeActor({ items: [sword], effects: [mp(-20)], flag: reservation({ weaponId: sword.id, capPercent: 100, points: 50, defense: 50, requested: 50, ob: 60, paid: true }) });
      expect((await ParryService.enforceMustParry(high, { getOb: obOf })).points).toBe(50);
      expect(high.store.parry.points).toBe(50);
    });

    it("with No parry, no reservation is forced; with no weapon that can parry, nothing happens", async () => {
      const noParry = makeActor({ items: [sword], effects: [mp(-20), { name: "No parry", duration: { value: 1 } }] });
      jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([sword]);
      expect(await ParryService.enforceMustParry(noParry, { getOb: obOf })).toBeNull();

      const unarmed = makeActor({ items: [], effects: [mp(-20)] });
      EquipmentService.getEquippedWeapons.mockReturnValue([]);
      expect(await ParryService.enforceMustParry(unarmed, { getOb: obOf })).toBeNull();
      expect(unarmed.store.parry).toBeFalsy();
    });
  });
});
