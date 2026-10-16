import { slugify } from "../armor/armor_skill_group.js";

/**
 * Skills the rules give a special job to (today only Transcend Armor), and how the system finds them.
 *
 * A name written into the code would be fragile, so the GM picks the skill from the catalog once, in the system
 * settings ("Skills with a rules function"). The setting remembers that catalog skill; a character's copy of it is
 * recognised by where it was copied from (the catalog skill it was dragged from) or, failing that, by its
 * name, compared as a slug against the chosen skill's name. Nothing is looked up by a name the code made up.
 */

export const RULES_SKILLS_SETTING = "rulesSkills";

export const RULES_SKILL = Object.freeze({
    TRANSCEND_ARMOR: "transcend_armor",
    SOFT_LEATHER_ARMOR: "soft_leather_armor",
    RIGID_LEATHER_ARMOR: "rigid_leather_armor"
});

/** One entry per function: lang keys for the menu and the category the skill is expected to be in. */
export const RULES_SKILL_DEFS = Object.freeze({
    [RULES_SKILL.TRANSCEND_ARMOR]: {
        label: "rmss.rules_skills.transcend_armor",
        hint: "rmss.rules_skills.transcend_armor_hint",
        categorySlug: "power-manipulation"
    },
    // Armor - Light holds two skills, so which one covers AT 5-8 and which AT 9-12 has to be said. Chain and plate
    // need no setting: each is the only skill of its category
    [RULES_SKILL.SOFT_LEATHER_ARMOR]: {
        label: "rmss.rules_skills.soft_leather_armor",
        hint: "rmss.rules_skills.soft_leather_armor_hint",
        categorySlug: "armor-light"
    },
    [RULES_SKILL.RIGID_LEATHER_ARMOR]: {
        label: "rmss.rules_skills.rigid_leather_armor",
        hint: "rmss.rules_skills.rigid_leather_armor_hint",
        categorySlug: "armor-light"
    }
});

/** Where a skill was copied from, as a uuid, when Foundry kept track of it. */
function sourceOf(skill) {
    return skill?._stats?.compendiumSource ?? skill?.flags?.core?.sourceId ?? null;
}

/**
 * The actor's copy of the chosen skill. By origin first, then by name. With several, the one with the best bonus.
 * @param {Iterable<Item>} items the actor's items
 * @param {{ uuid?: string, name?: string }|null} entry what the setting remembers about the chosen skill
 * @param {string[]} [alsoNames] other names the chosen skill is known by (e.g. its current name in the catalog)
 * @returns {Item|null}
 */
export function matchRulesSkill(items, entry, alsoNames = []) {
    if (!entry?.uuid && !entry?.name) return null;
    const skills = [...(items ?? [])].filter((i) => i.type === "skill");
    const best = (list) => list.reduce((a, b) => ((Number(b.system?.total_bonus) || 0) > (Number(a?.system?.total_bonus) || 0) ? b : a), null);

    if (entry.uuid) {
        const bySource = skills.filter((s) => sourceOf(s) === entry.uuid);
        if (bySource.length) return best(bySource);
    }
    const slugs = new Set([entry.name, ...alsoNames].map(slugify).filter(Boolean));
    if (!slugs.size) return null;
    const byName = skills.filter((s) => slugs.has(slugify(s.name)));
    return byName.length ? best(byName) : null;
}

/** What the setting remembers for a function, or null when none has been chosen. Safe where there is no game. */
export function getRulesSkillEntry(role) {
    try {
        const all = globalThis.game?.settings?.get("rmss", RULES_SKILLS_SETTING);
        const entry = all?.[role];
        return entry && (entry.uuid || entry.name) ? entry : null;
    } catch {
        return null;
    }
}

/** The actor's skill for a function, or null when none is chosen or the actor hasn't got it. */
export function getActorRulesSkill(actor, role) {
    const entry = getRulesSkillEntry(role);
    if (!entry) return null;
    let liveName = null;
    try {
        liveName = entry.uuid ? globalThis.fromUuidSync?.(entry.uuid)?.name ?? null : null;
    } catch {
        liveName = null;
    }
    return matchRulesSkill(actor?.items, entry, liveName ? [liveName] : []);
}

/** Total bonus of the actor's skill for a function; 0 when there is none. */
export function getActorRulesSkillBonus(actor, role) {
    return Number(getActorRulesSkill(actor, role)?.system?.total_bonus) || 0;
}
