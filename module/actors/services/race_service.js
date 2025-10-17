// module/actors/services/race_service.js
export default class RaceService {
    /**
     * Update actor with racial info from itemData
     * @param {Actor} actor - The Foundry actor being updated
     * @param {Object} itemData - Race item data
     */
    static async applyRace(actor, itemData) {
        const updates = {
            "system.race_stat_fixed_info.body_development_progression": itemData.system.progression.body_dev,
            "system.fixed_info.race": itemData.name,

            // --- Stat racial bonuses ---
            "system.stats.agility.racial_bonus": itemData.system.stat_bonus.ag,
            "system.stats.constitution.racial_bonus": itemData.system.stat_bonus.co,
            "system.stats.empathy.racial_bonus": itemData.system.stat_bonus.em,
            "system.stats.intuition.racial_bonus": itemData.system.stat_bonus.in,
            "system.stats.memory.racial_bonus": itemData.system.stat_bonus.me,
            "system.stats.presence.racial_bonus": itemData.system.stat_bonus.pr,
            "system.stats.quickness.racial_bonus": itemData.system.stat_bonus.qu,
            "system.stats.reasoning.racial_bonus": itemData.system.stat_bonus.re,
            "system.stats.self_discipline.racial_bonus": itemData.system.stat_bonus.sd,
            "system.stats.strength.racial_bonus": itemData.system.stat_bonus.st,

            // --- Resistance Rolls race mods ---
            "system.resistance_rolls.channeling.race_mod": itemData.system.rr_mods.chan,
            "system.resistance_rolls.essence.race_mod": itemData.system.rr_mods.ess,
            "system.resistance_rolls.mentalism.race_mod": itemData.system.rr_mods.ment,
            "system.resistance_rolls.chann_es.race_mod": itemData.system.rr_mods.chan + itemData.system.rr_mods.ess,
            "system.resistance_rolls.ess_ment.race_mod": itemData.system.rr_mods.ess + itemData.system.rr_mods.ment,
            "system.resistance_rolls.arcane.race_mod":
                itemData.system.rr_mods.chan + itemData.system.rr_mods.ment + itemData.system.rr_mods.chan
        };

        return actor.update(updates);
    }
}