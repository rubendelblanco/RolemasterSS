/**
 * Movement spent in combat. Foundry already measures a token's route with the terrain applied
 * (Regions with "Increase Movement Cost" multiply only the stretches that cross them), so the
 * system just spends that cost from the actor's remaining Movement Rate instead of measuring a
 * straight line between the start and the end of the move.
 *
 * Costs and the remaining rate are both in scene distance units (feet).
 */

/** Moves that are not the token walking: forced displacement, or undoing a move already paid for. */
function isFreeMovement(movement) {
    if (movement?.method === "undo") return true;
    const waypoints = movement?.pending?.waypoints ?? [];
    return waypoints.length > 0 && waypoints.every((w) => w.action === "displace");
}

/**
 * What a pending token movement costs and whether the actor can afford it.
 * Returns null when nothing has to be spent (free move, no cost, or Foundry gave no cost).
 * @param {number} remaining  Movement Rate the actor has left this round
 * @param {object} movement   The `movement` argument of the preMoveToken hook
 * @returns {{cost:number, remaining:number, allowed:boolean, newRemaining:number}|null}
 */
export function evaluateMovement(remaining, movement) {
    if (isFreeMovement(movement)) return null;
    const rawCost = movement?.pending?.cost;
    if (typeof rawCost !== "number" || Number.isNaN(rawCost) || rawCost <= 0) return null;

    const left = Math.round(remaining || 0);
    const cost = Number.isFinite(rawCost) ? Math.round(rawCost) : Infinity;
    const allowed = cost <= left;
    return { cost, remaining: left, allowed, newRemaining: allowed ? left - cost : left };
}
