// module/actors/services/race_service.js
export default class RaceService {
    /**
     * Computes the PP development progression for a realm based on the race's progressions.
     * Pure realms: use the corresponding progression (ess_dev, chan_dev, ment_dev, arcane_dev).
     * Hybrid realms: compare the second number of each progression (e.g. "0*7*6*5*4" -> 7) and pick the higher.
     * @param {Object} raceItem - Race item (or itemData with system.progression)
     * @param {string} realm - essence, channeling, mentalism, arcane, or hybrid (essence/channeling, etc.)
     * @returns {string|null} The progression string or null if none applicable
     */
    static computePPDevelopmentProgression(raceItemOrProgressions, realm) {
        const prog = raceItemOrProgressions?.system?.progression ?? raceItemOrProgressions ?? {};
        const ess = (prog.ess_dev ?? "").trim();
        const chan = (prog.chan_dev ?? "").trim();
        const ment = (prog.ment_dev ?? "").trim();
        const arcane = (prog.arcane_dev ?? "").trim();

        const r = (realm ?? "").toLowerCase().trim();
        if (!r) return null;

        // Pure realms
        if (r === "essence" && ess) return ess;
        if (r === "channeling" && chan) return chan;
        if (r === "mentalism" && ment) return ment;
        if (r === "arcane" && arcane) return arcane;

        // Hybrid realms: compare second number (index 1) of "a*b*c*d*e"
        const secondNum = (s) => {
            const parts = (s || "").split("*");
            const n = parseInt(parts[1], 10);
            return isNaN(n) ? -1 : n;
        };

        const parts = r.split("/").map(p => p.trim()).filter(Boolean);
        if (parts.length !== 2) return null;

        const [p1, p2] = parts.sort();
        let prog1 = "";
        let prog2 = "";

        if (p1 === "channeling" && p2 === "essence") {
            prog1 = chan;
            prog2 = ess;
        } else if (p1 === "channeling" && p2 === "mentalism") {
            prog1 = chan;
            prog2 = ment;
        } else if (p1 === "essence" && p2 === "mentalism") {
            prog1 = ess;
            prog2 = ment;
        } else {
            return null;
        }

        const n1 = secondNum(prog1);
        const n2 = secondNum(prog2);
        if (n1 >= n2 && prog1) return prog1;
        if (prog2) return prog2;
        return prog1 || null;
    }

    /**
     * Update actor with racial info from itemData
     * @param {Actor} actor - The Foundry actor being updated
     * @param {Object} itemData - Race item data
     */
    static async applyRace(actor, itemData) {
        const prog = itemData.system?.progression ?? {};
        const updates = {
            "system.race_stat_fixed_info.body_development_progression": prog.body_dev ?? "",
            "system.race_stat_fixed_info.race_pp_progressions": {
                ess_dev: prog.ess_dev ?? "",
                chan_dev: prog.chan_dev ?? "",
                ment_dev: prog.ment_dev ?? "",
                arcane_dev: prog.arcane_dev ?? ""
            },
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
                itemData.system.rr_mods.chan + itemData.system.rr_mods.ment + itemData.system.rr_mods.chan,
            "system.resistance_rolls.poison.race_mod": itemData.system.rr_mods.poison,
            "system.resistance_rolls.disease.race_mod": itemData.system.rr_mods.disease
        };

        const realm = actor.system?.fixed_info?.realm;
        if (realm) {
            const ppProg = this.computePPDevelopmentProgression(itemData, realm);
            if (ppProg) updates["system.race_stat_fixed_info.pp_development_progression"] = ppProg;
        }

        return actor.update(updates);
    }
}