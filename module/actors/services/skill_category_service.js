// module/actors/services/skill_category_service.js
import RankCalculator from "../../core/skills/rmss_rank_calculator.js";

export default class SkillCategoryService {
    /**
     * Apply a skill category item to the actor.
     * Ensures it is not duplicated and calculates initial rank bonus.
     */
    static async applySkillCategory(actor, itemData, event, data) {
        const ownedItems = actor.getOwnedItemsByType("skill_category") || [];
        const ownedNames = Object.values(ownedItems);

        // Prevent duplicates
        if (ownedNames.includes(itemData.name)) {
            ui.notifications.warn("Skill category already owned.");
            return;
        }

        // Let Foundry create the item
        await actor.sheet.constructor.prototype._onDropItem.call(actor.sheet, event, data);

        // Handle standard progression
        if (itemData.system.progression?.toLowerCase() === "standard") {
            const item = actor.items.find(i => i.name === itemData.name);
            if (item) {
                RankCalculator.applyRanksAndBonus(item, 0, "-15*2*1*0.5*0");
            }
        }
    }

    /**
     * Handle a click on a skill category's "new rank" button.
     *
     * This method manages rank progression for skill categories using the standard
     * progression value ("-15*2*1*0.5*0"). It updates the new rank value and
     * applies bonuses using the RankCalculator.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill category item clicked.
     * @param {string} clickedValue - The clicked value ("0", "1", "2", "3").
     * @returns {Promise<void>} Resolves when updates are complete.
     */
    static async handleSkillCategoryRankClick(actor, item, clickedValue) {
        const progressionValue = "-15*2*1*0.5*0";
        const current = Number(item.system.new_ranks?.value || 0);
        const available = String(item.system.development_cost).split("/").length;

        switch (clickedValue) {
            case "0":
            case "1":
            case "2": {
                const next = current + 1;

                const pay = await RankCalculator.payDevelopmentCost(actor, item, next);
                if (pay === false) return;

                if (pay === "refunded") {
                    const toSubtract = Math.min(current, available);
                    await item.update({ "system.new_ranks.value": 0 });
                    if (item.system.progression?.toLowerCase?.() === "standard" && toSubtract) {
                        await RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                    }
                    return;
                }

                await item.update({ "system.new_ranks.value": next });
                if (item.system.progression?.toLowerCase?.() === "standard") {
                    await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                }
                return;
            }

            case "3": {
                const toSubtract = Math.min(current, available);
                await item.update({ "system.new_ranks.value": 0 });
                if (item.system.progression?.toLowerCase?.() === "standard" && toSubtract) {
                    await RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                }
                return;
            }
        }
    }
}