import ExperiencePointsCalculator from "./rmss_experience_manager.js";

export default class CombatExperience {

    static calculateCriticalExperience(target, critical) {
        if (!target) return;
        const level = target.system.attributes.level.value;
        return ExperiencePointsCalculator.calculateCriticalExpPoints(critical, level);
    }

}