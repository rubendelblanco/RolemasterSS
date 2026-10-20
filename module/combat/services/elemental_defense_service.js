/**
 * Extra defense an actor has against elemental spell attacks (bolts and balls) only - not against weapon attacks.
 * It lives on the Active Effects themselves, as a flag, because it is not a bonus to the actor's DB: adding it to
 * total_db would make it count against every attack. The elemental spell services add it where they read the
 * defender's DB.
 */
export const ELEMENTAL_DEFENSE_FLAG = "elementalDefenseBonus";

/**
 * Sum of the elemental defense carried by the actor's active effects (disabled and expired ones do not count).
 * @param {Actor|null|undefined} actor
 * @returns {number}
 */
export function getElementalDefenseBonus(actor) {
    let sum = 0;
    for (const effect of actor?.effects ?? []) {
        if (effect.disabled || effect.isSuppressed) continue;
        sum += Number(effect.flags?.rmss?.[ELEMENTAL_DEFENSE_FLAG]) || 0;
    }
    return sum;
}
