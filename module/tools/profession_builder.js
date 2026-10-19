import { slugify } from "../core/armor/armor_skill_group.js";

/**
 * Builds the `system` data of a profession from its definition (see PROFESSION_DEFINITIONS in profession_txt_parser.js)
 * and the catalog of the world, and reports what it could and could not link.
 *
 * What the definition can carry besides the cost table:
 * - `categoryBonuses`: { categorySlug: bonus }
 * - `skillBonuses`: [{ names: [...], bonus }] a skill by any of its names (the world's skills are in Spanish, the book's in English)
 * - `designations`: [{ names: [...], designation }] "Everyman", "Occupational" or "Restricted"
 * - `basicLists`: [name, ...] the profession's base spell lists, found in the catalog by name
 * - `primeStats`: up to four stat keys, `description`: HTML
 *
 * Names are compared as slugs (no accents, no case, no punctuation). A skill or list that is not in the catalog is not
 * invented: it is left out and reported, so nothing is linked to something that is not there.
 */

/** @param {{ name: string, system?: { slug?: string } }} skill */
function skillSlug(skill) {
    return skill?.system?.slug || slugify(skill?.name);
}

/**
 * The catalog skill that any of the given names stands for, or null.
 * @param {string[]} names
 * @param {Array<{ name: string, system?: { slug?: string } }>} skills
 */
export function findSkillByNames(names, skills) {
    const wanted = new Set((names ?? []).map(slugify).filter(Boolean));
    if (!wanted.size) return null;
    return (skills ?? []).find((s) => wanted.has(slugify(s.name)) || wanted.has(skillSlug(s))) ?? null;
}

/**
 * @param {object} def a profession definition
 * @param {object} costs skillCategoryCosts
 * @param {{ skills?: Array, spellLists?: Array<{ name: string, uuid: string }> }} catalog
 * @returns {{ system: object, report: { skills: Array<{ names: string[], found: string|null }>, lists: Array<{ name: string, found: boolean }> } }}
 */
export function buildProfessionSystem(def, costs, catalog = {}) {
    const skills = catalog.skills ?? [];
    const spellLists = catalog.spellLists ?? [];
    const report = { skills: [], lists: [] };

    const professionBonuses = [];
    for (const [slug, bonus] of Object.entries(def.categoryBonuses ?? {})) {
        professionBonuses.push({ slug, bonus, type: "category" });
    }
    for (const entry of def.skillBonuses ?? []) {
        const skill = findSkillByNames(entry.names, skills);
        report.skills.push({ names: entry.names, found: skill ? skill.name : null, what: `+${entry.bonus}` });
        if (skill) professionBonuses.push({ slug: skillSlug(skill), bonus: entry.bonus, type: "skill" });
    }

    const skillDesignations = [];
    for (const entry of def.designations ?? []) {
        const skill = findSkillByNames(entry.names, skills);
        report.skills.push({ names: entry.names, found: skill ? skill.name : null, what: entry.designation });
        if (skill) skillDesignations.push({ slug: skillSlug(skill), designation: entry.designation });
    }

    const basicSpellLists = [];
    for (const name of def.basicLists ?? []) {
        const list = spellLists.find((l) => slugify(l.name) === slugify(name));
        report.lists.push({ name, found: !!list });
        if (list) basicSpellLists.push({ uuid: list.uuid, name: list.name });
    }

    const stats = [...(def.primeStats ?? [])];
    while (stats.length < 4) stats.push("");

    const system = {
        description: def.description ?? "",
        spellUserType: def.spellUserType ?? "none",
        spellRealm: def.spellRealm ?? "",
        spellRealm2: def.spellRealm2 ?? "",
        primeStats: stats.slice(0, 4),
        skillCategoryCosts: costs,
        professionBonuses,
        skillDesignations,
        basicSpellLists,
        spells: { lists: [] },
        training_packages: []
    };
    return { system, report };
}

/** Plain-text lines for the report (what was linked and what is missing from the catalog). */
export function formatProfessionReport(report) {
    const lines = [];
    for (const s of report.skills) {
        lines.push(s.found
            ? `✔ ${s.what}: ${s.found}`
            : `✘ ${s.what}: no está en el catálogo (probé: ${s.names.join(", ")})`);
    }
    for (const l of report.lists) {
        lines.push(l.found ? `✔ lista: ${l.name}` : `✘ lista: ${l.name} no está en el catálogo`);
    }
    return lines;
}
