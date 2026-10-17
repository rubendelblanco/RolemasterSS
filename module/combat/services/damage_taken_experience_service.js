/**
 * Experience for the hit points a player character loses in combat: 1 XP per hit point taken.
 *
 * Every way of losing hit points (a weapon or spell hit, a critical, a trap, bleeding) ends in the same write,
 * a lower `system.attributes.hits.current`, so it is picked up from there rather than at each of those places.
 */

/** The hit points an update would leave the actor with, or null when it does not touch them. */
export function hitsAfterUpdate(changes) {
    const flat = changes?.["system.attributes.hits.current"];
    const value = flat !== undefined ? flat : changes?.system?.attributes?.hits?.current;
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

/**
 * How many hit points an update takes off the actor. Zero when it leaves them as they were or raises them
 * (healing, resting), and when the figures are not usable.
 * @param {number} currentHits hit points before the update
 * @param {object} changes the update's changes (expanded or with dotted keys)
 * @returns {number} a whole number, zero or more
 */
export function damageTaken(currentHits, changes) {
    const next = hitsAfterUpdate(changes);
    const current = Number(currentHits);
    if (next === null || !Number.isFinite(current)) return 0;
    return Math.max(0, Math.round(current - next));
}
