/**
 * What macros use to put effects on actors (exposed as `game.rmss.effects`). A macro says what the effect is and who gets it;
 * this works out who it can write to itself and who needs a GM client (a player cannot create effects on an actor they do not
 * own: see EffectApplyService).
 */
import { buildConditionalModifierEffect } from "./effect_catalog.js";
import EffectApplyService from "../actors/services/effect_apply_service.js";

/** An Actor, or the token (object or document) of one. */
const toActor = (candidate) => (candidate?.documentName === "Actor" ? candidate : (candidate?.actor ?? null));

/**
 * Puts a conditional modifier effect (see conditional_modifiers.js) on one or more actors.
 *
 * ```js
 * await game.rmss.effects.applyConditionalModifier(targets, {
 *   name: "Prayer of Protection",
 *   modifiers: [
 *     { target: "db", value: 5, versus: ["spell", "elemental"] },
 *     { target: "rr", value: 5, versus: ["spell"] }
 *   ],
 *   seconds: nivel * 60,
 *   replaceKey: `prayer-of-protection:${caster.uuid}`
 * });
 * ```
 * With `replaceKey`, the effect with that key the actors already had is replaced instead of stacking.
 *
 * @param {Actor|Token|Array<Actor|Token>} actors
 * @param {object} options
 * @param {string} options.name what the effect is called
 * @param {{ target: "db"|"ob"|"rr", value: number, versus?: string[] }[]} options.modifiers
 * @param {number} [options.seconds] duration in seconds of game time
 * @param {number} [options.rounds] duration in rounds, counted down in combat (one of the two is needed)
 * @param {string} [options.description]
 * @param {string} [options.img]
 * @param {string} [options.replaceKey]
 * @param {string} [options.origin] uuid of who casts it; by default, the first actor
 * @param {object} [deps] replaceable for tests
 * @param {(payload: object) => Promise<{ applied: string[], failed: string[] }>} [deps.applyAsGM]
 * @param {(actor: Actor) => boolean} [deps.canModify]
 * @returns {Promise<{ applied: string[], failed: string[] }>} actor uuids by outcome
 */
export async function applyConditionalModifier(actors, options = {}, deps = {}) {
    const {
        applyAsGM = (payload) => game.rmss.applyEffectsAsGM(payload),
        canModify = (actor) => actor.canUserModify(game.user, "update")
    } = deps;
    const result = { applied: [], failed: [] };

    const list = (Array.isArray(actors) ? actors : [actors]).map(toActor).filter(Boolean);
    if (!list.length) return result;

    const { replaceKey, origin, ...effect } = options;
    // Built before anything is written, so a mistake in the macro fails with its message and touches nobody
    const effectData = buildConditionalModifierEffect({ ...effect, origin: origin ?? list[0].uuid });

    const own = list.filter((actor) => canModify(actor));
    const others = list.filter((actor) => !canModify(actor));

    for (const actor of own) {
        try {
            await EffectApplyService.applyToActor(actor, effectData, replaceKey);
            result.applied.push(actor.uuid);
        } catch (e) {
            console.error("rmss | applyConditionalModifier", actor.uuid, e);
            result.failed.push(actor.uuid);
        }
    }

    if (others.length) {
        const uuids = others.map((actor) => actor.uuid);
        try {
            const done = await applyAsGM({ actorUuids: uuids, effectData, replaceKey });
            result.applied.push(...(done?.applied ?? []));
            result.failed.push(...(done?.failed ?? uuids.filter((uuid) => !(done?.applied ?? []).includes(uuid))));
        } catch (e) {
            // No GM connected: socketlib refuses
            console.error("rmss | applyConditionalModifier (GM)", e);
            result.failed.push(...uuids);
        }
    }
    return result;
}
