import { ARMOR_SKILL_GROUP } from "./armor_maneuver_penalty.js";

/**
 * Which kind of armor a skill covers (soft leather, rigid leather, chain, plate).
 *
 * A skill in an Armor category carries it in system.armor_group, set from its sheet. When a skill is
 * created or renamed and the group is still empty, it is worked out from the skill's name, compared as a
 * slug (no accents, no case, no punctuation) against the names each group is known by. The name is only
 * ever used to fill the field in; the penalty calculation reads the field, so renaming a skill later
 * doesn't break anything.
 */

/** Skill categories that hold armor skills (Appendix A-4.1). */
export const ARMOR_CATEGORY_SLUGS = Object.freeze(["armor-light", "armor-medium", "armor-heavy"]);

/** Armor groups a skill can be set to (everything but "none"). */
export const ARMOR_GROUPS = Object.freeze([
    ARMOR_SKILL_GROUP.SOFT_LEATHER, ARMOR_SKILL_GROUP.RIGID_LEATHER, ARMOR_SKILL_GROUP.CHAIN, ARMOR_SKILL_GROUP.PLATE
]);

/** Same normalisation the system uses for skill slugs: lowercase, no accents, hyphen-separated. */
export function slugify(name) {
    return String(name ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Slugs of the names each armor group goes by, English and Spanish. */
const GROUP_NAME_SLUGS = {
    [ARMOR_SKILL_GROUP.SOFT_LEATHER]: ["soft-leather", "cuero-blando", "cuero-suave"],
    [ARMOR_SKILL_GROUP.RIGID_LEATHER]: ["rigid-leather", "cuero-endurecido", "cuero-rigido", "cuero-duro"],
    [ARMOR_SKILL_GROUP.CHAIN]: ["chain", "chain-mail", "malla", "mallas", "cota-de-malla"],
    [ARMOR_SKILL_GROUP.PLATE]: ["plate", "placa", "placas", "armadura-de-placas"]
};

export function isArmorCategory(categorySlug) {
    return ARMOR_CATEGORY_SLUGS.includes(categorySlug);
}

export function isArmorGroup(value) {
    return ARMOR_GROUPS.includes(value);
}

/** The armor group a skill name stands for, or "" when it matches none. */
export function armorGroupFromName(name) {
    const slug = slugify(name);
    if (!slug) return "";
    for (const [group, slugs] of Object.entries(GROUP_NAME_SLUGS)) {
        if (slugs.includes(slug)) return group;
    }
    return "";
}

/**
 * The group a skill should be given automatically: only for a skill in an Armor category whose group is
 * still empty, and only when its name is one of the known ones. Otherwise "" (leave it alone).
 */
export function computeAutoArmorGroup({ name, categorySlug, currentGroup }) {
    if (!isArmorCategory(categorySlug)) return "";
    if (isArmorGroup(currentGroup)) return "";
    return armorGroupFromName(name);
}

/** The group stored on a skill, or "" when it hasn't got a valid one. */
export function getSkillArmorGroup(skill) {
    const group = skill?.system?.armor_group;
    return isArmorGroup(group) ? group : "";
}
