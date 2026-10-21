/**
 * Catalog of the ActiveEffects the system creates by itself: the combat ones (Stunned, Bleeding, Penalty, Parry, No parry,
 * Bonus, Dying, Dead) and the state ones (Unconscious, the parry stance, the fasting Penalty). Each one is defined here once:
 * its name, icon and kind of duration. The rest of the code asks for the data of an effect with {@link buildEffectData}
 * instead of writing the object where it is needed, so what an effect looks like lives in one place.
 *
 * Names and keys are in English, like the effects themselves. Effects are still found by their name in the rest of the code
 * (`effect.name === "Stunned"`), so the names here are the ones that code looks for.
 *
 * Pure functions, no Foundry: anything that depends on the world (the icons folder, the actor) comes in as a parameter.
 */

/** Names of the effects, as the code that looks them up by name expects them. */
export const EFFECT_NAMES = Object.freeze({
    STUNNED: "Stunned",
    BLEEDING: "Bleeding",
    PENALTY: "Penalty",
    PARRY: "Parry",
    NO_PARRY: "No parry",
    BONUS: "Bonus",
    DYING: "Dying",
    DEAD: "Dead",
    UNCONSCIOUS: "Unconscious"
});

/**
 * The effects whose rounds go down by one when their owner finishes a turn in combat (see combat_turn_tick.js).
 * Bleeding, Dying, Dead and the rest are handled by their own rules there.
 */
export const ROUND_TICKED_EFFECT_NAMES = Object.freeze([
    EFFECT_NAMES.STUNNED,
    EFFECT_NAMES.PARRY,
    EFFECT_NAMES.NO_PARRY,
    EFFECT_NAMES.BONUS,
    EFFECT_NAMES.PENALTY
]);

/** The long duration an effect that does not expire by itself carries so Foundry paints it on the token. */
const LONG_ROUNDS = 99;
const VERY_LONG_SECONDS = 999999;

/**
 * What each effect is. `icon` is a file of the system's icons folder (or, with `absoluteImg`, the whole path), `units` is
 * the unit of its duration and `duration` the value it has when the caller does not give one.
 */
export const EFFECT_DEFINITIONS = Object.freeze({
    stunned: { name: EFFECT_NAMES.STUNNED, icon: "stunned.svg", units: "rounds" },
    bleeding: { name: EFFECT_NAMES.BLEEDING, icon: "bleeding.svg", units: "rounds", duration: LONG_ROUNDS },
    penalty: { name: EFFECT_NAMES.PENALTY, icon: "broken-bone.svg", units: "rounds", duration: LONG_ROUNDS },
    fastingPenalty: { name: EFFECT_NAMES.PENALTY, icon: "fasting.svg", units: "rounds", duration: LONG_ROUNDS },
    parry: { name: EFFECT_NAMES.PARRY, icon: "sword-clash.svg", units: "rounds" },
    noParry: { name: EFFECT_NAMES.NO_PARRY, icon: "shield-disabled.svg", units: "rounds" },
    bonus: { name: EFFECT_NAMES.BONUS, icon: "bonus.svg", units: "rounds" },
    dying: { name: EFFECT_NAMES.DYING, icon: "dead-head.svg", units: "rounds" },
    dead: { name: EFFECT_NAMES.DEAD, units: "seconds", duration: VERY_LONG_SECONDS },
    unconscious: { name: EFFECT_NAMES.UNCONSCIOUS, icon: "knockout.svg", units: "seconds", duration: VERY_LONG_SECONDS },
    parryStance: { units: "rounds", duration: 999 }
});

/**
 * The data to create an effect with `createEmbeddedDocuments("ActiveEffect", [...])`.
 * @param {keyof typeof EFFECT_DEFINITIONS} key which effect
 * @param {object} params
 * @param {string} params.origin uuid of the actor the effect is on
 * @param {string} [params.iconsFolder] system icons folder (with the final slash); the icon file of the effect goes after it
 * @param {string} [params.img] the whole icon path, for the effects whose icon does not live in that folder
 * @param {string} [params.name] the name, for the effects that have no fixed one
 * @param {string} [params.description]
 * @param {number} [params.duration] the duration in the effect's own unit; without it, the definition's
 * @param {object} [params.rmss] `flags.rmss`; left out when it has no keys
 * @param {object} [params.coreFlags] `flags.core`
 * @returns {object}
 */
export function buildEffectData(key, { origin, iconsFolder = "", img, name, description, duration, rmss, coreFlags } = {}) {
    const def = EFFECT_DEFINITIONS[key];
    if (!def) throw new Error(`Unknown effect: ${key}`);

    const flags = {};
    if (rmss && Object.keys(rmss).length) flags.rmss = rmss;
    if (coreFlags) flags.core = coreFlags;

    return {
        name: name ?? def.name,
        img: img ?? (def.icon ? `${iconsFolder}${def.icon}` : undefined),
        origin,
        ...(description !== undefined ? { description } : {}),
        disabled: false,
        ...(Object.keys(flags).length ? { flags } : {}),
        duration: { value: duration ?? def.duration, units: def.units }
    };
}
