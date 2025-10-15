import { socket } from "../../../rmss.js";

/**
 * Service to handle skill-related operations on items.
 */
export default class ItemService {
    /**
     * Toggle the "favorite" status of a given item.
     *
     * This method inverses the current favorite flag of the provided item.
     * If the item is currently marked as a favorite, it will be unmarked;
     * if it is not marked as favorite, it will be set as favorite.
     *
     * @param {Item} item - The Foundry VTT item document whose favorite state will be toggled.
     * @returns {Promise<void>} Resolves once the item has been successfully updated.
     */
    static async toggleFavorite(item) {
        const isFav = item.system.favorite === true;
        await item.update({"system.favorite": !isFav});
    }

    /**
     * Open a dialog to transfer an item from one actor to another.
     *
     * The dialog lets the user select quantity and target actor.
     * Once confirmed, the item is transferred via the GM socket command.
     *
     * @param {Actor} actor - The source actor.
     * @param {Item} item - The item to transfer.
     * @returns {Promise<void>} Resolves when the dialog is handled.
     */
    static async giveItem(actor, item) {
        const actors = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character" && a.id !== actor.id);

        if (actors.length === 0) {
            ui.notifications.warn("No other characters available to give the item to.");
            return;
        }

        const options = actors.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
        const maxQty = item.system.quantity || 1;

        new Dialog({
            title: `Dar ${item.name}`,
            content: `
        <form>
          <div class="form-group">
            <label>Cantidad:</label>
            <input type="number" name="qty" value="1" min="1" max="${maxQty}" />
          </div>
          <div class="form-group">
            <label>Destino:</label>
            <select name="target">${options}</select>
          </div>
        </form>`,
            buttons: {
                ok: {
                    label: "Dar",
                    callback: async html => {
                        const qty = Number(html.find("[name=qty]").val()) || 0;
                        const targetId = html.find("[name=target]").val();

                        if (!targetId) {
                            ui.notifications.warn("No target selected.");
                            return;
                        }

                        if (qty <= 0) {
                            ui.notifications.warn("Quantity must be greater than zero.");
                            return;
                        }

                        if (qty > maxQty) {
                            ui.notifications.warn(
                                `You don't have that many ${item.name}! You only own ${maxQty}.`
                            );
                            return;
                        }

                        await socket.executeAsGM("doItemTransfer", {
                            sourceActorId: actor.id,
                            sourceItemId: item.id,
                            targetActorId: targetId,
                            qty
                        });
                    }
                },
                cancel: { label: "Cancelar" }
            }
        }).render(true);
    }

    static async splitStack(actor, item) {
        const totalQty = Number(item.system.quantity || 1);
        if (totalQty <= 1) {
            ui.notifications.warn("This item cannot be split (quantity is 1).");
            return;
        }

        const quantity = await Dialog.prompt({
            title: `Dividir pila de ${item.name}`,
            content: `
      <p>¿Cuántos quieres separar de la pila (${totalQty} disponibles)?</p>
      <input type="number" id="split-qty" value="1" min="1" max="${totalQty - 1}" />
    `,
            callback: html => parseInt(html.find("#split-qty").val()) || 0,
            rejectClose: false
        });

        if (!quantity || quantity <= 0 || quantity >= totalQty) return;

        const totalCost   = Number(item.system.cost || 0);
        const totalWeight = Number(item.system.weight || 0);
        const unitCost    = totalQty > 0 ? totalCost / totalQty : 0;
        const unitWeight  = totalQty > 0 ? totalWeight / totalQty : 0;
        const remaining   = totalQty - quantity;

        const baseData = foundry.utils.duplicate(item.toObject());
        delete baseData._id;

        const newItemData1 = foundry.utils.duplicate(baseData);
        newItemData1.system.quantity   = quantity;
        newItemData1.system.unitCost   = unitCost;
        newItemData1.system.unitWeight = unitWeight;
        newItemData1.system.cost       = unitCost * quantity;
        newItemData1.system.weight     = unitWeight * quantity;

        const newItemData2 = foundry.utils.duplicate(baseData);
        newItemData2.system.quantity   = remaining;
        newItemData2.system.unitCost   = unitCost;
        newItemData2.system.unitWeight = unitWeight;
        newItemData2.system.cost       = unitCost * remaining;
        newItemData2.system.weight     = unitWeight * remaining;

        if (item.system.currency_type) {
            newItemData1.system.currency_type = item.system.currency_type;
            newItemData2.system.currency_type = item.system.currency_type;
        }

        await item.delete();
        await actor.createEmbeddedDocuments("Item", [newItemData1, newItemData2]);

        ui.notifications.info(
            `${item.name} dividido: ${quantity} separados, ${remaining} restantes.`
        );
    }

