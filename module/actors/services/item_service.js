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
            title: `Split stack of ${item.name}`,
            content: `
      <p>How many do you want to split from the stack (${totalQty} available)?</p>
      <input type="number" id="split-qty" value="1" min="1" max="${totalQty - 1}" />
    `,
            callback: html => parseInt(html.find("#split-qty").val()) || 0,
            rejectClose: false
        });

        // Abort if user cancels or enters an invalid amount
        if (!quantity || quantity <= 0 || quantity >= totalQty) return;

        // --- Calculate accurate unit values before splitting ---
        const totalCost   = Number(item.system.cost || 0);
        const totalWeight = Number(item.system.weight || 0);
        const unitCost    = totalQty > 0 ? totalCost / totalQty : 0;
        const unitWeight  = totalQty > 0 ? totalWeight / totalQty : 0;
        const remaining   = totalQty - quantity;

        // --- Update the original item with remaining quantity and totals ---
        await item.update({
            "system.quantity":   remaining,
            "system.unitCost":   unitCost,
            "system.unitWeight": unitWeight,
            "system.cost":       unitCost * remaining,
            "system.weight":     unitWeight * remaining
        });

        // --- Duplicate the item and create a new one with the split quantity ---
        const newItemData = foundry.utils.duplicate(item.toObject());
        delete newItemData._id;
        newItemData.system.quantity   = quantity;
        newItemData.system.unitCost   = unitCost;
        newItemData.system.unitWeight = unitWeight;
        newItemData.system.cost       = unitCost * quantity;
        newItemData.system.weight     = unitWeight * quantity;

        // --- Preserve currency type if defined ---
        if (item.system.currency_type)
            newItemData.system.currency_type = item.system.currency_type;

        // --- Create the new item in the actor's inventory ---
        await actor.createEmbeddedDocuments("Item", [newItemData]);

        ui.notifications.info(
            `${item.name} split: ${quantity} separated, ${remaining} remaining.`
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
     * Prepare all actor items and group them by type and container relationships.
     *
     * This method now supports both normal gear ("item") and herbs ("herb_or_poison")
     * being placed inside containers of type "item". Containers only appear once,
     * but their contents may include multiple item types.
     */
    static prepareItems(actor, context) {
        const gear = [], playerskill = [], spellskill = [], skillcat = [];
        const languageskill = [], weapons = [], armor = [], herbs = [];
        const spells = [], spellists = [];

        // Get maximum Fate Points from settings (world-level)
        const maxFate = game.settings.get("rmss", "maxFatePoints") ?? 3;

        // Build an array [1, 2, ..., maxFate] for Handlebars iteration
        const fateIcons = Array.from({ length: maxFate }, (_, i) => i + 1);

        // Map: containerId -> [contained items]
        const containersMap = new Map();

        // Helper to normalize Document/POJO IDs
        const getId = (obj) => obj?.id ?? obj?._id ?? null;

        // Pass 1: classify items by type
        for (const item of context.items) {
            item.actorId = actor.id;

            switch (item.type) {
                case "item":           gear.push(item); break;
                case "weapon":         weapons.push(item); break;
                case "herb_or_poison": herbs.push(item); break;
                case "skill_category": skillcat.push(item); break;
                case "spell_list":     spellists.push(item); break;
                case "skill":
                    this._classifySkill(actor, item, playerskill, spellskill, languageskill);
                    break;
                case "armor":          armor.push(item); break;
                case "spell":          spells.push(item); break;
            }
        }

        // ✅ Pass 2: group all containerable items (gear + herbs + weapons) by containerId flag
        const allContainerables = [...gear, ...herbs, ...weapons];

        for (const i of allContainerables) {
            const containerId = i.flags?.rmss?.containerId ?? null;
            if (!containerId) continue;

            if (!containersMap.has(containerId)) containersMap.set(containerId, []);
            containersMap.get(containerId).push(i);
        }

        // Pass 3: build final grouped structures
        const containers = [];
        const looseGear = [];
        const looseHerbs = [];
        const looseWeapons = [];

        for (const i of gear) {
            const isContainer = i.system?.is_container === true;
            const itemId = getId(i);

            if (isContainer) {
                containers.push({
                    container: i,
                    contents: containersMap.get(itemId) || []
                });
            } else if (!i.flags?.rmss?.containerId) {
                looseGear.push(i);
            }
        }

        // Herbs not inside any container → looseHerbs
        for (const h of herbs) {
            if (!h.flags?.rmss?.containerId) looseHerbs.push(h);
        }

        // Weapons not inside any container → looseWeapons
        for (const w of weapons) {
            if (!w.flags?.rmss?.containerId) looseWeapons.push(w);
        }

        // Sort skills alphabetically
        skillcat.sort((a, b) => a.name.localeCompare(b.name));
        playerskill.sort((a, b) => a.name.localeCompare(b.name));

        // Map spells to lists
        const spellistsWithContents = this._mapSpellsToLists(spellists, spells);

        // Attach everything to context
        return Object.assign(context, {
            containers,
            looseGear,
            looseHerbs,
            looseWeapons,
            skillcat,
            playerskill,
            weapons,
            armor,
            herbs,
            spells,
            spellskill,
            spellists: spellistsWithContents,
            languageskill,
            fateIcons,
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

    static async deleteContainer(actor, containerItem) {
        const containerId = containerItem._id ?? containerItem.id;
        const containedItems = actor.items.filter(
            i => i.flags?.rmss?.containerId === containerId
        );

        // Unlink all contained items before deleting
        for (const item of containedItems) {
            await item.unsetFlag("rmss", "containerId");
        }

        await containerItem.delete();
        ui.notifications.info(`${containerItem.name} and its contents have been unlinked.`);
    }
}