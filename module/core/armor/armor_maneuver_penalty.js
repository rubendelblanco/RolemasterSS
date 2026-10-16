/**
 * Moving maneuver penalty (MMP) of the armor an actor wears.
 *
 * RMFRP core rules, Section 8.4 and Appendix A-4.1, Armor Table T-3.3:
 *
 *   MMP = lesser of ( the armor's Minimum Maneuver Modification,
 *                     the armor's Maximum Maneuver Modification + the skill bonus for the armor worn )
 *
 * The maximum is what an untrained wearer suffers; the skill bonus lifts it toward zero, but never past
 * the minimum, which is the least the armor's weight and bulk will always cost. Both are zero or negative,
 * so "lesser" is the numerically smaller one. Armor types 1-4 (no armor) have no MMP.
 *
 * The skill for the armor worn depends on the armor type: AT 5-8 Soft Leather, 9-12 Rigid Leather,
 * 13-16 Chain, 17-20 Plate. Soft and Rigid Leather are both in the Armor - Light category, Chain is the
 * only skill of Armor - Medium and Plate of Armor - Heavy.
 */

/** Armor Table T-3.3: armor type -> [minimum mod, maximum mod, missile attack penalty, armor quickness penalty]. */
const ARMOR_TABLE = {
    1: [0, 0, 0, 0],
    2: [0, 0, 0, 0],
    3: [0, 0, 0, 0],
    4: [0, 0, 0, 0],
    5: [0, 0, 0, 0],
    6: [0, -20, 5, 0],
    7: [-10, -40, 15, 10],
    8: [-15, -50, 15, 15],
    9: [-5, -50, 0, 0],
    10: [-10, -70, 10, 5],
    11: [-15, -90, 20, 15],
    12: [-15, -110, 30, 15],
    13: [-10, -70, 0, 5],
    14: [-15, -90, 10, 10],
    15: [-25, -120, 20, 20],
    16: [-25, -130, 20, 20],
    17: [-15, -90, 0, 10],
    18: [-20, -110, 10, 20],
    19: [-35, -150, 30, 30],
    20: [-45, -165, 40, 40]
};

export const ARMOR_SKILL_GROUP = Object.freeze({
    NONE: "none",
    SOFT_LEATHER: "soft_leather",
    RIGID_LEATHER: "rigid_leather",
    CHAIN: "chain",
    PLATE: "plate"
});

/**
 * @param {number|string} armorType
 * @returns {{ at: number, minMod: number, maxMod: number, missilePenalty: number, quicknessPenalty: number }|null}
 *   null for an armor type that isn't in the table
 */
export function getArmorTableRow(armorType) {
    const at = Math.trunc(Number(armorType));
    const row = ARMOR_TABLE[at];
    if (!row) return null;
    const [minMod, maxMod, missilePenalty, quicknessPenalty] = row;
    return { at, minMod, maxMod, missilePenalty, quicknessPenalty };
}

/** Which armor skill covers an armor type. */
export function getArmorSkillGroup(armorType) {
    const at = Math.trunc(Number(armorType));
    if (!(at >= 5 && at <= 20)) return ARMOR_SKILL_GROUP.NONE;
    if (at <= 8) return ARMOR_SKILL_GROUP.SOFT_LEATHER;
    if (at <= 12) return ARMOR_SKILL_GROUP.RIGID_LEATHER;
    if (at <= 16) return ARMOR_SKILL_GROUP.CHAIN;
    return ARMOR_SKILL_GROUP.PLATE;
}

/**
 * An armor's own minimum or maximum maneuver modification, as typed on the armor item. Empty means "use the
 * table's". A penalty is always zero or negative, so 5 and -5 both mean a penalty of 5.
 * @param {*} value
 * @returns {number|undefined} undefined when nothing was set
 */
export function parseManeuverModOverride(value) {
    if (value === null || value === undefined || value === "") return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return n === 0 ? 0 : -Math.abs(n);
}

/**
 * The minimum and maximum maneuver modification of an armor type, with the armor's own values on top.
 * The minimum is the smaller penalty, so it is never allowed to be worse than the maximum.
 * @param {number|string} armorType
 * @param {{ minMod?: *, maxMod?: * }} [overrides] raw values from the armor item
 * @returns {{ minMod: number, maxMod: number }|null} null for an armor type that isn't in the table
 */
export function resolveManeuverMods(armorType, overrides = {}) {
    const row = getArmorTableRow(armorType);
    if (!row) return null;
    const maxMod = parseManeuverModOverride(overrides?.maxMod) ?? row.maxMod;
    const minMod = Math.max(parseManeuverModOverride(overrides?.minMod) ?? row.minMod, maxMod);
    return { minMod, maxMod };
}

/**
 * An armor's own missile attack penalty or armor Quickness penalty, as typed on the armor item. Empty means
 * "use the table's". The table prints them as positive amounts to take off, so the sign typed is ignored.
 * @param {*} value
 * @returns {number|undefined} undefined when nothing was set
 */
export function parsePenaltyAmountOverride(value) {
    if (value === null || value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? Math.abs(n) : undefined;
}

/**
 * Every penalty an armor type carries (Armor Table T-3.3), with the armor's own values on top: the minimum and
 * maximum moving maneuver modification, the missile attack penalty and the armor Quickness penalty.
 * @param {number|string} armorType
 * @param {{ minMod?: *, maxMod?: *, missilePenalty?: *, quicknessPenalty?: * }} [overrides] raw values from the armor item
 * @returns {{ minMod: number, maxMod: number, missilePenalty: number, quicknessPenalty: number }|null}
 */
export function resolveArmorPenalties(armorType, overrides = {}) {
    const row = getArmorTableRow(armorType);
    if (!row) return null;
    const { minMod, maxMod } = resolveManeuverMods(armorType, overrides);
    return {
        minMod,
        maxMod,
        missilePenalty: parsePenaltyAmountOverride(overrides?.missilePenalty) ?? row.missilePenalty,
        quicknessPenalty: parsePenaltyAmountOverride(overrides?.quicknessPenalty) ?? row.quicknessPenalty
    };
}

/**
 * The moving maneuver penalty for an armor type and the wearer's bonus in the armor's skill.
 * @param {number|string} armorType
 * @param {number} [armorSkillBonus=0] total bonus of the armor skill (category and stat bonuses included)
 * @param {{ minMod?: *, maxMod?: * }} [overrides] the armor item's own minimum / maximum, when it has them
 * @returns {number} zero or negative
 */
export function computeMovingManeuverPenalty(armorType, armorSkillBonus = 0, overrides = {}) {
    const mods = resolveManeuverMods(armorType, overrides);
    if (!mods) return 0;
    const bonus = Number(armorSkillBonus) || 0;
    // Math.min(-0, ...) would give -0: normalise so a clean "no penalty" is 0
    return Math.min(mods.minMod, mods.maxMod + bonus) || 0;
}
