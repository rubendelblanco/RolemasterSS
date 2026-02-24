/**
 * Service for spell-related calculations.
 * Handles Resistance Roll calculations and other spell mechanics.
 */
export default class SpellCalculationService {
    
    /**
     * Accurate Resistance Roll calculation with high-level adjustment.
     * Calculates the target Resistance Roll (RR) value that the target needs to exceed
     * to resist a spell, based on caster and target levels.
     * 
     * Formula:
     * - Base delta: difference between caster and target levels (max 15)
     * - High-level delta: difference for levels above 15
     * - RR = 50 + (baseDelta * 3) + (highDelta * 1)
     * - Clamped between 5 and 95
     * 
     * @param {Object} params - Calculation parameters
     * @param {number} params.casterLevel - The level of the spell caster
     * @param {number} params.targetLevel - The level of the target
     * @returns {number} The Resistance Roll value (between 5 and 95)
     * 
     * @example
     * // Caster level 10, Target level 5
     * const rr = SpellCalculationService.calculateResistanceRoll({
     *   casterLevel: 10,
     *   targetLevel: 5
     * }); // Returns 65 (50 + 5*3)
     */
    static calculateResistanceRoll({ casterLevel, targetLevel }) {
        let baseDelta = Math.min(casterLevel, 15) - Math.min(targetLevel, 15);
        let highDelta = Math.max(casterLevel - 15, 0) - Math.max(targetLevel - 15, 0);

        let rr = 50 + baseDelta * 3 + highDelta * 1;

        rr = Math.max(5, Math.min(95, rr));
        return rr;
    }
}

