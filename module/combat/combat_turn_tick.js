import { CombatHistoryTracker } from "./combat_history_tracker.js";
import { RMSSEffectApplier } from "./rmss_effect_applier.js";
/** @type {Map<string, { turn: number, round: number, turns: string[] }>} */
const _combatPrev = new Map();

/**
 * @param {ActiveEffect} effect
 * @param {Combat} combat
 */
function shouldSkipEffectTick(effect, combat) {
    const n = Number(effect.flags?.rmss?.tickDeferredUntilRound);
    if (!Number.isFinite(n)) return false;
    return combat.round < n;
}

/**
 * @param {ActiveEffect} effect
 */
function hasLegacyStunDefer(effect) {
    return effect.name === "Stunned" && effect.flags?.rmss?.stunDeferFirstDecrement === true;
}

/**
 * @param {ActiveEffect} effect
 */
async function decreaseRoundsEffect(effect) {
    const duration = effect.duration;
    if (!duration?.rounds) return;
    const remaining = duration.rounds - 1;
    if (remaining <= 0) await effect.delete();
    else await effect.update({ "duration.rounds": remaining });
}

/**
 * @param {Combat} combat
 * @param {string} finishedCombatantId
 */
export async function processCombatantTurnEnd(combat, finishedCombatantId) {
    const combatant = combat.combatants.get(finishedCombatantId);
    const actor = combatant?.actor;
    if (!actor) return;

    // One decrement per name for Stunned/Parry/No parry/Bonus; multiple "Penalty" effects each tick separately.
    const tickedNames = { Stunned: false, "No parry": false, Parry: false, Bonus: false };

    let bleedTotal = 0;
    for (const effect of actor.effects) {
        if (effect.name !== "Bleeding") continue;
        if (shouldSkipEffectTick(effect, combat)) continue;
        bleedTotal += Number(effect.flags?.rmss?.value) || 0;
    }
    if (bleedTotal > 0) {
        const priorHits = Number(actor.system.attributes.hits.current);
        const newHits = priorHits - bleedTotal;
        await actor.update({ "system.attributes.hits.current": newHits });
        const attackerId = CombatHistoryTracker.get().getLastAttacker(actor.id) ?? null;
        if (attackerId && game.combat?.id) {
            CombatHistoryTracker.get().recordDamage(
                attackerId,
                actor.id,
                bleedTotal,
                newHits <= 0 && priorHits > 0
            );
        }
        await RMSSEffectApplier.applyDeathIfBroughtToZero(
            actor,
            priorHits,
            newHits,
            attackerId,
            combatant.token ?? null
        );
        for (const effect of actor.effects) {
            if (effect.name !== "Bleeding") continue;
            if (shouldSkipEffectTick(effect, combat)) continue;
            if (effect.flags?.rmss?.tickDeferredUntilRound != null) {
                await effect.unsetFlag("rmss", "tickDeferredUntilRound");
            }
        }
    }

    for (const effect of [...actor.effects]) {
        const name = effect.name;
        if (name === "Bleeding" || name === "Dead") continue;

        if (tickedNames.hasOwnProperty(name) && tickedNames[name]) continue;

        if (hasLegacyStunDefer(effect)) {
            await effect.unsetFlag("rmss", "stunDeferFirstDecrement");
            if (tickedNames.hasOwnProperty(name)) tickedNames[name] = true;
            continue;
        }

        if (shouldSkipEffectTick(effect, combat)) continue;

        if (name === "Penalty" && effect.flags?.rmss?.temporaryPenalty !== true) continue;

        const roundNames = ["Stunned", "Parry", "No parry", "Bonus", "Penalty"];
        if (!roundNames.includes(name)) continue;

        const hadDefer = effect.flags?.rmss?.tickDeferredUntilRound != null;
        await decreaseRoundsEffect(effect);

        const still = actor.effects.get(effect.id);
        if (still && hadDefer) await still.unsetFlag("rmss", "tickDeferredUntilRound");

        if (Object.prototype.hasOwnProperty.call(tickedNames, name)) tickedNames[name] = true;
    }
}

export function registerCombatTurnTickHooks() {
    Hooks.on("preUpdateCombat", (combat) => {
        _combatPrev.set(combat.id, {
            turn: combat.turn,
            round: combat.round,
            turns: [...(combat.turns ?? [])]
        });
    });

    Hooks.on("updateCombat", async (combat, changed) => {
        if (!game.user.isGM) return;
        if (!("turn" in changed)) return;

        const prev = _combatPrev.get(combat.id);
        if (!prev || prev.turns.length === 0) return;

        const oldTurn = prev.turn;
        if (oldTurn == null || oldTurn < 0) return;

        const finishedId = prev.turns[oldTurn];
        if (!finishedId) return;

        try {
            await processCombatantTurnEnd(combat, finishedId);
        } catch (e) {
            console.error("rmss | combat turn tick", e);
        }
    });
}
