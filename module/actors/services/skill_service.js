// module/actors/services/skill_service.js
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
        const originalCategoryId = itemData.system.category;
        const originalCategory = game.items.get(originalCategoryId)
            ?? game.packs.get("rmss.skill-categories-es")?.index.get(originalCategoryId);

        if (!originalCategory) {
            ui.notifications.warn("No se ha podido encontrar la categoría original.");
            return;
        }

        const categoryName = originalCategory.name;
        const actorCategory = actor.items.find(i => i.type === "skill_category" && i.name === categoryName);

        if (!actorCategory) {
            ui.notifications.warn("El actor no tiene la categoría correspondiente.");
            return;
        }

        const ownedSkills = actor.items.filter(i => i.type === "skill");
        const alreadyOwned = ownedSkills.some(i => i.name === itemData.name);

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

        await this.actor.createEmbeddedDocuments("Item", [skillToCreate]);
    }
}