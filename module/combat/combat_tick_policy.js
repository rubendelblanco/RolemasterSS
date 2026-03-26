/**
 * RM initiative rule for per-turn effect ticks:
 * if the actor's slot has already passed this round, ticks wait until a later round
 * (first eligible tick after their turn in the next round).
 * If it is their turn now or they have not acted yet, ticks apply when their turn ends this round.
 * @param {Combat|null} combat
 * @param {Actor} actor
 * @returns {boolean}
 */
export function shouldDeferTickToNextRound(combat, actor) {
    if (!combat?.turns?.length || combat.turn == null) return false;
    const combatant = combat.combatants.find((c) => c.actor?.id === actor?.id);
    if (!combatant) return false;
    const defIdx = combat.turns.indexOf(combatant.id);
    if (defIdx === -1) return false;
    const cur = combat.turn;
    if (defIdx === cur) return false;
    if (defIdx < cur) return true;
    return false;
}
