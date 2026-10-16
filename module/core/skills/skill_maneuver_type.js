/**
 * Maneuver type of a skill: does armor's moving maneuver penalty (MMP) apply to it?
 *
 * - moving: a moving maneuver (climbing, jumping, swimming...). Armor penalizes it.
 * - static: a static maneuver (perception, lore, influence...). Armor does not matter.
 * - none:   not a maneuver at all (weapon attacks, directed spells, martial arts, development
 *           skills). Armor's missile penalty and the like are handled elsewhere.
 *
 * Every skill category has a default (CONFIG.rmss.skill_category_maneuver_type, taken from the
 * "Classification" line of each category in the RMFRP core rules, Appendix A-4). A skill can
 * override it with system.maneuver_type, for the few that don't follow their category's default.
 * An empty system.maneuver_type means "use the category's".
 */
export const MANEUVER_TYPE = Object.freeze({ MOVING: "moving", STATIC: "static", NONE: "none" });

const VALID = new Set(Object.values(MANEUVER_TYPE));

/** Category default; a category the system doesn't know is treated as static (no armor penalty). */
export function getCategoryManeuverType(categorySlug) {
    const byCategory = globalThis.CONFIG?.rmss?.skill_category_maneuver_type ?? {};
    const type = byCategory[categorySlug];
    return VALID.has(type) ? type : MANEUVER_TYPE.STATIC;
}

/**
 * @param {Item|{ system?: object }} skill
 * @returns {"moving"|"static"|"none"}
 */
export function getSkillManeuverType(skill) {
    const override = skill?.system?.maneuver_type;
    if (VALID.has(override)) return override;
    return getCategoryManeuverType(skill?.system?.categorySlug);
}

/** Does the skill's own setting differ from "follow the category"? */
export function hasManeuverTypeOverride(skill) {
    return VALID.has(skill?.system?.maneuver_type);
}
