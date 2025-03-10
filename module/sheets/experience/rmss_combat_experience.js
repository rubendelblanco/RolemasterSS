import ExperiencePointsCalculator from "./rmss_experience_manager.js";

export default class CombatExperience {
    /**
     * Checks if a given actor ID corresponds to a player character (PC) and returns the actor if true.
     *
     * @param {string} attackerId - The ID of the actor to check.
     * @returns {Actor|boolean} - Returns the actor object if it is of type "character", otherwise returns `false`.
     */
    static isAPC(attackerId) {
        const actor = game.actors.get(attackerId);

        if (actor && actor.type === "character") {
            return actor;
        } else {
            return false;
        }
    }

    static calculateCriticalExperience(target, critical) {
        if (!target) return;
        const level = target.system.attributes.level.value;
        return ExperiencePointsCalculator.calculateCriticalExpPoints(critical, level);
    }

}