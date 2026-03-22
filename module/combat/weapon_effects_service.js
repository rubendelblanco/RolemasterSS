import EquipmentService from "../actors/services/equipment_service.js";

const SEVERITY_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** @param {string} sev */
function severityIndex(sev) {
  if (!sev || typeof sev !== "string") return -1;
  const c = sev.trim().toUpperCase()[0];
  return SEVERITY_LETTERS.indexOf(c);
}

/** @param {string} sev @param {number} delta */
function shiftSeverity(sev, delta) {
  const i = severityIndex(sev);
  if (i < 0) return sev;
  const n = Math.max(0, Math.min(SEVERITY_LETTERS.length - 1, i + delta));
  return SEVERITY_LETTERS[n];
}

/** A–E column order for critical tables (A = leve). */
const SEVERITY_AE = ["A", "B", "C", "D", "E"];

/**
 * Un paso “más leve” en A–E, mismo criterio que critical_procedure I en criaturas:
 * en A no baja la letra: −25 al d100 del crítico (mínimo 1 al resolver).
 * @param {string} severity
 * @returns {{ letter: string, rollModifier: number }}
 */
function applyOneStepMilderProcedureI(severity) {
  const s0 = String(severity ?? "A").trim().toUpperCase()[0];
  const idx = SEVERITY_AE.indexOf(s0);
  if (idx < 0) {
    return { letter: s0, rollModifier: 0 };
  }
  if (s0 === "A") {
    return { letter: "A", rollModifier: -25 };
  }
  return { letter: SEVERITY_AE[idx - 1], rollModifier: 0 };
}

/**
 * Effect Weapon Menor/Normal: varios pasos hacia A con penalizador −25 por paso que quedaría por debajo de A.
 * Ej.: A + 2 pasos → A y −50; B + 2 → A y −25; C + 2 → A sin mod.
 * @param {string} severity
 * @param {number} steps cuántos pasos más leves (1 = Normal, 2 = Menor)
 * @returns {{ secondSeverity: string, ewRollModifier: number }}
 */
function effectWeaponShiftMilderProcedureI(severity, steps) {
  if (steps <= 0) {
    const c = String(severity ?? "A").trim().toUpperCase()[0];
    return { secondSeverity: c, ewRollModifier: 0 };
  }
  let letter = String(severity ?? "A").trim().toUpperCase()[0];
  let ewRollModifier = 0;
  for (let i = 0; i < steps; i++) {
    const r = applyOneStepMilderProcedureI(letter);
    ewRollModifier += r.rollModifier;
    letter = r.letter;
  }
  return { secondSeverity: letter, ewRollModifier };
}

/** Strictly after E in A–E ordering (i.e. F+). */
function severityGreaterThanE(sev) {
  const i = severityIndex(sev);
  const e = severityIndex("E");
  return i > e;
}

const INITIATIVE_BONUS = {
  minor: 2,
  normal: 4,
  greater: 6,
  superior: 8
};

export default class WeaponEffectsService {
  /**
   * Sum Increased Initiative from all equipped weapons (RM 9.7).
   * @param {Actor} actor
   * @returns {number}
   */
  static getEquippedWeaponInitiativeBonus(actor) {
    if (!actor?.items) return 0;
    let sum = 0;
    for (const w of EquipmentService.getEquippedWeapons(actor)) {
      const tier = w.system?.weapon_effects?.increased_initiative;
      if (tier && INITIATIVE_BONUS[tier] != null) sum += INITIATIVE_BONUS[tier];
    }
    return sum;
  }

  static actorHasWeaponOfBleeding(actor) {
    if (!actor?.items) return false;
    for (const w of EquipmentService.getEquippedWeapons(actor)) {
      if (w.system?.weapon_effects?.weapon_of_bleeding === true) return true;
    }
    return false;
  }

