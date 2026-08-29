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
     * Handle a click on a skill category's "new rank" button: buy the next
     * rank for this level-up session, if development points allow and the
     * category's development cost still has an unbought tier (max 3 ranks
     * per level). Resolves the category's own progression formula
     * (standard/limited/special/combined) from config; categories set to
     * "none" get no self bonus but still track new_ranks/spend points.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill category item clicked.
     * @returns {Promise<"bought"|false>}
     */
    static async handleSkillCategoryRankClick(actor, item) {
        const progressionValue = this._resolveOwnProgression(item.system.progression);
        const current = Number(item.system.new_ranks?.value || 0);
        const costString = RankCalculator.getEffectiveDevelopmentCost(actor, item);
        const available = Math.min(3, String(costString).split("/").length);

        if (current >= available) return false;

        const next = current + 1;
        const pay = await RankCalculator.payDevelopmentCost(actor, item, next);
        if (pay === false) return false;

        await item.update({ "system.new_ranks.value": next });
        if (progressionValue) {
            await RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
        }
        return "bought";
    }

    /**
     * Handle a right-click on a skill category's "new rank" button: undo the
     * last rank bought this level-up session (one step), refunding its cost.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill category item.
     * @returns {Promise<boolean>} true if a rank was undone.
     */
    static async handleSkillCategoryRankUndo(actor, item) {
        const current = Number(item.system.new_ranks?.value || 0);
        if (current <= 0) return false;

        const progressionValue = this._resolveOwnProgression(item.system.progression);
        const costString = RankCalculator.getEffectiveDevelopmentCost(actor, item);
        const devCostArr = String(costString).split("/").map(Number);
        const refund = devCostArr[current - 1] || 0;

        await actor.update({ "system.levelUp.developmentPoints": actor.system.levelUp.developmentPoints + refund });
        await item.update({ "system.new_ranks.value": current - 1 });
        if (progressionValue) {
            await RankCalculator.applyRanksAndBonus(item, -1, progressionValue);
        }
        return true;
    }
}