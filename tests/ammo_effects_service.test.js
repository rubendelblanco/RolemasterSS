/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  getAmmoEffects, isEmptyAmmoEffects, snapshotAmmo, ammoAsWeaponLike, encodeAmmo, decodeAmmo, pickAttackMacro
} from "../module/combat/services/ammo_effects_service.js";
import WeaponEffectsService from "../module/combat/weapon_effects_service.js";
import { weaponUsesAmmo } from "../module/actors/utils/ammunition_util.js";

const ammo = (effects = {}, extra = {}) => ({ name: "Fire arrow", system: { ammo_effects: effects }, ...extra });
const bow = (system = {}) => ({ type: "weapon", name: "Longbow", system: { type: "mis", ammoType: "arrow", weapon_effects: {}, ...system } });
const withMacro = (item, command, name = "") => ({ ...item, flags: { rmss: { macro: { command, name } } } });

describe("ammo effects: reading and snapshot", () => {
  it("fills defaults and normalizes the slaying tags", () => {
    const e = getAmmoEffects({ ammo_effects: { slaying: "orc, undead", holy: true } });
    expect(e).toMatchObject({ slaying: ["orc", "undead"], holy: true, magical: false, increased_critical: false, slaying_bonus: 0 });
    expect(getAmmoEffects({}).effect_weapon).toBe("");
  });

  it("plain ammo has no snapshot; special ammo carries a compact one", () => {
    expect(snapshotAmmo(ammo({}))).toBeNull();
    expect(snapshotAmmo(null)).toBeNull();
    const snap = snapshotAmmo(ammo({ effect_weapon_critical_type: "heat", effect_weapon_fixed_severity: "A" }));
    expect(snap).toMatchObject({ name: "Fire arrow", effects: { effect_weapon_critical_type: "heat", effect_weapon_fixed_severity: "A" } });
    expect(isEmptyAmmoEffects(snap.effects)).toBe(false);
    expect(isEmptyAmmoEffects(getAmmoEffects({}))).toBe(true);
  });

  it("travels as a string on a chat button and comes back intact", () => {
    const snap = snapshotAmmo(ammo({ weapon_of_bleeding: true, slaying: ["orc"], isSlaying: true }));
    expect(decodeAmmo(encodeAmmo(snap))).toEqual(snap);
    expect(encodeAmmo(null)).toBe("");
    expect(decodeAmmo("")).toBeNull();
    expect(decodeAmmo("not json")).toBeNull();
    expect(decodeAmmo(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it("is read as a weapon-shaped object by the weapon code", () => {
    const like = ammoAsWeaponLike(snapshotAmmo(ammo({ holy: true, slaying: ["orc"], isSlaying: true, slaying_bonus: 10, increased_critical: true })));
    expect(like.system).toMatchObject({ holy: true, isSlaying: true, slaying: ["orc"], slaying_bonus: 10 });
    expect(like.system.weapon_effects.increased_critical).toBe(true);
    expect(ammoAsWeaponLike(null)).toBeNull();
  });
});

describe("ammo effects: combined with the weapon's", () => {
  const critical = () => ({ criticals: [{ severity: "B", critType: "P", damage: 5 }] });
  const fireArrow = ammoAsWeaponLike(snapshotAmmo(ammo({ effect_weapon_critical_type: "heat", effect_weapon_fixed_severity: "A" })));

  it("a fire arrow adds a fixed-severity extra heat critical to a plain bow", () => {
    const result = critical();
    WeaponEffectsService.appendEffectWeaponCriticals(result, bow(), fireArrow);
    expect(result.criticals[0].effectWeaponPair).toMatchObject({ extraCritType: "heat", secondSeverity: "A", duplicatePrimary: false });
  });

  it("without ammo effects nothing changes", () => {
    const result = critical();
    WeaponEffectsService.appendEffectWeaponCriticals(result, bow(), null);
    expect(result.criticals[0].effectWeaponPair).toBeUndefined();
  });

  it("the ammo's extra critical replaces the bow's as a whole set, never mixing tier and type", () => {
    const result = critical();
    const flameBow = bow({ weapon_effects: { effect_weapon: "greater", effect_weapon_critical_type: "cold" } });
    WeaponEffectsService.appendEffectWeaponCriticals(result, flameBow, fireArrow);
    expect(result.criticals[0].effectWeaponPair).toMatchObject({ extraCritType: "heat", secondSeverity: "A" });
  });

  it("a bow's own extra critical is kept when the ammo defines none", () => {
    const result = critical();
    const coldBow = bow({ weapon_effects: { effect_weapon_critical_type: "cold", effect_weapon_fixed_severity: "C" } });
    const plainBleeder = ammoAsWeaponLike(snapshotAmmo(ammo({ weapon_of_bleeding: true })));
    WeaponEffectsService.appendEffectWeaponCriticals(result, coldBow, plainBleeder);
    expect(result.criticals[0].effectWeaponPair).toMatchObject({ extraCritType: "cold", secondSeverity: "C" });
  });

  it("Increased Critical from the ammo raises the severity one step, and only once if the bow has it too", () => {
    const sharp = ammoAsWeaponLike(snapshotAmmo(ammo({ increased_critical: true })));
    const a = critical();
    WeaponEffectsService.applyIncreasedCritical(a, bow(), sharp);
    expect(a.criticals[0].severity).toBe("C");

    const b = critical();
    WeaponEffectsService.applyIncreasedCritical(b, bow({ weapon_effects: { increased_critical: true } }), sharp);
    expect(b.criticals[0].severity).toBe("C"); // not D
  });

  it("bleeding from the ammo counts for that shot only", () => {
    const bleeding = ammoAsWeaponLike(snapshotAmmo(ammo({ weapon_of_bleeding: true })));
    const actor = { items: [] };
    expect(WeaponEffectsService.actorHasWeaponOfBleeding(actor, "w1", bleeding)).toBe(true);
    expect(WeaponEffectsService.actorHasWeaponOfBleeding(actor, "w1", null)).toBe(false);
  });
});

describe("ammo macro overrides the bow's", () => {
  it("uses the ammo's macro when it has one, otherwise the bow's, otherwise nothing", () => {
    const longbow = withMacro(bow(), "bowAnimation()");
    const lightning = withMacro(ammo(), "lightningAnimation()", "Bolt");
    const plain = ammo();

    expect(pickAttackMacro(longbow, lightning)).toMatchObject({ command: "lightningAnimation()", owner: lightning, name: "Bolt" });
    expect(pickAttackMacro(longbow, plain)).toMatchObject({ command: "bowAnimation()", owner: longbow });
    expect(pickAttackMacro(longbow, null)).toMatchObject({ command: "bowAnimation()" });
    expect(pickAttackMacro(bow(), plain)).toBeNull();
  });

  it("an empty or blank macro does not count", () => {
    const longbow = withMacro(bow(), "bowAnimation()");
    expect(pickAttackMacro(longbow, withMacro(ammo(), "   "))).toMatchObject({ command: "bowAnimation()" });
  });
});

describe("weaponUsesAmmo (when the bow's macro waits for the confirmed shot)", () => {
  it("only missile weapons with an ammo type", () => {
    expect(weaponUsesAmmo(bow())).toBe(true);
    expect(weaponUsesAmmo(bow({ ammoType: "" }))).toBe(false);
    expect(weaponUsesAmmo(bow({ type: "1he" }))).toBe(false);
    expect(weaponUsesAmmo({ type: "creature_attack", system: {} })).toBe(false);
    expect(weaponUsesAmmo(null)).toBe(false);
  });
});
