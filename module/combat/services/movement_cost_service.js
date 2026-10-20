/**
 * Movement spent in combat. Foundry already measures a token's route with the terrain applied
 * (Regions with "Increase Movement Cost" multiply only the stretches that cross them), so the
 * system just spends that cost from the actor's remaining Movement Rate instead of measuring a
 * straight line between the start and the end of the move.
 *
 * Costs and the remaining rate are both in scene distance units (feet).
 *
 * Which part of the movement is paid for: Foundry splits a move at its first checkpoint (a Region whose
 * behavior listens to token movement). `passed` is what this operation moves and is already measured with
 * the terrain applied; `pending` is only what is left after that checkpoint, and gets paid by the operation
 * that continues the move. With no checkpoint everything is in `passed` and `pending` is empty (cost 0), so
 * reading `pending` spends nothing on an ordinary move.
 */

/** Moves that are not the token walking: forced displacement, or undoing a move already paid for. */
function isFreeMovement(movement) {
    if (movement?.method === "undo") return true;
    const waypoints = movement?.passed?.waypoints ?? [];
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
    const rawCost = movement?.passed?.cost;
    if (typeof rawCost !== "number" || Number.isNaN(rawCost) || rawCost <= 0) return null;

    const left = Math.round(remaining || 0);
    const cost = Number.isFinite(rawCost) ? Math.round(rawCost) : Infinity;
    const allowed = cost <= left;
    return { cost, remaining: left, allowed, newRemaining: allowed ? left - cost : left };
}

/**
 * How much of its Movement Rate an actor has left, as a fraction (1 = all of it). An actor whose Movement Rate is
 * not set (0, or missing) has nothing to measure against, so it counts as fully active: dividing by zero gave NaN,
 * which blanked the attack modifier in the confirm-attack window and dropped every bonus that was being added to it.
 * @param {number} current  Movement Rate left this round
 * @param {number} max      Movement Rate for the round (weight-penalized when the actor has one)
 * @returns {number}
 */
export function activityRatio(current, max) {
    const cur = Number(current);
    const top = Number(max);
    if (!Number.isFinite(cur) || !Number.isFinite(top) || top <= 0) return 1;
    return cur / top;
}