    /**
     * Toggle the "worn" (equipped) state of an item.
     *
     * This method inverts the current worn flag for wearable items such as armor,
     * clothing, or accessories. It updates the item and logs the state change
     * for debugging purposes.
     *
     * @param {Item} item - The Foundry item document to toggle.
     * @returns {Promise<void>} Resolves once the update is complete.
     */
    static async toggleWorn(item) {
        const isWorn = item.system.worn === true;
        console.log(`Before change: ${isWorn}`);
        await item.update({ "system.worn": !isWorn });
        console.log(`After change: ${!isWorn}`);
    }

    // --- Item Preparation ------------------------------------------------------

    /**
     * Prepare and classify all actor items for use in the sheet context.
     * Groups and sorts items by type, attaches spells to their spell lists, etc.
     *
     * @param {Actor} actor - The Foundry VTT actor.
     * @param {Object} context - The sheet context to populate.
     * @returns {Object} The updated context with categorized items.
     */
    static prepareItems(actor, context) {
        const gear = [], playerskill = [], spellskill = [], skillcat = [];
        const languageskill = [], weapons = [], armor = [], herbs = [];
        const spells = [], spellists = [];

        for (let item of context.items) {
            item.actorId = actor.id;

            switch (item.type) {
                case "item": gear.push(item); break;
                case "weapon": weapons.push(item); break;
                case "herb_or_poison": herbs.push(item); break;
                case "skill_category": skillcat.push(item); break;
                case "spell_list": spellists.push(item); break;
                case "skill":
                    this._classifySkill(actor, item, playerskill, spellskill, languageskill);
                    break;
                case "armor": armor.push(item); break;
                case "spell": spells.push(item); break;
            }
        }

        skillcat.sort((a, b) => a.name.localeCompare(b.name));
        playerskill.sort((a, b) => a.name.localeCompare(b.name));

        const spellistsWithContents = this._mapSpellsToLists(spellists, spells);

        return Object.assign(context, {
            gear,
            skillcat,
            playerskill,
            weapons,
            armor,
            herbs,
            spells,
            spellskill,
            spellists: spellistsWithContents,
            languageskill,
            config: CONFIG.rmss
        });
    }

    static _classifySkill(actor, skill, playerskill, spellskill, languageskill) {
        const skillCategoryId = skill.system.category;
        const skillCategory = actor.items.get(skillCategoryId);

        if (!skillCategory) {
            playerskill.push(skill);
            return;
        }

        if (!skillCategory.system.hasOwnProperty("skill_tab")) {
            skillCategory.system.skill_tab = "skills";
        }

        switch (skillCategory.system.skill_tab) {
            case "spells": spellskill.push(skill); break;
            case "languages": languageskill.push(skill); break;
            default: playerskill.push(skill);
        }
    }

    static _mapSpellsToLists(spellists, spells) {
        const spellsByList = {};

        for (const spell of spells) {
            const containerId = spell.flags?.rmss?.containerId;
            if (!containerId) continue;
            if (!spellsByList[containerId]) spellsByList[containerId] = [];
            spellsByList[containerId].push(spell);
        }

        return spellists
            .map(list => {
                const listId = list.id || list._id;
                const contents = (spellsByList[listId] || []).sort(
                    (a, b) => (a.system.level || 0) - (b.system.level || 0)
                );
                return { ...list, contents };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Normalize item data before updating: keeps quantity, unit and total weight/cost consistent.
     *
     * @param {Item} item - The Foundry item being updated.
     * @param {Object} formData - Raw form data from the sheet.
     * @returns {Object} The normalized formData ready for update.
     */
    static normalizeItemFormData(item, formData) {
        // --- Read current values from form ---
        let qty         = Math.max(formData["system.quantity"], 1);
        let unitWeight  = formData["system.unitWeight"];
        let unitCost    = formData["system.unitCost"];
        const totalWeight = unitWeight * qty;
        const totalCost = unitCost * qty;

        // --- Write normalized values ---
        formData["system.quantity"]   = qty;
        formData["system.unitWeight"] = unitWeight;
        formData["system.weight"]     = totalWeight;
        formData["system.unitCost"]   = unitCost;
        formData["system.cost"]       = totalCost;

        return formData;
    }
}