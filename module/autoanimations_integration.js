/**
 * Integration with Automated Animations (autoanimations) module.
 * Calls aa.workflow when RMSS triggers attacks or spell casts.
 */

/**
 * Trigger Automated Animations workflow.
 * @param {Token} sourceToken - Token of the attacker/caster
 * @param {Item} item - Weapon or spell item
 * @param {Token[]} [targets] - Target tokens (optional)
 */
export function triggerAutoAnimations(sourceToken, item, targets = []) {
    if (!game.modules.get("autoanimations")?.active) return;
    if (!sourceToken || !item) return;

    const targetArray = Array.isArray(targets) ? targets : (targets ? [targets] : []);
    Hooks.call("aa.workflow", sourceToken, item, {
        targets: targetArray,
        overrideRepeat: 1  // Play primary animation once, no loop
    });
}

/**
 * Get the first token representing an actor on the canvas.
 * @param {Actor} actor
 * @returns {Token|null}
 */
export function getActorToken(actor) {
    if (!actor || !canvas?.scene) return null;
    const tokens = canvas.tokens.placeables.filter(t => t.document.actorId === actor.id);
    return tokens[0] ?? null;
}
