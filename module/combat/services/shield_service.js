import FacingService from "./facing_service.js";

/**
 * House rule: a shield's DB bonus only protects against frontal attacks (from the flank or the
 * back it is as if it were not there). The bonus lives inside armor_info.total_db, so a
 * non-frontal attack just takes it back out.
 */
export default class ShieldService {

    /** @param {Actor} actor @returns {number} the shield's DB bonus already included in total_db */
    static getShieldBonus(actor) {
        const bonus = Number(actor?.system?.armor_info?.shield_bonus);
        return Number.isFinite(bonus) && bonus > 0 ? bonus : 0;
    }

    /** @param {string|null} facingValue @returns {boolean} true for a frontal attack */
    static isFrontal(facingValue) {
        return (facingValue ?? FacingService.FACING.FRONT) === FacingService.FACING.FRONT;
    }

    /**
     * Total DB against an attack coming from the given facing.
     * @param {Actor} actor
     * @param {string|null} facingValue - "" front, "15" flank, "25" rear flank, "35" rear
     * @returns {number}
     */
    static getDefenseDb(actor, facingValue) {
        const total = Number(actor?.system?.armor_info?.total_db) || 0;
        const shield = ShieldService.isFrontal(facingValue) ? 0 : ShieldService.getShieldBonus(actor);
        return Math.max(0, total - shield);
    }
}
