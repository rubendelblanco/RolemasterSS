import { ARMOR_SKILL_GROUP } from "./armor_maneuver_penalty.js";

/**
 * Which kind of armor a skill covers (soft leather, rigid leather, chain, plate).
 *
 * Chain and plate need no help: each is the only skill of its category (Armor - Medium, Armor - Heavy). Armor -
 * Light holds two, soft and rigid leather, so the GM says which is which in the system settings ("Skills with a
 * rules function", see rules_skills.js). Until that is done, the skill's name is compared as a slug (no accents,
 * no case, no punctuation) against the names each group is known by.
 */

/** Skill categories that hold armor skills (Appendix A-4.1). */
export const ARMOR_CATEGORY_SLUGS = Object.freeze(["armor-light", "armor-medium", "armor-heavy"]);

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

/** The armor group a skill name stands for, or "" when it matches none. */
export function armorGroupFromName(name) {
    const slug = slugify(name);
    if (!slug) return "";
    for (const [group, slugs] of Object.entries(GROUP_NAME_SLUGS)) {
        if (slugs.includes(slug)) return group;
    }
    return "";
}
