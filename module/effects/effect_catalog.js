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

import { normalizeModifiers } from "./conditional_modifiers.js";

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
    parryStance: { units: "rounds", duration: 999 },
    /** Adds numbers to DB, OB or resistance rolls only against some kinds of attack (see conditional_modifiers.js). */
    conditionalModifier: { units: "seconds", img: "icons/svg/aura.svg" }
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
 * @param {"rounds"|"seconds"} [params.units] the unit of the duration, when it is not the definition's
 * @param {string|null} [params.expiry] when Foundry marks the effect expired; null = as soon as its duration runs out (without it,
 *   Foundry's default: at the start of its owner's turn)
 * @param {object} [params.rmss] `flags.rmss`; left out when it has no keys
 * @param {object} [params.coreFlags] `flags.core`
 * @returns {object}
 */
export function buildEffectData(key, { origin, iconsFolder = "", img, name, description, duration, units, expiry, rmss, coreFlags } = {}) {
    const def = EFFECT_DEFINITIONS[key];
    if (!def) throw new Error(`Unknown effect: ${key}`);

    const flags = {};
    if (rmss && Object.keys(rmss).length) flags.rmss = rmss;
    if (coreFlags) flags.core = coreFlags;

    return {
        name: name ?? def.name,
        img: img ?? (def.icon ? `${iconsFolder}${def.icon}` : def.img),
        origin,
        ...(description !== undefined ? { description } : {}),
        disabled: false,
        ...(Object.keys(flags).length ? { flags } : {}),
        duration: { value: duration ?? def.duration, units: units ?? def.units, ...(expiry !== undefined ? { expiry } : {}) }
    };
}

/**
 * The data of an effect that adds conditional modifiers (see conditional_modifiers.js). It lasts a number of seconds of game
 * time or, when it is meant to be used up in combat, a number of rounds: those go down at the end of the owner's turn.
 * @param {object} params
 * @param {string} params.origin uuid of the actor the effect is on
 * @param {string} params.name what the effect is called (usually the spell)
 * @param {{ target: string, value: number, versus?: string[] }[]} params.modifiers
 * @param {number} [params.seconds] duration in seconds of game time
 * @param {number} [params.rounds] duration in rounds, counted down in combat
 * @param {string} [params.description]
 * @param {string} [params.img]
 * @param {object} [params.rmss] other `flags.rmss` to carry (a replace key, for instance)
 * @returns {object}
 */
export function buildConditionalModifierEffect({ origin, name, modifiers, seconds, rounds, description, img, rmss = {} } = {}) {
    if (typeof name !== "string" || !name) throw new Error("A conditional modifier effect needs a name");
    const hasSeconds = Number.isFinite(Number(seconds)) && Number(seconds) > 0;
    const hasRounds = Number.isFinite(Number(rounds)) && Number(rounds) > 0;
    if (hasSeconds === hasRounds) throw new Error("A conditional modifier effect lasts either seconds or rounds, not both or none");
    return buildEffectData("conditionalModifier", {
        origin,
        name,
        img,
        description,
        duration: hasRounds ? Math.floor(Number(rounds)) : Math.floor(Number(seconds)),
        units: hasRounds ? "rounds" : "seconds",
        // It stops counting as soon as its duration runs out, not at the next turn of its owner (a group effect would then
        // last a different time for each of them)
        expiry: null,
        rmss: { ...rmss, modifiers: normalizeModifiers(modifiers), ...(hasRounds ? { [TICKS_PER_ROUND_FLAG]: true } : {}) }
    });
}

/** Flag of an effect whose rounds go down at the end of its owner's turn whatever its name is. */
export const TICKS_PER_ROUND_FLAG = "ticksPerRound";

/**
 * Whether the rounds of an effect go down at the end of its owner's turn in combat: the fixed combat effects by name, and any
 * effect that says so with the ticksPerRound flag.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isRoundTickedEffect(effect) {
    return ROUND_TICKED_EFFECT_NAMES.includes(effect?.name) || effect?.flags?.rmss?.[TICKS_PER_ROUND_FLAG] === true;
}
