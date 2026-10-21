/**
 * Conditional modifiers: an effect that adds a number to something, only against some kinds of attack.
 *
 *   { target: "db", value: 5, versus: ["spell", "elemental"] }   +5 to the DB of whoever has the effect, against elemental spell attacks
 *   { target: "rr", value: 5, versus: ["spell"] }                +5 to its resistance rolls against spells
 *   { target: "ob", value: 15, versus: ["weapon"] }              +15 to its own attacks with a weapon
 *
 * They live in `flags.rmss.modifiers` of an ActiveEffect. `versus` is a list of tags and the modifier counts when the attack (or
 * the resistance roll) carries ALL of them; an empty or missing list means always. "Or" is written as two modifiers.
 *
 * Tags are in English, like the effects: weapon, melee, missile, spell, elemental, fire, ice, heat, cold, electricity, water,
 * essence, channeling, mentalism, arcane, poison, disease, fear.
 *
 * Pure functions, no Foundry.
 */

/** What a modifier is added to. */
export const MODIFIER_TARGET = Object.freeze({
    /** The DB of whoever has the effect, against an incoming attack. */
    DB: "db",
    /** The offensive bonus of whoever has the effect, on its own attacks. */
    OB: "ob",
    /** The resistance rolls of whoever has the effect. */
    RR: "rr"
});

/** Flag the first version of the elemental defense used (before modifiers had a shape): +N to DB against elemental spells. */
export const LEGACY_ELEMENTAL_DEFENSE_FLAG = "elementalDefenseBonus";

/** Weapon types that attack from a distance: missile weapons and thrown weapons. */
const MISSILE_WEAPON_TYPES = ["mis", "th"];

/** The element of an elemental attack, from the name of its attack table (fire_bolt, ice_ball, lighting_bolt...). */
const ELEMENTS = [
    [/fire|heat/i, ["fire", "heat"]],
    [/ice|cold/i, ["ice", "cold"]],
    [/lighting|lightning|shock/i, ["electricity"]],
    [/water/i, ["water"]]
];

/**
 * Tags of an attack made with a weapon (or a creature's natural attack).
 * @param {{ system?: { type?: string } }|null|undefined} weapon
 * @returns {string[]}
 */
export function weaponAttackTags(weapon) {
    return ["weapon", MISSILE_WEAPON_TYPES.includes(weapon?.system?.type) ? "missile" : "melee"];
}

/**
 * Elements the rules (and the books) name in two ways: a tag written on a spell brings its partner, so a protection against
 * cold covers a spell written as ice and the other way round. (The books tell an ice bolt from a cold bolt, but whatever
 * protects against one protects against the other.)
 */
const ELEMENT_PARTNER = Object.freeze({ ice: "cold", cold: "ice", fire: "heat", heat: "fire" });

/** The realms of magic a spell can belong to. */
const SPELL_REALMS = ["essence", "channeling", "mentalism", "arcane"];

/**
 * A list of tags as it should be stored and compared: trimmed, lower case, no empty ones, no repeats.
 * @param {string[]|string|null|undefined} raw an array, or a comma-separated string
 * @returns {string[]}
 */
