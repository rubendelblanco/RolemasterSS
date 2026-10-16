import {
    ARMOR_SKILL_GROUP, getArmorSkillGroup, computeMovingManeuverPenalty
} from "./armor_maneuver_penalty.js";
import { getSkillManeuverType, MANEUVER_TYPE } from "../skills/skill_maneuver_type.js";
import { getSkillArmorGroup, armorGroupFromName, isArmorCategory } from "./armor_skill_group.js";

/**
 * Moving maneuver penalty (MMP) of the armor an actor wears. See armor_maneuver_penalty.js for the rule.
 *
 * Two armor types are in play. The armor item's AT is what protects in combat. Its "penalty AT"
 * (system.at_penalty), when filled in, is the AT the armor *penalizes* as: an armor can protect as AT 9
 * and weigh on the wearer like AT 12. Left empty, both are the same. Only the penalty AT is used here.
 */

/** Category each armor skill lives in (Appendix A-4.1): soft and rigid leather share Armor - Light. */
const ARMOR_SKILL_CATEGORY = {
    [ARMOR_SKILL_GROUP.SOFT_LEATHER]: "armor-light",
    [ARMOR_SKILL_GROUP.RIGID_LEATHER]: "armor-light",
    [ARMOR_SKILL_GROUP.CHAIN]: "armor-medium",
    [ARMOR_SKILL_GROUP.PLATE]: "armor-heavy"
};

/**
 * The AT the actor's armor penalizes as. From the equipped body armor: its penalty AT, or its AT when that
 * is empty. With no body armor equipped, the AT typed on the sheet.
 * @param {Actor} actor
 * @returns {number}
 */
export function getPenaltyArmorType(actor) {
    return getPenaltyArmor(actor).armorType;
}

/**
 * The armor the actor's penalty comes from: its penalty AT and, when the equipped body armor has its own
 * minimum / maximum maneuver modification (system.maneuver_min / maneuver_max), those, which replace the
 * table's for this armor. An armor can be lighter or heavier on the wearer than the table says.
 * @param {Actor} actor
 * @returns {{ armorType: number, overrides: { minMod: *, maxMod: * } }}
 */
export function getPenaltyArmor(actor) {
    const body = [...(actor?.items ?? [])].find((i) => {
        if (i.type !== "armor" || !i.system?.equipped) return false;
        return (i.system.armorSlot || (i.system.isShield ? "shield" : "body")) === "body";
    });
    if (!body) {
        return { armorType: Math.trunc(Number(actor?.system?.armor_info?.armor_type)) || 1, overrides: {} };
    }
    const penaltyAt = Math.trunc(Number(body.system.at_penalty));
    const armorType = penaltyAt >= 1 ? penaltyAt : (Math.trunc(Number(body.system.at)) || 1);
    return { armorType, overrides: { minMod: body.system.maneuver_min, maxMod: body.system.maneuver_max } };
}

/**
 * The actor's skill for an armor group, or null if it hasn't got one. In order: a skill marked with that
 * group; an unmarked Armor-category skill whose name is one of the known ones; and, for Chain and Plate,
 * the only skill of their category (Armor - Medium has just Chain, Armor - Heavy just Plate).
 * @param {Actor} actor
 * @param {string} group one of ARMOR_SKILL_GROUP
 * @returns {Item|null}
 */
export function findArmorSkill(actor, group) {
    const categorySlug = ARMOR_SKILL_CATEGORY[group];
    if (!categorySlug) return null;
    const skills = [...(actor?.items ?? [])].filter((i) => i.type === "skill");

    const marked = skills.find((s) => getSkillArmorGroup(s) === group);
    if (marked) return marked;

    const byName = skills.find((s) => !getSkillArmorGroup(s)
        && isArmorCategory(s.system?.categorySlug) && armorGroupFromName(s.name) === group);
    if (byName) return byName;

    if (group === ARMOR_SKILL_GROUP.SOFT_LEATHER || group === ARMOR_SKILL_GROUP.RIGID_LEATHER) return null;
    const inCategory = skills.filter((s) => s.system?.categorySlug === categorySlug && !getSkillArmorGroup(s));
    return inCategory.length === 1 ? inCategory[0] : null;
}

/**
 * @param {Actor} actor
 * @returns {{ armorType: number, group: string, skill: Item|null, skillBonus: number, mmp: number }}
 *   skillBonus is 0 when the actor has no skill in the armor it wears (it is as untrained)
 */
export function getMovingManeuverPenalty(actor) {
    const { armorType, overrides } = getPenaltyArmor(actor);
    const group = getArmorSkillGroup(armorType);
    // No armor skill covers AT 1-4, but an armor of that AT can still carry a penalty of its own
    if (group === ARMOR_SKILL_GROUP.NONE) {
        return { armorType, group, skill: null, skillBonus: 0, mmp: computeMovingManeuverPenalty(armorType, 0, overrides) };
    }
    const skill = findArmorSkill(actor, group);
    const skillBonus = Number(skill?.system?.total_bonus) || 0;
    return { armorType, group, skill, skillBonus, mmp: computeMovingManeuverPenalty(armorType, skillBonus, overrides) };
}

/**
 * What armor takes off a roll of this skill: the character's MMP when the skill is a moving maneuver,
 * zero otherwise. Only characters are affected - NPCs and creatures are ignored on purpose.
 * @param {Actor} actor
 * @param {Item} skill
 * @returns {number} zero or negative
 */
export function getArmorPenaltyForSkill(actor, skill) {
    if (actor?.type !== "character") return 0;
    if (getSkillManeuverType(skill) !== MANEUVER_TYPE.MOVING) return 0;
    return getMovingManeuverPenalty(actor).mmp;
}
