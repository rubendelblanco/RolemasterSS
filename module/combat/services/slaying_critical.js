/**
 * Slaying criticals (RMSS: a weapon whose Slaying tags match the creature it hits).
 *
 * - Against a Large or Super Large creature the hit goes straight to that creature's own critical table, on the Slaying
 *   column, in place of the weapon's normal critical table. That is the large-creature flow the target's own Critical
 *   Table setting already selects; the weapon never picks the table.
 * - Against any other creature the weapon's normal critical is resolved as usual and, with the SAME d100, a second
 *   critical is added on the Slaying column of the Large Creature table. The effects of both stack.
 *
 * Pure helpers, no Foundry.
 */

/** Critical table of the extra critical a Slaying weapon adds against a creature that is not Large or Super Large. */
export const SLAYING_EXTRA_TABLE = "large_melee";

/** Slaying column of the large creature critical tables. */
export const SLAYING_EXTRA_COLUMN = "E";

/**
 * Whether the hit needs the second, Slaying critical on top of the normal one: the weapon slays the target and the
 * target is not already on a large creature table (there the single critical is the Slaying one).
 * @param {boolean} slayingMatch the weapon (or ammo) slays this creature
 * @param {string|null|undefined} enemyCriticalTable the target's own Critical Table setting ("la", "sl" or other)
 * @returns {boolean}
 */
export function needsSlayingExtraCritical(slayingMatch, enemyCriticalTable) {
    return slayingMatch === true && !["la", "sl"].includes(enemyCriticalTable);
}

/**
 * Hangs `extra` at the end of the chain of follow-up criticals of `result` (Effect Weapon may already have put one
 * there), so every critical of the hit still gets applied in order.
 * @param {object} result the critical result that opens the chain
 * @param {object} extra the critical result to add at the end
 * @returns {object} `result`
 */
export function appendFollowUp(result, extra) {
    let tail = result;
    while (tail._rmssEffectWeaponFollowUp) tail = tail._rmssEffectWeaponFollowUp;
    tail._rmssEffectWeaponFollowUp = extra;
    return result;
}