export function normalizeTagList(raw) {
    const list = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(",") : []);
    return [...new Set(list.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
}

/**
 * Every tag a spell carries, for the modifiers that name what they are against.
 * - always: spell
 * - the realm(s) it is cast from: essence, channeling, mentalism, arcane (a hybrid list gives both)
 * - bolts and balls (BE, DE, or any spell with an attack table): elemental, and the element the attack table names
 * - the tags written on the spell itself (`system.spell_tags`), for what the other rules cannot know: a force spell of
 *   cold, a charm, an illusion... An element written on a spell brings its partner (ice/cold, fire/heat).
 * @param {{ type?: string, attackTable?: string, realm?: string, authored?: string[]|string }} [spell]
 * @returns {string[]}
 */
export function spellTags({ type, attackTable, realm, authored } = {}) {
    const tags = ["spell"];
    for (const found of String(realm ?? "").toLowerCase().match(/essence|channeling|mentalism|arcane/g) ?? []) {
        if (SPELL_REALMS.includes(found)) tags.push(found);
    }
    const kind = String(type ?? "").toUpperCase();
    if (kind === "BE" || kind === "DE" || attackTable) {
        tags.push("elemental");
        for (const [pattern, elementTags] of ELEMENTS) {
            if (pattern.test(String(attackTable ?? ""))) tags.push(...elementTags);
        }
    }
    for (const tag of normalizeTagList(authored)) {
        tags.push(tag);
        if (ELEMENT_PARTNER[tag]) tags.push(ELEMENT_PARTNER[tag]);
    }
    return [...new Set(tags)];
}

/**
 * The tags of a spell item (see {@link spellTags}).
 * @param {{ system?: { type?: string, attack_table?: string, spell_tags?: string[] } }|null|undefined} spell
 * @param {{ realm?: string }} [options] the realm it is cast from, when it is known
 * @returns {string[]}
 */
export function spellTagsOf(spell, { realm } = {}) {
    return spellTags({
        type: spell?.system?.type,
        attackTable: spell?.system?.attack_table,
        authored: spell?.system?.spell_tags,
        realm
    });
}

/**
 * Tags of an elemental spell attack (bolt or ball), with its element when the attack table says which.
 * @param {string|null|undefined} attackTable e.g. "fire_bolt"
 * @returns {string[]}
 */
export function spellAttackTags(attackTable) {
    return spellTags({ type: "DE", attackTable });
}

/**
 * Tags a resistance roll category carries: what the roll resists.
 * @param {string} key one of the resistance_rolls keys of the actor (essence, chann_ess, poison...)
 * @returns {string[]}
 */
export function resistanceRollTags(key) {
    switch (key) {
        case "essence": return ["spell", "essence"];
        case "channeling": return ["spell", "channeling"];
        case "mentalism": return ["spell", "mentalism"];
        case "chann_ess": return ["spell", "channeling", "essence"];
        case "chann_ment": return ["spell", "channeling", "mentalism"];
        case "ess_ment": return ["spell", "essence", "mentalism"];
        case "arcane": return ["spell", "arcane"];
        case "poison": return ["poison"];
        case "disease": return ["disease"];
        case "fear": return ["fear"];
        default: return [];
    }
}

/**
 * What the active effects of an actor add to a resistance roll: the ones that count for what the category resists (spells
 * of its realm, poison...) and for the spell the roll is against, when its tags are known.
 * @param {Actor|null|undefined} actor
 * @param {{ category?: string|null, tags?: string[] }} [roll]
 * @returns {number}
 */
export function getResistanceModifier(actor, { category = null, tags = [] } = {}) {
    const rollTags = [...new Set([...resistanceRollTags(category), ...(Array.isArray(tags) ? tags : [])])];
    return getConditionalModifier(actor, MODIFIER_TARGET.RR, rollTags);
}

/**
 * Whether a modifier counts for an attack: it must carry every tag of `versus`.
 * @param {string[]|null|undefined} versus
 * @param {string[]} tags
 * @returns {boolean}
 */
export function matchesVersus(versus, tags) {
    if (!Array.isArray(versus) || versus.length === 0) return true;
    return versus.every((tag) => tags.includes(tag));
}

/**
 * The modifiers an effect carries, including the one the first elemental defense wrote under its own flag.
 * @param {ActiveEffect} effect
 * @returns {{ target: string, value: number, versus?: string[] }[]}
 */
export function effectModifiers(effect) {
    const rmss = effect?.flags?.rmss;
    const list = Array.isArray(rmss?.modifiers) ? [...rmss.modifiers] : [];
    const legacy = Number(rmss?.[LEGACY_ELEMENTAL_DEFENSE_FLAG]);
    if (legacy) list.push({ target: MODIFIER_TARGET.DB, value: legacy, versus: ["spell", "elemental"] });
    return list;
}

/**
 * What the active effects of an actor add to `target`, for an attack or roll carrying `tags`. Disabled and expired effects
 * do not count.
 * @param {Actor|null|undefined} actor
 * @param {"db"|"ob"|"rr"} target
 * @param {string[]} [tags]
 * @returns {number}
 */
export function getConditionalModifier(actor, target, tags = []) {
    let sum = 0;
    for (const effect of actor?.effects ?? []) {
        if (effect.disabled || effect.isSuppressed) continue;
        for (const modifier of effectModifiers(effect)) {
            if (modifier?.target !== target) continue;
            if (!matchesVersus(modifier.versus, tags)) continue;
            sum += Number(modifier.value) || 0;
        }
    }
    return sum;
}

/**
 * Checks the modifiers somebody asks an effect for and returns them clean, so a typo fails where it is made and not
 * silently later. Throws on the first problem.
 * @param {object[]} modifiers
 * @returns {{ target: string, value: number, versus: string[] }[]}
 */
export function normalizeModifiers(modifiers) {
    if (!Array.isArray(modifiers) || modifiers.length === 0) throw new Error("An effect needs at least one modifier");
    const targets = Object.values(MODIFIER_TARGET);
    return modifiers.map((modifier, i) => {
        if (!targets.includes(modifier?.target)) {
            throw new Error(`Modifier ${i}: target must be one of ${targets.join(", ")}`);
        }
        const value = Number(modifier.value);
        if (!Number.isFinite(value)) throw new Error(`Modifier ${i}: value must be a number`);
        const versus = modifier.versus ?? [];
        if (!Array.isArray(versus) || versus.some((tag) => typeof tag !== "string" || !tag)) {
            throw new Error(`Modifier ${i}: versus must be a list of tags`);
        }
        return { target: modifier.target, value, versus: [...versus] };
    });
}
