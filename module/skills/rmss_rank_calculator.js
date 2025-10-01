// --- RankCalculator.js ---
// Responsible for handling skill rank costs, increases, and bonus calculations.
// This version separates pure calculations (testable in isolation) from
// side-effect methods that apply updates to Foundry items/actors.

export default class RankCalculator {
    // -----------------------------
    // PURE FUNCTIONS (no Foundry calls)
    // -----------------------------

    /**
     * Check if the development cost is payable given the actor's DPS and skill costs.
     * @param {number} dps - Available development points.
     * @param {number} newRanks - Number of ranks the user is attempting to buy.
     * @param {string} costString - Development cost progression (e.g. "1/3/7").
     * @returns {number|false} - Cost to pay if possible, false if not payable.
     */
    static isPayable(dps, newRanks, costString) {
        const dev_cost = costString.split("/").map(Number);
        const available_ranks = dev_cost.length;

        if (newRanks === 3) {
            // reset new ranks, recover development points
            return dev_cost.reduce((acc, value) => acc - value, 0);
        } else if (available_ranks < newRanks) {
            return false;
        }

        return dev_cost[newRanks] <= dps ? dev_cost[newRanks] : false;
    }

    /**
     * Return the category progression string for a given skill category.
     * @param {Object} categorySkill - The skill category item.
     * @param {Object} config - The CONFIG.rmss object with skill progressions.
     * @returns {string} - The progression string (e.g. "-15*2*1*0.5*0").
     */
    static getCategoryProgression(categorySkill, config) {
        if (categorySkill.system.skill_progression.split("*").length > 1) {
            // special progression (e.g. PP dev or body dev)
            return categorySkill.system.skill_progression;
        }
        return config.rmss.skill_progression[categorySkill.system.skill_progression].progression;
    }

    /**
     * Calculate new total ranks based on designation.
     * @param {number} baseRanks - Current ranks.
     * @param {number} deltaRanks - Ranks to add/remove.
     * @param {string} designation - Type of skill (Occupational, Everyman, Restricted...).
     * @returns {number} - The new total ranks.
     */
    static increaseRanks(baseRanks, deltaRanks, designation) {
        let total = baseRanks + deltaRanks;

        if (designation === "Occupational") {
            total = baseRanks + deltaRanks * 3;
        } else if (designation === "Everyman") {
            total = baseRanks + deltaRanks * 2;
        }

        return Math.max(total, 0); // never below 0
    }

    /**
     * Calculate bonus from total ranks and progression string.
     * @param {number} totalRanks - Total skill ranks.
     * @param {string} progressionString - e.g. "-15*2*1*0.5*0".
     * @param {string} designation - Skill designation (Restricted, Occupational, etc.).
     * @returns {number} - The calculated rank bonus.
     */
    static calculateBonus(totalRanks, progressionString, designation) {
        const [initialBonus, m1, m2, m3, m4] = progressionString
            .split("*")
            .map(num => parseFloat(num.trim()));
        let bonus;

        if (designation === "Restricted") {
            const restricted = Math.floor(totalRanks / 2);

            if (restricted === 0) bonus = initialBonus;
            else if (restricted <= 5) bonus = m1 * restricted;
            else if (restricted <= 10) bonus = 5 * m1 + (restricted - 5) * m2;
            else if (restricted <= 15) bonus = 5 * m1 + 5 * m2 + (restricted - 10) * m3;
            else bonus = 5 * m1 + 5 * m2 + 5 * m3 + (restricted - 15) * m4;
        } else {
            if (totalRanks === 0) bonus = initialBonus;
            else if (totalRanks <= 10) bonus = m1 * totalRanks;
            else if (totalRanks <= 20) bonus = 10 * m1 + (totalRanks - 10) * m2;
            else if (totalRanks <= 30) bonus = 10 * m1 + 10 * m2 + (totalRanks - 20) * m3;
            else bonus = 10 * m1 + 10 * m2 + 10 * m3 + (totalRanks - 30) * m4;
        }

        return bonus;
    }

    // -----------------------------
    // SIDE-EFFECT METHODS (Foundry updates)
    // -----------------------------

    /**
     * Pay development cost if possible, updating the actor's DPS.
     * @param {Actor} actor - The Foundry actor document.
     * @param {Item} item - The skill item being purchased.
     * @returns {boolean} - True if cost paid, false otherwise.
     */
    static async payDevelopmentCost(actor, item) {
        const devCost = this.isPayable(
            actor.system.levelUp.developmentPoints,
            item.system.new_ranks.value,
            item.system.development_cost
        );

        if (!devCost) return false;

        const newDps = actor.system.levelUp.developmentPoints - devCost;
        await actor.update({ "system.levelUp.developmentPoints": newDps });
        return true;
    }

    /**
     * Apply increased ranks and bonus to an item, updating the document.
     * @param {Item} item - The skill item.
     * @param {number} deltaRanks - Change in ranks (positive or negative).
     * @param {string} progressionString - Progression formula.
     * @returns {number} - The calculated bonus.
     */
    static async applyRanksAndBonus(item, deltaRanks, progressionString) {
        const newTotal = this.increaseRanks(
            item.system.ranks,
            deltaRanks,
            item.system.designation
        );
        const bonus = this.calculateBonus(
            newTotal,
            progressionString,
            item.system.designation
        );

        await item.update({
            "system.ranks": newTotal,
            "system.rank_bonus": bonus
        });

        return bonus;
    }
}