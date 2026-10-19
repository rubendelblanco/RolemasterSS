/**
 * Resistance rolls of a character: each one has a value worked out from the stat bonuses, a racial modifier, and a total
 * that is the two added together. All ten take the racial modifier, poison and disease included.
 *
 * Pure functions, no Foundry.
 */

/** The ten resistance rolls and how their value comes out of the stat bonuses (stat_bonus of each stat). */
export const RESISTANCE_ROLL_VALUES = [
    { key: "essence", value: (s) => s.empathy.stat_bonus * 3 },
    { key: "channeling", value: (s) => s.intuition.stat_bonus * 3 },
    { key: "mentalism", value: (s) => s.presence.stat_bonus * 3 },
    { key: "fear", value: (s) => s.self_discipline.stat_bonus * 3 },
    { key: "poison", value: (s) => s.constitution.stat_bonus * 3 },
    { key: "disease", value: (s) => s.constitution.stat_bonus * 3 },
    { key: "chann_ess", value: (s) => s.intuition.stat_bonus + s.empathy.stat_bonus },
    { key: "chann_ment", value: (s) => s.intuition.stat_bonus + s.presence.stat_bonus },
    { key: "ess_ment", value: (s) => s.empathy.stat_bonus + s.presence.stat_bonus },
    { key: "arcane", value: (s) => s.empathy.stat_bonus + s.intuition.stat_bonus + s.presence.stat_bonus }
];

/**
 * Sets `value` and `total` of every resistance roll: total = value + racial modifier.
 * @param {object} stats the actor's stats (each with a stat_bonus)
 * @param {object} rolls system.resistance_rolls; updated in place
 * @returns {object} rolls
 */
export function computeResistanceRolls(stats, rolls) {
    for (const { key, value } of RESISTANCE_ROLL_VALUES) {
        const roll = rolls[key];
        if (!roll) continue;
        const val = Number(value(stats));
        roll.value = val;
        roll.total = val + (Number(roll.race_mod) || 0);
    }
    return rolls;
}
