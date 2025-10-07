// module/actors/services/skill_category_service.js
import RankCalculator from "../../skills/rmss_rank_calculator.js";

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
        const progressionValue = "-15*2*1*0.5*0"; // Standard progression formula

        switch (clickedValue) {
            case "0":
                await item.update({ "system.new_ranks.value": 1 });
                if (await RankCalculator.payDevelopmentCost(actor, item)) return;

                if (item.system.progression.toLowerCase() === "standard") {
                    await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                }
                break;

            case "1":
                await item.update({ "system.new_ranks.value": 2 });
                if (await RankCalculator.payDevelopmentCost(actor, item)) return;

                if (item.system.progression.toLowerCase() === "standard") {
                    await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                }
                break;

            case "2":
                await item.update({ "system.new_ranks.value": 3 });
                if (await RankCalculator.payDevelopmentCost(actor, item)) return;

                if (item.system.progression.toLowerCase() === "standard") {
                    await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                }
                break;

            case "3":
                await item.update({ "system.new_ranks.value": 0 });
                if (await RankCalculator.payDevelopmentCost(actor, item)) return;

                if (item.system.progression.toLowerCase() === "standard") {
                    await RankCalculator.applyRanksAndBonus(item, -3, progressionValue);
                }
                break;
        }
    }
}