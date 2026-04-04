/**
 * @jest-environment node
 */
import { jest, describe, it, expect } from "@jest/globals";
import WeaponEffectsService, {
  shiftSeverity,
  severityGreaterThanE,
  effectWeaponShiftMilderProcedureI,
  expandCompositeSeverityToTableCrits
} from "../module/combat/weapon_effects_service.js";

describe("WeaponEffectsService", () => {
  it("shiftSeverity moves along A–Z", () => {
    expect(shiftSeverity("C", -2)).toBe("A");
    expect(shiftSeverity("A", -1)).toBe("A");
    expect(shiftSeverity("E", 1)).toBe("F");
  });

  it("severityGreaterThanE", () => {
    expect(severityGreaterThanE("E")).toBe(false);
    expect(severityGreaterThanE("F")).toBe(true);
  });

  it("effectWeaponShiftMilderProcedureI matches creature procedure I (A floor −25 per step)", () => {
    expect(effectWeaponShiftMilderProcedureI("A", 1)).toEqual({ secondSeverity: "A", ewRollModifier: -25 });
    expect(effectWeaponShiftMilderProcedureI("A", 2)).toEqual({ secondSeverity: "A", ewRollModifier: -50 });
    expect(effectWeaponShiftMilderProcedureI("B", 2)).toEqual({ secondSeverity: "A", ewRollModifier: -25 });
    expect(effectWeaponShiftMilderProcedureI("C", 2)).toEqual({ secondSeverity: "A", ewRollModifier: 0 });
    expect(effectWeaponShiftMilderProcedureI("B", 1)).toEqual({ secondSeverity: "A", ewRollModifier: 0 });
  });

  it("getEquippedWeaponInitiativeBonus sums equipped weapons", async () => {
    const { default: EquipmentService } = await import("../module/actors/services/equipment_service.js");
    jest.spyOn(EquipmentService, "getEquippedWeapons").mockReturnValue([
      { system: { weapon_effects: { increased_initiative: "minor" } } },
      { system: { weapon_effects: { increased_initiative: "normal" } } }
    ]);
    const actor = { items: [] };
    expect(WeaponEffectsService.getEquippedWeaponInitiativeBonus(actor)).toBe(6);
    EquipmentService.getEquippedWeapons.mockRestore();
  });

  it("getWeaponOfBleedingHprBonus by main severity", () => {
    expect(WeaponEffectsService.getWeaponOfBleedingHprBonus("B")).toBe(1);
    expect(WeaponEffectsService.getWeaponOfBleedingHprBonus("D")).toBe(2);
    expect(WeaponEffectsService.getWeaponOfBleedingHprBonus("F")).toBe(2);
  });

  it("expandCompositeSeverityToTableCrits maps F–J to E + A–E pairs", () => {
    const base = { critType: "K", damage: 7 };
    expect(expandCompositeSeverityToTableCrits(base, "F").map((c) => [c.severity, c.damage])).toEqual([
      ["E", 7],
      ["A", 0]
    ]);
    expect(expandCompositeSeverityToTableCrits(base, "G").map((c) => [c.severity, c.damage])).toEqual([
      ["E", 7],
      ["B", 0]
    ]);
    expect(expandCompositeSeverityToTableCrits(base, "J").map((c) => [c.severity, c.damage])).toEqual([
      ["E", 7],
      ["E", 0]
    ]);
  });

  it("applyIncreasedCritical E→F yields two buttons E and A plus mainSeverity F", () => {
    const weapon = { type: "weapon", system: { weapon_effects: { increased_critical: true } } };
    const criticalResult = { criticals: [{ severity: "E", critType: "K", damage: 10 }] };
    WeaponEffectsService.applyIncreasedCritical(criticalResult, weapon);
    expect(criticalResult.criticals.map((x) => ({ s: x.severity, d: x.damage }))).toEqual([
      { s: "E", d: 10 },
      { s: "A", d: 0 }
    ]);
    expect(criticalResult.mainSeverity).toBe("F");
  });

  it("applyIncreasedCritical on F shifts to G → E + B", () => {
    const weapon = { type: "weapon", system: { weapon_effects: { increased_critical: true } } };
    const criticalResult = { criticals: [{ severity: "F", critType: "K", damage: 3 }] };
    WeaponEffectsService.applyIncreasedCritical(criticalResult, weapon);
    expect(criticalResult.criticals.map((x) => x.severity)).toEqual(["E", "B"]);
    expect(criticalResult.mainSeverity).toBe("G");
  });

  it("appendEffectWeaponCriticals marks primary with effectWeaponPair (minor)", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "minor", effect_weapon_critical_type: "heat" }
      },
      id: "w1"
    };
    const criticalResult = {
      criticals: [{ severity: "C", critType: "K", damage: 5 }]
    };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    expect(criticalResult.criticals.length).toBe(1);
    const p = criticalResult.criticals[0];
    expect(p.effectWeaponPair.duplicatePrimary).toBe(false);
    expect(p.effectWeaponPair.secondSeverity).toBe("A");
    expect(p.effectWeaponPair.extraCritType).toBe("heat");
    expect(p.effectWeaponPair.ewRollModifier).toBe(0);
  });

  it("appendEffectWeaponCriticals does nothing without effect_weapon_critical_type", () => {
    const weapon = {
      type: "weapon",
      system: { critical_type: "K", weapon_effects: { effect_weapon: "minor" } }
    };
    const criticalResult = { criticals: [{ severity: "C", critType: "K", damage: 1 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    expect(criticalResult.criticals[0].effectWeaponPair).toBeUndefined();
  });

  it("appendEffectWeaponCriticals greater uses duplicatePrimary", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "greater", effect_weapon_critical_type: "heat" }
      }
    };
    const criticalResult = { criticals: [{ severity: "D", critType: "K", damage: 3 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    expect(criticalResult.criticals[0].effectWeaponPair).toEqual({
      duplicatePrimary: true,
      extraCritType: "heat",
      ewRollModifier: 0
    });
  });

  it("appendEffectWeaponCriticals superior on E sets superiorEChain (triple same roll: E main, E+A extra)", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "superior", effect_weapon_critical_type: "heat" }
      }
    };
    const criticalResult = { criticals: [{ severity: "E", critType: "K", damage: 2 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    const p = criticalResult.criticals[0].effectWeaponPair;
    expect(p.duplicatePrimary).toBe(false);
    expect(p.superiorEChain).toBe(true);
    expect(p.secondSeverity).toBe("E");
    expect(p.extraCritType).toBe("heat");
    expect(p.ewRollModifier).toBe(0);
  });

  it("appendEffectWeaponCriticals superior below E shifts one step only", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "superior", effect_weapon_critical_type: "heat" }
      }
    };
    const criticalResult = { criticals: [{ severity: "D", critType: "K", damage: 1 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    const p = criticalResult.criticals[0].effectWeaponPair;
    expect(p.superiorEChain).toBe(false);
    expect(p.secondSeverity).toBe("E");
    expect(p.ewRollModifier).toBe(0);
  });

  it("appendEffectWeaponCriticals uses effect_weapon_critical_type when set", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "normal", effect_weapon_critical_type: "S" }
      }
    };
    const criticalResult = { criticals: [{ severity: "C", critType: "K", damage: 2 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    expect(criticalResult.criticals[0].effectWeaponPair.extraCritType).toBe("S");
    expect(criticalResult.criticals[0].effectWeaponPair.secondSeverity).toBe("B");
    expect(criticalResult.criticals[0].effectWeaponPair.ewRollModifier).toBe(0);
  });

  it("appendEffectWeaponCriticals minor on A adds −50 roll mod", () => {
    const weapon = {
      type: "weapon",
      system: {
        critical_type: "K",
        weapon_effects: { effect_weapon: "minor", effect_weapon_critical_type: "heat" }
      }
    };
    const criticalResult = { criticals: [{ severity: "A", critType: "K", damage: 1 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    const p = criticalResult.criticals[0];
    expect(p.effectWeaponPair.secondSeverity).toBe("A");
    expect(p.effectWeaponPair.ewRollModifier).toBe(-50);
  });

  it("appendEffectWeaponCriticals fixed severity overrides tier (e.g. superior+E chain)", () => {
    const weapon = {
      type: "weapon",
      system: {
        weapon_effects: {
          effect_weapon: "superior",
          effect_weapon_critical_type: "heat",
          effect_weapon_fixed_severity: "A"
        }
      }
    };
    const criticalResult = { criticals: [{ severity: "E", critType: "K", damage: 2 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
    const p = criticalResult.criticals[0].effectWeaponPair;
    expect(p.secondSeverity).toBe("A");
    expect(p.superiorEChain).toBe(false);
    expect(p.extraCritType).toBe("heat");
  });

  it("appendEffectWeaponCriticals creature_attack uses attack_effects fixed A + heat", () => {
    const attack = {
      type: "creature_attack",
      system: {
        attack_effects: {
          effect_weapon_critical_type: "heat",
          effect_weapon_fixed_severity: "A"
        }
      }
    };
    const criticalResult = { criticals: [{ severity: "D", critType: "K", damage: 3 }] };
    WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, attack);
    const p = criticalResult.criticals[0].effectWeaponPair;
    expect(p.secondSeverity).toBe("A");
    expect(p.extraCritType).toBe("heat");
    expect(p.ewRollModifier).toBe(0);
  });

  it("applyIncreasedCritical applies to creature_attack attack_effects", () => {
    const ca = { type: "creature_attack", system: { attack_effects: { increased_critical: true } } };
    const criticalResult = { criticals: [{ severity: "C", critType: "K", damage: 5 }] };
    WeaponEffectsService.applyIncreasedCritical(criticalResult, ca);
    expect(criticalResult.criticals[0].severity).toBe("D");
  });
});
