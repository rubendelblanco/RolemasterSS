/**
 * Unified service for maneuver penalties.
 * All maneuvers (skills, spells) use these 4 penalties:
 * - hitsTaken: % PV perdidos
 * - bleeding: Sangrado (hits/rnd)
 * - stunned: Aturdido
 * - penaltyEffect: Penalización heridas (ActiveEffect "Penalty")
 */
import { RMSSWeaponSkillManager } from "../combat/rmss_weapon_skill_manager.js";
import Utils from "../utils.js";

export default class ManeuverPenaltiesService {

    /**
     * Get all 4 maneuver penalties for an actor.
     * @param {Actor} actor
     * @param {Object} [options]
     * @param {string} [options.spellType] - "BE" for Base Elemental (uses -5/-10/-20 instead of -10/-20/-30)
     * @returns {{ hitsTaken: number, bleeding: number, stunned: number, penaltyEffect: number }}
     */
    static getManeuverPenalties(actor, options = {}) {
        if (!actor) {
            return { hitsTaken: 0, bleeding: 0, stunned: 0, penaltyEffect: 0 };
        }

        const hitsTaken = options.spellType === "BE"
            ? this._getBEHitsPenalty(actor)
            : RMSSWeaponSkillManager._getHitsPenalty(actor);

        let bleeding = 0;
        const bleedingEffects = Utils.getEffectByName(actor, "Bleeding");
        bleedingEffects.forEach(e => {
            bleeding += (e.flags?.rmss?.value ?? 0);
        });
        bleeding = -5 * bleeding;

        let stunned = 0;
        const stunEffects = Utils.getEffectByName(actor, "Stunned");
        const isStunned = stunEffects.some(e => (e.duration?.rounds ?? 0) > 0);
        if (isStunned) {
            const sdBonus = actor.type === "character"
                ? (actor.system?.stats?.self_discipline?.stat_bonus ?? 0)
                : 0;
            stunned = -50 + (3 * sdBonus);
        }

        let penaltyEffect = 0;
        const penaltyEffects = Utils.getEffectByName(actor, "Penalty");
        penaltyEffects.forEach((effect) => {
            penaltyEffect += (effect.flags?.rmss?.value ?? 0);
        });

        return { hitsTaken, bleeding, stunned, penaltyEffect };
    }

    /**
     * BE-specific hits penalty: -5 (26-50%), -10 (51-75%), -20 (76%+).
     */
    static _getBEHitsPenalty(actor) {
        const current = parseInt(actor?.system?.attributes?.hits?.current ?? 0) || 0;
        const max = parseInt(actor?.system?.attributes?.hits?.max ?? 1) || 1;
        if (max <= 0) return 0;
        const pctTaken = ((max - current) / max) * 100;
        if (pctTaken >= 76) return -20;
        if (pctTaken >= 51) return -10;
        if (pctTaken >= 26) return -5;
        return 0;
    }

    /**
     * Sum of maneuver penalties for total modifier (penaltyEffect is applied as Math.min(0, penaltyEffect)).
     */
    static getTotalAutoPenalty(penalties) {
        const { hitsTaken, bleeding, stunned, penaltyEffect } = penalties;
        return hitsTaken + bleeding + stunned + Math.min(0, penaltyEffect);
    }
}
