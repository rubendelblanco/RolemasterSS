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
        // 1. Get the slug from the dropped item
        const categorySlug = itemData.system.categorySlug;
        if (!categorySlug) {
            ui.notifications.warn("La skill no tiene slug de categoría.");
            return;
        }

        // 2. Load the compendium of skill categories
        const pack = game.packs.get("rmss.skill-categories");
        if (!pack) {
            ui.notifications.error("No se encuentra el compendio rmss.skill-categories.");
            return;
        }

        // 3. Find the skill category item in the compendium by slug
        const categories = CONFIG.rmss?.skillCategories ?? [];
        const compendiumCategory = categories.find(c => c.system.slug === categorySlug);

        if (!compendiumCategory) {
            ui.notifications.warn(`Slug not found: ${categorySlug}`);
            return;
        }

        // 4. Find the actor's own category (by the same slug)
        const actorCategory = actor.items.find(i =>
            i.type === "skill_category" && i.system?.slug === categorySlug
        );

        if (!actorCategory) {
            ui.notifications.warn("El actor no tiene la categoría correspondiente.");
            return;
        }

        const alreadyOwned = actor.items.some(
            i => i.type === "skill" && i.name === itemData.name
        );

        if (alreadyOwned) {
            ui.notifications.warn("Skill already acquired.");
            return;
        }

        const skillToCreate = {
            name: itemData.name,
            img: itemData.img,
            type: "skill",
            system: {
                ...foundry.utils.deepClone(itemData.system),
                category: actorCategory.id
            }
        };

        await actor.createEmbeddedDocuments("Item", [skillToCreate]);
    }

    /**
     * Handle a click on a skill's "new rank" button.
     * Advances or resets the skill ranks depending on the clicked value.
     *
     * @param {Actor} actor - The Foundry actor.
     * @param {Item} item - The skill item.
     * @param {Item} category - The skill category item.
     * @param {string} clickedValue - The clicked value ("0","1","2","3").
     */
    // SkillService.handleSkillRankClick(...)
    static async handleSkillRankClick(actor, item, category, clickedValue) {
        if (!actor.system.levelUp.isLevelingUp) return;
        const progressionValue = RankCalculator.getCategoryProgression(category, CONFIG);
        const available = String(item.system.development_cost).split("/").length;
        const current = Number(item.system.new_ranks?.value || 0);

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
                    if (toSubtract) {
                        RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                    }
                    return;
                }

                await item.update({ "system.new_ranks.value": next });
                RankCalculator.applyRanksAndBonus(item, +1, progressionValue);
                return;
            }

            case "3": {
                const toSubtract = Math.min(current, available);
                await item.update({ "system.new_ranks.value": 0 });
                if (toSubtract) {
                    RankCalculator.applyRanksAndBonus(item, -toSubtract, progressionValue);
                }
                return;
            }
        }
    }
}
