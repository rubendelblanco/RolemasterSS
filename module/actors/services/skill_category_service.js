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
}