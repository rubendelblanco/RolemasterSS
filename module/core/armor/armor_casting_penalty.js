import { parseManeuverModOverride } from "./armor_maneuver_penalty.js";

/**
 * Penalty armor and helmets put on spell casting: the "Armor Status" and "Helmet" rows of the Spell Casting
 * Modifications Table T-4.6 (RMFRP core rules, Section 14.0). The modifier goes on the spell casting static
 * maneuver, so it is zero or negative.
 *
 * Armor: essence is hampered by any armor, channeling only by metal armor (AT 13+), mentalism by none. The AT
 * used is the one the armor *penalizes* as. A helmet hampers all three realms. A shield doesn't count.
 * Equipment weight is not modelled.
 *
 * Realms: arcane is treated as essence. A spell of several realms (e.g. "essence/channeling") takes the realm that
 * hurts the caster most: with armor, essence worse than channeling worse than mentalism; with a helmet, mentalism
 * worse than essence worse than channeling.
 */

export const CASTING_REALM = Object.freeze({ CHANNELING: "channeling", ESSENCE: "essence", MENTALISM: "mentalism" });

/** Worst realm first. */
const ARMOR_REALM_PRIORITY = [CASTING_REALM.ESSENCE, CASTING_REALM.CHANNELING, CASTING_REALM.MENTALISM];
const HELMET_REALM_PRIORITY = [CASTING_REALM.MENTALISM, CASTING_REALM.ESSENCE, CASTING_REALM.CHANNELING];

/** Armor Status rows: armor type -> [channeling, essence, mentalism]. */
const ARMOR_STATUS = {
    1: [0, 0, 0], 2: [0, 0, 0], 3: [0, 0, 0], 4: [0, 0, 0],
    5: [0, -10, 0], 6: [0, -10, 0],
    7: [0, -20, 0], 8: [0, -20, 0],
    9: [0, -25, 0], 10: [0, -25, 0],
    11: [0, -40, 0],
    12: [0, -50, 0],
    13: [-30, -40, 0], 14: [-30, -40, 0],
    15: [-60, -70, 0], 16: [-60, -70, 0],
    17: [-35, -45, 0], 18: [-35, -45, 0],
    19: [-60, -75, 0],
    20: [-75, -90, 0]
};

export const HELMET_KIND = Object.freeze({ LEATHER: "leather", MIXED: "mixed", METAL: "metal" });

/** Helmet rows: kind -> [channeling, essence, mentalism]. */
const HELMET_ROWS = {
    [HELMET_KIND.LEATHER]: [0, -20, -30],
    [HELMET_KIND.MIXED]: [-10, -30, -40],
    [HELMET_KIND.METAL]: [-20, -40, -60]
};

const REALM_INDEX = { [CASTING_REALM.CHANNELING]: 0, [CASTING_REALM.ESSENCE]: 1, [CASTING_REALM.MENTALISM]: 2 };
const OVERRIDE_FIELD = {
    [CASTING_REALM.CHANNELING]: "channeling",
    [CASTING_REALM.ESSENCE]: "essence",
    [CASTING_REALM.MENTALISM]: "mentalism"
};

/** The casting realms a spell list's realm string names ("essence", "essence/channeling", "arcane"...). */
export function parseCastingRealms(realm) {
    const found = new Set();
    for (const part of String(realm ?? "").toLowerCase().split(/[\/,&+\s]+/)) {
        if (part === "arcane" || part === "arcano" || part === "essence" || part === "esencia") found.add(CASTING_REALM.ESSENCE);
        else if (part === "channeling" || part === "canalizacion" || part === "canalización") found.add(CASTING_REALM.CHANNELING);
        else if (part === "mentalism" || part === "mentalismo") found.add(CASTING_REALM.MENTALISM);
    }
    return [...found];
}

/** The realm, among the spell's, that is the worst for the given priority; essence when the spell names none. */
export function pickCastingRealm(realm, priority) {
    const realms = parseCastingRealms(realm);
    if (!realms.length) return CASTING_REALM.ESSENCE;
    return priority.find((r) => realms.includes(r)) ?? realms[0];
}

/** The armor's own penalty for a realm (the item's cast_penalty_<realm>), or undefined when it has none. */
function overrideFor(overrides, realm) {
    return parseManeuverModOverride(overrides?.[OVERRIDE_FIELD[realm]]);
}

/**
 * Casting penalty of the body armor for a spell. Mentalism is never hampered by body armor.
 * @param {number|string} armorType the AT the armor penalizes as
 * @param {string} spellRealm
 * @param {{ channeling?: *, essence?: *, mentalism?: * }} [overrides] the armor item's own values
 * @returns {number} zero or negative
 */
export function computeBodyArmorCastingPenalty(armorType, spellRealm, overrides = {}) {
    const row = ARMOR_STATUS[Math.trunc(Number(armorType))];
    if (!row) return 0;
    const realm = pickCastingRealm(spellRealm, ARMOR_REALM_PRIORITY);
    if (realm === CASTING_REALM.MENTALISM) return 0;
    return (overrideFor(overrides, realm) ?? row[REALM_INDEX[realm]]) || 0;
}

/**
 * Casting penalty of a helmet for a spell.
 * @param {string} kind one of HELMET_KIND; anything else counts as leather
 * @param {string} spellRealm
 * @param {{ channeling?: *, essence?: *, mentalism?: * }} [overrides] the helmet item's own values
 * @returns {number} zero or negative
 */
export function computeHelmetCastingPenalty(kind, spellRealm, overrides = {}) {
    const row = HELMET_ROWS[kind] ?? HELMET_ROWS[HELMET_KIND.LEATHER];
    const realm = pickCastingRealm(spellRealm, HELMET_REALM_PRIORITY);
    return (overrideFor(overrides, realm) ?? row[REALM_INDEX[realm]]) || 0;
}

/**
 * What Transcend Armor takes off the casting penalties: its total bonus is applied once against the sum of what armor
 * and helmet cost, up to cancelling it (to a maximum of +0). A negative bonus never makes it worse.
 * @param {number} penaltyTotal armor + helmet, zero or negative
 * @param {number} skillBonus the character's total bonus in Transcend Armor
 * @returns {number} zero or positive: the amount that comes off the penalty
 */
export function computeTranscendRelief(penaltyTotal, skillBonus) {
    const penalty = Math.min(0, Number(penaltyTotal) || 0);
    if (!penalty) return 0;
    return Math.min(-penalty, Math.max(0, Number(skillBonus) || 0));
}

/** The table's casting penalties of an armor type, for the sheet placeholders: { channeling, essence, mentalism }. */
export function getBodyArmorCastingTableRow(armorType) {
    const row = ARMOR_STATUS[Math.trunc(Number(armorType))] ?? [0, 0, 0];
    return { channeling: row[0], essence: row[1], mentalism: 0 };
}

/** The table's casting penalties of a helmet kind, for the sheet placeholders. */
export function getHelmetCastingTableRow(kind) {
    const row = HELMET_ROWS[kind] ?? HELMET_ROWS[HELMET_KIND.LEATHER];
    return { channeling: row[0], essence: row[1], mentalism: row[2] };
}
