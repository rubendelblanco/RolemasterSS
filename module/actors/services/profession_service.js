// module/actors/services/profession_service.js

/**
 * Apply profession to actor: add profession item and create skill categories with costs.
 */
export default class ProfessionService {
    /**
     * Apply profession to actor. Creates all skill categories from config with costs from profession.
     * @param {Actor} actor - Target actor
     * @param {Object} professionData - Profession item data (from drop)
     * @returns {Promise<void>}
     */
    static async applyProfession(actor, professionData) {
        const costs = professionData.system?.skillCategoryCosts ?? {};
        const professionBonuses = professionData.system?.professionBonuses ?? [];
        const categoryBonuses = Object.fromEntries(
            professionBonuses
                .filter(b => b.type === "category")
                .map(b => [b.slug, Number(b.bonus) || 0])
        );
        const categories = CONFIG.rmss?.skill_categories ?? {};
        const pack = game.packs.get("rmss.skill-categories") ?? game.packs.find(p => p.collection === "rmss.skill-categories");
        if (!pack) {
            ui.notifications.error("Skill Categories compendium not found.");
            return;
        }

        const nameToSlug = Object.fromEntries(
            Object.entries(categories).map(([slug, data]) => [data.name, slug])
        );

        const docs = await pack.getDocuments();
        const toCreate = [];
        for (const doc of docs) {
            const slug = nameToSlug[doc.name];
            if (!slug) continue;
            const cost = costs[slug] ?? "";
            const itemData = doc.toObject();
            delete itemData._id;
            foundry.utils.setProperty(itemData, "system.slug", slug);
            foundry.utils.setProperty(itemData, "system.development_cost", String(cost || "0"));
            foundry.utils.setProperty(itemData, "system.prof_bonus", categoryBonuses[slug] ?? 0);
            toCreate.push(itemData);
        }

        const existing = actor.items.filter(i => i.type === "skill_category");
        const existingBySlug = new Map();
        for (const item of existing) {
            const s = item.system?.slug ?? nameToSlug[item.name];
            if (s) existingBySlug.set(s, item);
        }

        const newItems = [];
        const toUpdate = [];
        for (const itemData of toCreate) {
            const slug = itemData.system.slug;
            const cost = String(costs[slug] || "0");
            const existingItem = existingBySlug.get(slug);
            if (existingItem) {
                const profBonus = categoryBonuses[slug] ?? 0;
                const needsUpdate = existingItem.system.development_cost !== cost
                    || existingItem.system.prof_bonus !== profBonus;
                if (needsUpdate) {
                    toUpdate.push({ item: existingItem, cost, profBonus });
                }
            } else {
                newItems.push(itemData);
            }
        }

        if (newItems.length > 0) {
            await actor.createEmbeddedDocuments("Item", newItems);
        }
        for (const { item, cost, profBonus } of toUpdate) {
            await item.update({
                "system.development_cost": cost,
                "system.prof_bonus": profBonus ?? categoryBonuses[item.system?.slug] ?? 0
            });
        }

        const oldProfession = actor.items.find(i => i.type === "profession");
        if (oldProfession) await oldProfession.delete();

        const profData = foundry.utils.duplicate(professionData);
        delete profData._id;
        delete profData.flags?.core?.sourceId;
        await actor.createEmbeddedDocuments("Item", [profData]);

        await actor.update({ "system.fixed_info.profession": professionData.name });

        const total = newItems.length + toUpdate.length;
        if (total > 0) {
            ui.notifications.info(
                game.i18n.format("rmss.profession.applied_categories", {
                    count: total,
                    name: professionData.name
                })
            );
        }
    }
}
