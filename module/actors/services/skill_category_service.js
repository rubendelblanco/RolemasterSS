// module/actors/services/skill_category_service.js
import RankCalculator from "../../core/skills/rmss_rank_calculator.js";
import * as CONFIG from "../../config.js";

export default class SkillCategoryService {
    /**
     * Resolve the progression formula for a skill category's own rank bonus
     * (e.g. "standard", "limited", "special", "combined"). Returns undefined
     * for "none"/unrecognized values, meaning the category has no self bonus.
     */
    static _resolveOwnProgression(progressionData) {
        const key = (progressionData || "").toLowerCase();
        const entry = Object.values(CONFIG.rmss.skill_category_progression)
            .find(e => e.data === key);
        return entry?.progression;
    }

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

        // Let Foundry create the item - call the parent class method to avoid infinite loop
        await ActorSheet.prototype._onDropItem.call(actor.sheet, event, data);

        // Calculate initial bonus based on initial ranks, for any progression that grants a self bonus
        const progression = this._resolveOwnProgression(itemData.system.progression);
        if (progression) {
            const item = actor.items.find(i => i.name === itemData.name);
            if (item) {
                const initialRanks = Number(item.system.ranks) || 0;
                await RankCalculator.applyAbsoluteRanksAndBonus(item, initialRanks, progression);
            }
        }
    }

    /**
     * Handle a click on a skill category's "new rank" button.
     *
     * This method manages rank progression for skill categories, resolving the
     * category's own progression formula (standard/limited/special/combined) from
     * config. Categories set to "none" get no self bonus. Updates the new rank
     * value and applies bonuses using the RankCalculator.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill category item clicked.
     * @param {string} clickedValue - The clicked value ("0", "1", "2", "3").
     * @returns {Promise<void>} Resolves when updates are complete.
     */
    static async handleSkillCategoryRankClick(actor, item, clickedValue) {
        const progressionValue = this._resolveOwnProgression(item.system.progression);
        const current = Number(item.system.new_ranks?.value || 0);
        const costString = RankCalculator.getEffectiveDevelopmentCost(actor, item);
        const available = String(costString).split("/").length;

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
                    if (progressionValue && toSubtract) {
                        await RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                    }
                    return;
                }

                await item.update({ "system.new_ranks.value": next });
                if (progressionValue) {
                    await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                }
                return;
            }

            case "3": {
                const toSubtract = Math.min(current, available);
                await item.update({ "system.new_ranks.value": 0 });
                if (progressionValue && toSubtract) {
                    await RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                }
                return;
            }
        }
    }
}