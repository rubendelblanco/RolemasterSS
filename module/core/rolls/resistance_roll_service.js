/**
 * Service for Resistance Roll calculations.
 * Used for spells, poisons, diseases, traps, and any effect requiring a resistance roll.
 * 
 * The Resistance Roll (RR) determines if a target can resist an effect.
 * It compares attacker level vs defender level to produce a target number
 * that the defender must roll above to resist.
 */
export default class ResistanceRollService {
    
    /**
     * Calculate the base Resistance Roll value from level difference.
     * 
     * Formula:
     * - Base delta: difference between attacker and defender levels (max 15)
     * - High-level delta: difference for levels above 15 (reduced impact)
     * - RR = 50 + (baseDelta * 3) + (highDelta * 1)
     * - Clamped between 5 and 95
     * 
     * @param {number} attackerLevel - Level of the attacker/source
     * @param {number} defenderLevel - Level of the defender
     * @returns {number} The base Resistance Roll value (between 5 and 95)
     */
    static calculateBaseRR(attackerLevel, defenderLevel) {
        const baseDelta = Math.min(attackerLevel, 15) - Math.min(defenderLevel, 15);
        const highDelta = Math.max(attackerLevel - 15, 0) - Math.max(defenderLevel - 15, 0);

        let rr = 50 + baseDelta * 3 + highDelta * 1;

        return Math.max(5, Math.min(95, rr));
    }

    /**
     * Calculate the final Resistance Roll that a defender must exceed to resist.
     * 
     * @param {number} attackerLevel - Level of the attacker (caster, poison level, trap level, etc.)
     * @param {number} defenderLevel - Level of the defender
     * @param {number} [modifier=0] - Modifier to apply (positive = easier for defender, negative = harder)
     * @returns {number} The final RR value the defender must roll above (minimum 0)
     * 
     * @example
     * // Spell: caster level 10, target level 5, modifier +20 from spell attack table
     * ResistanceRollService.getFinalRR(10, 5, 20); // Base: 65, Final: 45
     * 
     * @example
     * // Poison: level 8 poison, target level 3, no modifier
     * ResistanceRollService.getFinalRR(8, 3, 0); // Base: 65, Final: 65
     * 
     * @example
     * // Disease: level 5 disease, target level 10, weak strain modifier -10
     * ResistanceRollService.getFinalRR(5, 10, -10); // Base: 35, Final: 45
     * 
     * @example
     * // Trap: level 12 poison trap, target level 6
     * ResistanceRollService.getFinalRR(12, 6); // Base: 68, Final: 68
     */
    static getFinalRR(attackerLevel, defenderLevel, modifier = 0) {
        const baseRR = this.calculateBaseRR(attackerLevel, defenderLevel);
        return Math.max(0, baseRR - modifier);
    }
}