  /**
   * Extra HPR per round from Weapon of Bleeding: +1 (A–C) or +2 (D–E) on main critical severity.
   * @param {string|null} mainSeverity
   * @returns {number}
   */
  static getWeaponOfBleedingHprBonus(mainSeverity) {
    if (!mainSeverity || typeof mainSeverity !== "string") return 0;
    const s = mainSeverity.trim().toUpperCase()[0];
    if ("ABC".includes(s)) return 1;
    if ("DE".includes(s)) return 2;
    return 0;
  }

  /**
   * Apply Increased Critical (+1 severity step) to decomposed criticals.
   * @param {{ criticals: object[] }} criticalResult
   * @param {Item} weapon
   */
  static applyIncreasedCritical(criticalResult, weapon) {
    if (weapon?.type !== "weapon") return;
    if (!weapon.system?.weapon_effects?.increased_critical) return;
    const crits = criticalResult.criticals;
    if (!crits?.length) return;

    const newCrits = [];
    for (const c of crits) {
      if (!c.severity || String(c.severity).trim() === "" || c.severity === "null") {
        newCrits.push(c);
        continue;
      }
      const oldSev = c.severity;
      const newSev = shiftSeverity(oldSev, 1);
      if (!severityGreaterThanE(oldSev) && severityGreaterThanE(newSev)) {
        newCrits.push({ ...c, severity: newSev, independentCriticalRoll: true });
        newCrits.push({ ...c, severity: newSev, damage: 0, independentCriticalRoll: true });
      } else if (severityGreaterThanE(newSev)) {
        newCrits.push({ ...c, severity: newSev, independentCriticalRoll: true });
      } else {
        newCrits.push({ ...c, severity: newSev });
      }
    }
    criticalResult.criticals = newCrits;
  }

  /**
   * Mark primary critical for Effect Weapon: one chat button; after GM confirms, the same d100 resolves
   * the attack critical (original severity) and a second table lookup (extra severity per tier).
   * @param {{ criticals: object[] }} criticalResult
   * @param {Item} weapon
   */
  static appendEffectWeaponCriticals(criticalResult, weapon) {
    if (weapon?.type !== "weapon") return;
    const tier = weapon.system?.weapon_effects?.effect_weapon;
    if (!tier || tier === "" || tier === "none") return;

    const crits = criticalResult.criticals;
    if (!crits?.length) return;

    const primary = crits.find((c) => c.severity != null && String(c.severity).trim() !== "" && c.severity !== "null");
    if (!primary) return;

    const explicitExtraCrit = weapon.system?.weapon_effects?.effect_weapon_critical_type;
    if (!explicitExtraCrit || String(explicitExtraCrit).trim() === "") return;

    const extraCritType = String(explicitExtraCrit).trim();
    const sev = primary.severity;

    let secondSeverity;
    let ewRollModifier = 0;
    let duplicatePrimary = false;
    /** Superior con golpe en E: tres lecturas misma tirada — principal E; en tabla extra, E y luego A. */
    let superiorEChain = false;
    switch (tier) {
      case "minor": {
        const r = effectWeaponShiftMilderProcedureI(sev, 2);
        secondSeverity = r.secondSeverity;
        ewRollModifier = r.ewRollModifier;
        break;
      }
      case "normal": {
        const r = effectWeaponShiftMilderProcedureI(sev, 1);
        secondSeverity = r.secondSeverity;
        ewRollModifier = r.ewRollModifier;
        break;
      }
      case "greater":
        duplicatePrimary = true;
        break;
      case "superior": {
        const s = String(sev).trim().toUpperCase()[0];
        if (s === "E") {
          superiorEChain = true;
          secondSeverity = "E";
        } else {
          secondSeverity = shiftSeverity(sev, 1);
        }
        ewRollModifier = 0;
        break;
      }
      default:
        return;
    }
    primary.effectWeaponPair = duplicatePrimary
      ? { duplicatePrimary: true, extraCritType, ewRollModifier: 0 }
      : { duplicatePrimary: false, secondSeverity, extraCritType, ewRollModifier, superiorEChain };
  }
}

export { severityGreaterThanE, shiftSeverity, severityIndex, effectWeaponShiftMilderProcedureI };
