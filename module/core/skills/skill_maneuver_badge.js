import { MANEUVER_TYPE } from "./skill_maneuver_type.js";

/**
 * The small badge a character sheet shows next to a skill so the player sees, at a glance, what armor will cost
 * them: only on a moving maneuver that armor penalizes, a walking figure with the penalty (MMP). Everything else
 * (static maneuvers, attacks, martial arts, a moving maneuver armor doesn't touch) shows nothing.
 */

const ICON_MOVING = "fa-solid fa-person-walking";

/**
 * @param {"moving"|"static"|"none"} maneuverType the skill's maneuver type
 * @param {number} mmp the character's moving maneuver penalty, zero or negative
 * @returns {{ icon: string, penalty: number, tooltipKey: string }|null} null when there is nothing to show;
 *   tooltipKey is a lang key, formatted with { value: penalty }
 */
export function buildSkillManeuverBadge(maneuverType, mmp) {
    if (maneuverType !== MANEUVER_TYPE.MOVING) return null;
    const penalty = Math.min(0, Number(mmp) || 0);
    if (penalty >= 0) return null;
    return { icon: ICON_MOVING, penalty, tooltipKey: "rmss.skill.badge_moving_penalty" };
}
