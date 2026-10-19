/**
 * What losing hit points does to a player character.
 *
 * A player character who reaches 0 hit points or less is not dead, only unconscious. They die once they have lost
 * their hit points plus their temporary Constitution, i.e. when their hit points reach minus their Constitution
 * (50 hits and Constitution 70: unconscious at 0, dead at -70). A single blow can take them from conscious to dead
 * without passing through unconsciousness. NPCs and creatures have no temporary Constitution and keep dying at 0.
 *
 * Pure functions, no Foundry: the effects and chat cards live in hits_state_service.js.
 */

export const HITS_OUTCOME = Object.freeze({ DEAD: "dead", UNCONSCIOUS: "unconscious" });

/**
 * What a change of hit points does to a player character.
 * @param {{ priorHits: number, newHits: number, constitutionTemp: number }} state
 * @returns {"dead"|"unconscious"|null} null when nothing changes (still conscious, still unconscious, already dead)
 */
export function evaluateHitsThreshold({ priorHits, newHits, constitutionTemp } = {}) {
    const prior = Number(priorHits);
    const next = Number(newHits);
    if (!Number.isFinite(prior) || !Number.isFinite(next)) return null;
    const constitution = Math.max(0, Number(constitutionTemp) || 0);
    const deathAt = constitution === 0 ? 0 : -constitution;

    if (next <= deathAt && prior > deathAt) return HITS_OUTCOME.DEAD;
    if (next <= 0 && prior > 0) return HITS_OUTCOME.UNCONSCIOUS;
    return null;
}

/**
 * Does this change bring a character who was at 0 hit points or less back above 0?
 * @param {number} priorHits
 * @param {number|null} newHits null when the update does not touch the hit points
 * @returns {boolean}
 */
export function shouldWakeUp(priorHits, newHits) {
    if (newHits === null || newHits === undefined) return false;
    const prior = Number(priorHits);
    const next = Number(newHits);
    return Number.isFinite(prior) && Number.isFinite(next) && prior <= 0 && next > 0;
}
