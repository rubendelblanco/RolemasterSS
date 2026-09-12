import { socket } from "../../../rmss.js";
import { attachItemMagicActionFlags } from "../../sheets/items/cast_enchantment_from_item.js";
import { ContainerHandler } from "../utils/container_handler.js";
import { attachIdentityDisplayFlags } from "../utils/item_identity_util.js";
import RankCalculator from "../../core/skills/rmss_rank_calculator.js";
import FoodSpoilageService from "./food_spoilage_service.js";

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
     * Whether an item can be bought/sold/taken/populated in a quantity > 1.
     * Weapons and armor are always individual, unique instances — no quantity field
     * on their own sheet, no "split stack" control, each one has its own bonus/
     * material/quality — so they never stack, regardless of their own data.
     * Generic items/herbs stack by default but can opt out individually via their
     * own "is_stackable" checkbox (e.g. a unique quest item of type "item").
     * @param {Item} item
     * @returns {boolean}
     */
    static isStackable(item) {
        if (item.type === "weapon" || item.type === "armor") return false;
        return item.system?.is_stackable !== false;
    }

    /**
     * Per-unit price of an item, normalizing two different conventions used across
     * item types: weapon/armor sheets store the price directly in `system.unitCost`
     * (their sheets never populate `system.cost` — see rmss_weapon_sheet.js /
     * rmss_armor_sheet.js), while generic item/herb sheets store the *total* stack
     * price in `system.cost` and unitCost is derived by dividing by quantity.
     * @param {Item} item
     * @param {number} totalQty - item.system.quantity, already resolved by the caller
     * @returns {number}
     */
    static getUnitCost(item, totalQty) {
        if (item.type === "weapon" || item.type === "armor") {
            return Number(item.system.unitCost) || 0;
        }
        return totalQty > 0 ? Number(((Number(item.system.cost) || 0) / totalQty).toFixed(2)) : 0;
    }

    /**
     * Per-unit weight of an item — the mirror-image inconsistency of getUnitCost:
     * weapon/armor sheets store weight directly in `system.weight` and never populate
     * `system.unitWeight` (their quantity is always 1 through their own sheet, so this
     * has never surfaced as a bug — but code that stacks weapon/armor quantity, like
     * RollTableStockService, needs the real per-unit value up front).
     * @param {Item} item
     * @param {number} totalQty - item.system.quantity, already resolved by the caller
     * @returns {number}
     */
    static getUnitWeight(item, totalQty) {
        if (item.type === "weapon" || item.type === "armor") {
            return Number(item.system.weight) || 0;
        }
        return totalQty > 0 ? Number(((Number(item.system.weight) || 0) / totalQty).toFixed(2)) : 0;
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

        // --- Calculate accurate unit values before splitting (round to 2 decimals to avoid float noise) ---
        const totalCost   = Number(item.system.cost || 0);
        const totalWeight = Number(item.system.weight || 0);
        const unitCost    = totalQty > 0 ? Number((totalCost / totalQty).toFixed(2)) : 0;
        const unitWeight  = totalQty > 0 ? Number((totalWeight / totalQty).toFixed(2)) : 0;
        const remaining   = totalQty - quantity;

        // --- Update the original item with remaining quantity and totals ---
        await item.update({
            "system.quantity":   remaining,
            "system.unitCost":   unitCost,
            "system.unitWeight": unitWeight,
            "system.cost":       Number((unitCost * remaining).toFixed(2)),
            "system.weight":     Number((unitWeight * remaining).toFixed(2))
        });

        // --- Duplicate the item and create a new one with the split quantity ---
        const newItemData = foundry.utils.duplicate(item.toObject());
        delete newItemData._id;
        newItemData.system.quantity   = quantity;
        newItemData.system.unitCost   = unitCost;
        newItemData.system.unitWeight = unitWeight;
        newItemData.system.cost       = Number((unitCost * quantity).toFixed(2));
        newItemData.system.weight     = Number((unitWeight * quantity).toFixed(2));

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
        await item.update({ "system.worn": !isWorn });
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
        const spells = [], spellists = [], creature_attacks = [], transports = [];

        // Get maximum Fate Points from settings (world-level)
        const maxFate = game.settings.get("rmss", "maxFatePoints") ?? 3;

        // Build an array [1, 2, ..., maxFate] for Handlebars iteration
        const fateIcons = Array.from({ length: maxFate }, (_, i) => i + 1);

        // Map: containerId -> [contained items]
        const containersMap = new Map();

        // Helper to normalize Document/POJO IDs
        const getId = (obj) => obj?.id ?? obj?._id ?? null;

        const collapsedContainersRaw = actor.getFlag("rmss", "collapsedContainers") ?? {};
        /** @type {Record<string, boolean>} */
        const collapsedContainers = {};
        for (const [k, v] of Object.entries(collapsedContainersRaw)) {
            if (!v) continue;
            const doc = actor.items.get(k);
            const norm = doc?.id ?? k;
            collapsedContainers[norm] = true;
        }

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
                case "creature_attack": creature_attacks.push(item); break;
                case "transport":       transports.push(item); break;
            }
        }

        // Mask name/magical-glow for unidentified items (identified === false), for anyone but the GM
        for (const i of [...gear, ...weapons, ...armor, ...herbs]) {
            attachIdentityDisplayFlags(i);
        }

        // Days-until-spoiled label for tracked food (see food_spoilage_service.js). Kept as
        // a separate boolean rather than relying on rmssDaysUntilSpoiled's truthiness, since
        // 0 remaining days is a valid (falsy) tracked value in the brief window before the
        // next long rest deletes the item.
        for (const i of gear) {
            const isTracked = FoodSpoilageService.isTrackedFoodItem(i);
            i.rmssIsTrackedFood = isTracked;
            i.rmssDaysUntilSpoiled = isTracked ? (Number(i.system?.days_until_spoiled) || 0) : null;
        }

        // Spell list name/realm for casting (Record tab favorites, etc.)
        for (const spell of spells) {
            const listId = spell.flags?.rmss?.containerId;
            if (!listId) continue;
            const listItem = actor.items.get(listId);
            if (listItem?.type === "spell_list") {
                spell.spellListName = listItem.name;
                spell.spellListRealm = listItem.system?.realm ?? "";
            }
        }

        // ✅ Pass 2: group all containerable items (gear + herbs + weapons + armor) by containerId flag
        const allContainerables = [...gear, ...herbs, ...weapons, ...armor];

        for (const i of allContainerables) {
            const containerId = i.flags?.rmss?.containerId ?? null;
            if (!containerId) continue;

            if (!containersMap.has(containerId)) containersMap.set(containerId, []);
            containersMap.get(containerId).push(i);
        }

        // Process transports as containers
        const transportContainers = [];
        for (const transport of transports) {
            const transportId = getId(transport);
            const transportDoc = actor.items.get(transportId) ?? transport;
            const handler = ContainerHandler.for(transportDoc);
            const contents = containersMap.get(transportId) || [];
            transportContainers.push({
                container: transport,
                collapseGroupId: transportId,
                contents,
                capacityUsed: handler?.usedValue ?? 0,
                capacityMax: handler?.maxCapacity ?? 0,
                capacityPercent: handler?.usedPercent ?? 0,
                isOverCapacity: handler?.isOverCapacity() ?? false,
                capacityType: handler?.capacityType ?? "weight",
                isCollapsed: !!collapsedContainers[transportId]
            });
        }

        // Pass 3: build final grouped structures
        const containers = [];
        const looseGear = [];
        const looseHerbs = [];
        const looseWeapons = [];
        const looseArmor = [];

        for (const i of gear) {
            const isContainer = i.system?.is_container === true;
            const itemId = getId(i);

            if (isContainer) {
                const containerDoc = actor.items.get(itemId) ?? i;
                const handler = ContainerHandler.for(containerDoc);
                const contents = containersMap.get(itemId) || [];
                if (handler?.isOverCapacity()) {
                    handler.enforceCapacityByEjectingUntilUnder().catch(console.error);
                }
                containers.push({
                    container: i,
                    collapseGroupId: itemId,
                    contents,
                    capacityUsed: handler?.usedValue ?? 0,
                    capacityMax: handler?.maxCapacity ?? 0,
                    capacityPercent: handler?.usedPercent ?? 0,
                    isOverCapacity: handler?.isOverCapacity() ?? false,
                    capacityType: handler?.capacityType ?? "weight",
                    isCollapsed: !!collapsedContainers[itemId]
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

        // Armor not inside any container → looseArmor
        for (const a of armor) {
            if (!a.flags?.rmss?.containerId) looseArmor.push(a);
        }

        // Sort skills alphabetically by translated name
        skillcat.sort((a, b) => {
            const nameA = game.i18n.localize(`rmss.skill_categories_names.${a.system.slug}`) || a.name;
            const nameB = game.i18n.localize(`rmss.skill_categories_names.${b.system.slug}`) || b.name;
            return nameA.localeCompare(nameB, game.i18n.lang);
        });
        playerskill.sort((a, b) => a.name.localeCompare(b.name));

        // Group skill categories by the text before "•" in their localized name (e.g.
        // "Armadura • Ligera" / "Armadura • Media" / "Armadura • Pesada" all group under
        // "Armadura") so the Skills tab can offer a coarse category filter without listing
        // every granular variant - too much granularity there just overwhelms the player.
        const categoryGroupOf = (categoryItem) => {
            const localized = game.i18n.localize(`rmss.skill_categories_names.${categoryItem.system.slug}`) || categoryItem.name;
            const bulletIndex = localized.indexOf("•");
            return bulletIndex === -1 ? localized.trim() : localized.slice(0, bulletIndex).trim();
        };
        // Keyed by slug primarily - that's what _classifySkill below actually relies on to
        // resolve a skill's category (system.category, the item id, isn't reliably kept in
        // sync on every skill), so slug is the field guaranteed to match. Kept a fallback by
        // id too in case a skill only has the id set.
        const categoryGroupBySlug = new Map(skillcat.map(c => [c.system.slug, categoryGroupOf(c)]));
        const categoryGroupById = new Map(skillcat.map(c => [c.id, categoryGroupOf(c)]));
        const skillCategoryGroups = [...new Set(skillcat.map(c => categoryGroupOf(c)))]
            .sort((a, b) => a.localeCompare(b, game.i18n.lang));
        // Max ranks buyable this level-up session: one per tier in the (effective)
        // development cost string, capped at 3 (e.g. a single-number cost like "3"
        // only allows 1 rank, "3/5" allows 2, "3/5/7" allows 3).
        for (const skill of [...playerskill, ...spellskill, ...languageskill]) {
            skill.categoryGroup = categoryGroupBySlug.get(skill.system.categorySlug)
                ?? categoryGroupById.get(skill.system.category)
                ?? "";
            const costString = RankCalculator.getEffectiveDevelopmentCost(actor, skill);
            skill.newRankMax = Math.min(3, String(costString).split("/").length);
        }
        for (const category of skillcat) {
            const costString = RankCalculator.getEffectiveDevelopmentCost(actor, category);
            category.newRankMax = Math.min(3, String(costString).split("/").length);
        }

        // Map spells to lists (filter by skill rank: only show spells up to level = skill ranks)
        const spellistsWithContents = this._mapSpellsToLists(actor, spellists, spells);

        const weaponSlugs = CONFIG.rmss.weapon_category_slugs || [];
        const hasWeaponCategories = skillcat.some(s => weaponSlugs.includes(s.system?.slug));
        const level = Number(actor.system?.attributes?.level?.value ?? 0);
        const showWeaponPrefAssign = hasWeaponCategories && level === 0;
        const canEditSpellsAndLists = game.user.isGM || game.user.role === CONST.USER_ROLES.ASSISTANT;

        creature_attacks.sort((a, b) => {
            const oa = Number(a.system?.order);
            const ob = Number(b.system?.order);
            const na = Number.isFinite(oa) ? oa : 9999;
            const nb = Number.isFinite(ob) ? ob : 9999;
            if (na !== nb) return na - nb;
            return (a.name || "").localeCompare(b.name || "", game.i18n.lang);
        });

        const attachMagicUi = (po) => {
            if (po && typeof po === "object") attachItemMagicActionFlags(po);
        };
        for (const g of containers) {
            attachMagicUi(g.container);
            for (const c of g.contents) attachMagicUi(c);
        }
        for (const g of transportContainers) {
            attachMagicUi(g.container);
            for (const c of g.contents) attachMagicUi(c);
        }
        for (const i of looseGear) attachMagicUi(i);
        for (const w of weapons) attachMagicUi(w);
        for (const a of armor) attachMagicUi(a);

        // Attach everything to context
        return Object.assign(context, {
            actorIsCreature: actor?.type === "creature" || actor?.type === "npc",
            canEditSpellsAndLists,
            containers,
            transportContainers,
            looseGear,
            looseHerbs,
            looseWeapons,
            looseArmor,
            skillcat,
            skillCategoryGroups,
            hasWeaponCategories,
            showWeaponPrefAssign,
            playerskill,
            weapons,
            armor,
            herbs,
            spells,
            spellskill,
            spellists: spellistsWithContents,
            languageskill,
            fateIcons,
            creature_attacks,
            config: CONFIG.rmss
        });
    }

    static _classifySkill(actor, skill, playerskill, spellskill, languageskill) {
        const skillCategorySlug = skill.system.categorySlug;
        const skillCategory = actor.items.find(i =>
            i.type === "skill_category" &&
            i.system?.slug === skillCategorySlug
        );

        if (!skillCategory) {
            playerskill.push(skill);
            return;
        }

        const tab = CONFIG.rmss.skill_tab_by_slug?.[skillCategorySlug] ?? "skills";
        switch (tab) {
            case "spells": spellskill.push(skill); break;
            case "languages": languageskill.push(skill); break;
            default: playerskill.push(skill);
        }
    }

    static _mapSpellsToLists(actor, spellists, spells) {
        const spellsByList = {};
        for (const spell of spells) {
            const containerId = spell.flags?.rmss?.containerId;
            if (!containerId) continue;
            if (!spellsByList[containerId]) spellsByList[containerId] = [];
            spellsByList[containerId].push(spell);
        }

        const isCreatureOrNpc = actor?.type === "creature" || actor?.type === "npc";
        const creatureLevel = parseInt(actor?.system?.attributes?.level?.value, 10) || 0;

        return spellists
            .map(list => this._buildSpellListEntry(actor, list, spellsByList, isCreatureOrNpc, creatureLevel))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Build a spell list entry with contents, level cap, and maneuver modifier.
     * @private
     */
    static _buildSpellListEntry(actor, list, spellsByList, isCreatureOrNpc, creatureLevel) {
        const listId = list.id || list._id;
        let contents = (spellsByList[listId] || []).sort(
            (a, b) => (a.system.level || 0) - (b.system.level || 0)
        );

        const skill = actor?.items?.find(i => i.type === "skill" && i.name === list.name);
        const maxLevel = this._getSpellListMaxLevel(skill, list, isCreatureOrNpc, creatureLevel);
        if (maxLevel >= 0) {
            contents = contents.filter(s => (parseInt(s.system?.level, 10) || 0) <= maxLevel);
        }

        const spellManeuverModifier = this._getSpellManeuverModifier(skill, list, isCreatureOrNpc, creatureLevel);

        return { ...list, listId, contents, listLevel: maxLevel, spellManeuverModifier };
    }

    /**
     * Public wrapper around _getSpellListMaxLevel for external consumers (e.g. the Argon Combat
     * HUD module) that only have the actor and the spell_list item, not the pre-resolved
     * skill/isCreatureOrNpc/creatureLevel locals _mapSpellsToLists already has on hand.
     * Same rule the character/NPC sheets use: character -> the linked skill's ranks; NPC/creature
     * -> the list's own flags.rmss.listLevel flag, falling back to the actor's level.
     * @param {Actor} actor
     * @param {Item} list - a spell_list item
     * @returns {number}
     */
    static getSpellListMaxLevel(actor, list) {
        const isCreatureOrNpc = actor?.type === "creature" || actor?.type === "npc";
        const creatureLevel = parseInt(actor?.system?.attributes?.level?.value, 10) || 0;
        const skill = actor?.items?.find(i => i.type === "skill" && i.name === list?.name);
        return this._getSpellListMaxLevel(skill, list, isCreatureOrNpc, creatureLevel);
    }

    static _getSpellListMaxLevel(skill, list, isCreatureOrNpc, creatureLevel) {
        if (skill) return parseInt(skill.system?.ranks, 10) || 0;
        if (isCreatureOrNpc) {
            const stored = list.flags?.rmss?.listLevel;
            return (stored !== undefined && stored !== null) ? parseInt(stored, 10) : creatureLevel;
        }
        return 0;
    }

    static _getSpellManeuverModifier(skill, list, isCreatureOrNpc, creatureLevel) {
        if (skill) return null; // Characters use skill bonus, not this field
        if (!isCreatureOrNpc) return creatureLevel;
        const stored = list.flags?.rmss?.spellManeuverModifier;
        return (stored !== undefined && stored !== null) ? parseInt(stored, 10) : creatureLevel;
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
        let unitWeight  = Number((formData["system.unitWeight"] ?? 0).toFixed(2));
        let unitCost    = Number((formData["system.unitCost"] ?? 0).toFixed(2));
        const totalWeight = Number((unitWeight * qty).toFixed(2));
        const totalCost = Number((unitCost * qty).toFixed(2));

        // --- Write normalized values ---
        formData["system.quantity"]   = qty;
        formData["system.unitWeight"] = unitWeight;
        formData["system.weight"]     = totalWeight;
        formData["system.unitCost"]   = unitCost;
        formData["system.cost"]       = totalCost;

        // --- Container: parse allowedTags from comma-separated string to array ---
        const atKey = "system.container.allowedTags";
        if (formData[atKey] !== undefined) {
            const raw = formData[atKey];
            formData[atKey] = typeof raw === "string"
                ? raw.split(",").map(s => s.trim()).filter(Boolean)
                : (Array.isArray(raw) ? raw : null);
        }

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

    /**
     * Compare two items to determine if they are equal.
     *
     * Two items are considered equal if they have the same name and,
     * if either item has an image, they both have the same image.
     *
     * @param {Item} item1 - The first item to compare.
     * @param {Item} item2 - The second item to compare.
     * @returns {boolean} True if the items have the same name and image (if present), false otherwise.
     */
    static equals(item1, item2) {
        // Compare names
        if (item1.name !== item2.name) {
            return false;
        }

        // Compare images if either item has one
        const img1 = item1.img || null;
        const img2 = item2.img || null;

        // If both have no image, they are equal (same name)
        if (!img1 && !img2) {
            return true;
        }

        // If one has an image and the other doesn't, they are not equal
        if ((img1 && !img2) || (!img1 && img2)) {
            return false;
        }

        // Both have images, compare them
        return img1 === img2;
    }
}