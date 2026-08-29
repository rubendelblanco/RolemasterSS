import RankCalculator from "../../core/skills/rmss_rank_calculator.js";

/**
 * Service to handle skill-related operations on actors and sheets.
 */
export default class SkillService {
    /**
     * Create a new skill for the given actor, based on the provided itemData.
     *
     * Steps performed:
     * 1. Verify the original skill category exists (from world items or compendium).
     * 2. Check if the actor already has the required category; if not, warn and exit.
     * 3. Prevent duplicates by ensuring the actor does not already own the skill.
     * 4. Build the skill data object and create it as an embedded Item in the actor.
     *
     * @param {Actor} actor - The Foundry VTT actor who will receive the new skill.
     * @param {Object} itemData - The raw data of the skill item being added.
     * @returns {Promise<void>} Resolves once the skill is created or exits early if validation fails.
     */
    static async createSkill(actor, itemData) {
        // CASE 0 — CREATURES: ignore everything
        if (actor.type === "creature") {
            console.log("Skipping skill creation: creature actors do not use skills.");
            return;
        }

        // CASE 1 — NPC: no category check
        const isNPC = actor.type === "npc";

        // CASE 2 — PC: must check category
        const isPC = actor.type === "character";

        // Extract slug
        const categorySlug = itemData.system.categorySlug;
        if (!categorySlug) {
            ui.notifications.warn("The skill has no category slug.");
            return;
        }

        // Load categories from CONFIG
        const categories = CONFIG.rmss?.skillCategories ?? [];

        // Find matching category in compendium
        const compendiumCategory = categories.find(c => c.system.slug === categorySlug);

        if (!compendiumCategory) {
            ui.notifications.warn(`Skill category slug not found in compendium: ${categorySlug}`);
            return;
        }

        // If PC → must check for actor-owned category
        let actorCategory = null;

        if (isPC) {
            actorCategory = actor.items.find(i =>
                i.type === "skill_category" && i.system.slug === categorySlug
            );

            if (!actorCategory) {
                ui.notifications.warn("This PC does not own the required skill category.");
                return;
            }
        }

        // Prevent duplicate skills
        const alreadyOwned = actor.items.some(
            i => i.type === "skill" && i.name === itemData.name
        );

        if (alreadyOwned) {
            ui.notifications.warn("Skill already acquired.");
            return;
        }

        // Build new skill
        const skillToCreate = {
            name: itemData.name,
            img: itemData.img,
            type: "skill",
            system: {
                ...foundry.utils.deepClone(itemData.system),
                // PC: use actor category ID
                // NPC: store slug directly (no category item)
                category: isPC ? actorCategory.id : null,
                categorySlug: categorySlug
            }
        };

        // Create
        await actor.createEmbeddedDocuments("Item", [skillToCreate]);
    }


    /**
     * Handle a click on a skill's "new rank" button: buy the next rank for
     * this level-up session, if development points allow and the skill's
     * development cost still has an unbought tier (max 3 ranks per level).
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill item.
     * @param {Item} category - The skill category item.
     * @returns {Promise<"bought"|false>}
     */
    static async handleSkillRankClick(actor, item, category) {
        if (!actor.system.levelUp.isLevelingUp) return false;
        const progressionValue = RankCalculator.getCategoryProgression(category, CONFIG);
        const costString = RankCalculator.getEffectiveDevelopmentCost(actor, item);
        const available = Math.min(3, String(costString).split("/").length);
        const current = Number(item.system.new_ranks?.value || 0);

        if (current >= available) return false;

        const next = current + 1;
        const pay = await RankCalculator.payDevelopmentCost(actor, item, next);
        if (pay === false) return false;

        await item.update({ "system.new_ranks.value": next });
        RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
        return "bought";
    }

    /**
     * Handle a right-click on a skill's "new rank" button: undo the last
     * rank bought this level-up session (one step), refunding its cost.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill item.
     * @param {Item} category - The skill category item.
     * @returns {Promise<boolean>} true if a rank was undone.
     */
    static async handleSkillRankUndo(actor, item, category) {
        if (!actor.system.levelUp.isLevelingUp) return false;
        const current = Number(item.system.new_ranks?.value || 0);
        if (current <= 0) return false;

        const progressionValue = RankCalculator.getCategoryProgression(category, CONFIG);
        const costString = RankCalculator.getEffectiveDevelopmentCost(actor, item);
        const devCostArr = String(costString).split("/").map(Number);
        const refund = devCostArr[current - 1] || 0;

        await actor.update({ "system.levelUp.developmentPoints": actor.system.levelUp.developmentPoints + refund });
        await item.update({ "system.new_ranks.value": current - 1 });
        await RankCalculator.applyRanksAndBonus(item, -1, progressionValue);
        return true;
    }
}
