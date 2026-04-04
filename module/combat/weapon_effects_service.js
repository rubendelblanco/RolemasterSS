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

const INDEX_E = SEVERITY_LETTERS.indexOf("E");

/**
 * Letters beyond E are not real table columns: F = column E + column A, G = E + B, …, J = E + E.
 * Past J, repeat full “J-sized” steps (E+E) then the remainder (same chunking as F–J).
 * @param {object} baseCrit - One critical line from the attack (damage on first row only).
 * @param {string} compositeSev - Letter after Increased Critical (F, G, …).
 * @returns {object[]}
 */
function expandCompositeSeverityToTableCrits(baseCrit, compositeSev) {
  const past = severityIndex(compositeSev) - INDEX_E;
  if (past <= 0) {
    return [{ ...baseCrit, severity: compositeSev }];
  }
  const pairs = [];
  let remaining = past;
  while (remaining > 0) {
    const chunk = Math.min(remaining, SEVERITY_AE.length);
    pairs.push(["E", SEVERITY_AE[chunk - 1]]);
    remaining -= chunk;
  }
  const out = [];
  let firstRow = true;
  for (const [s1, s2] of pairs) {
    out.push({
      ...baseCrit,
      severity: s1,
      damage: firstRow ? baseCrit.damage : 0,
      independentCriticalRoll: true
    });
    firstRow = false;
    out.push({
      ...baseCrit,
      severity: s2,
      damage: 0,
      independentCriticalRoll: true
    });
  }
  return out;
}

const INITIATIVE_BONUS = {
  minor: 2,
  normal: 4,
  greater: 6,
  superior: 8
};

/** Defaults for weapon_effects / creature_attack.attack_effects (same shape). */
const WEAPON_LIKE_EFFECTS_DEFAULTS = {
  increased_initiative: "",
  effect_weapon: "",
  effect_weapon_critical_type: "",
  effect_weapon_fixed_severity: "",
  increased_critical: false,
  weapon_of_bleeding: false
};

/**
 * @param {Item} item
 * @returns {typeof WEAPON_LIKE_EFFECTS_DEFAULTS|null}
 */
function mergeWeaponLikeEffects(item) {
  if (!item) return null;
  if (item.type === "weapon") {
    return foundry.utils.mergeObject({ ...WEAPON_LIKE_EFFECTS_DEFAULTS }, item.system?.weapon_effects ?? {}, { inplace: false });
  }
  if (item.type === "creature_attack") {
    return foundry.utils.mergeObject({ ...WEAPON_LIKE_EFFECTS_DEFAULTS }, item.system?.attack_effects ?? {}, { inplace: false });
  }
  return null;
}

/** @param {string} s */
function isFixedExtraSeverityLetter(s) {
  return /^[A-E]$/i.test(String(s ?? "").trim());
}

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
    // Composite letter (F+) = at least one E-column critical; treat as E-tier for bleeding.
    if (severityGreaterThanE(s)) return 2;
    return 0;
  }

  /**
   * Apply Increased Critical (+1 severity step) to decomposed criticals.
   * @param {{ criticals: object[] }} criticalResult
   * @param {Item} weapon
   */
  static applyIncreasedCritical(criticalResult, weapon) {
    const effects = mergeWeaponLikeEffects(weapon);
    if (!effects?.increased_critical) return;
    const crits = criticalResult.criticals;
    if (!crits?.length) return;

    const newCrits = [];
    for (const c of crits) {
      if (!c.severity || String(c.severity).trim() === "" || c.severity === "null") {
        newCrits.push(c);
        continue;
      }
      const newSev = shiftSeverity(c.severity, 1);
      if (severityGreaterThanE(newSev)) {
        const expanded = expandCompositeSeverityToTableCrits(c, newSev);
        newCrits.push(...expanded);
        const prev = criticalResult.mainSeverity;
        if (!prev || severityIndex(newSev) > severityIndex(prev)) {
          criticalResult.mainSeverity = newSev;
        }
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
    const effects = mergeWeaponLikeEffects(weapon);
    if (!effects) return;

    const crits = criticalResult.criticals;
    if (!crits?.length) return;

    const primary = crits.find((c) => c.severity != null && String(c.severity).trim() !== "" && c.severity !== "null");
    if (!primary) return;

    const explicitExtraCrit = effects.effect_weapon_critical_type;
    if (!explicitExtraCrit || String(explicitExtraCrit).trim() === "") return;

    const extraCritType = String(explicitExtraCrit).trim();
    const fixedSevRaw = String(effects.effect_weapon_fixed_severity ?? "").trim().toUpperCase();

    /** Crítico extra a gravedad fija (p. ej. siempre A de calor) si hubo crítico; ignora el tipo Menor/Mayor… */
    if (isFixedExtraSeverityLetter(fixedSevRaw)) {
      primary.effectWeaponPair = {
        duplicatePrimary: false,
        secondSeverity: fixedSevRaw,
        extraCritType,
        ewRollModifier: 0,
        superiorEChain: false
      };
      return;
    }

    const tier = effects.effect_weapon;
    if (!tier || tier === "" || tier === "none") return;

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

export {
  severityGreaterThanE,
  shiftSeverity,
  severityIndex,
  effectWeaponShiftMilderProcedureI,
  expandCompositeSeverityToTableCrits
};
