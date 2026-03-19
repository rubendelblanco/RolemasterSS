import RMSSCharacterSheet from "./rmss_character_sheet.js";
import ItemService from "../../actors/services/item_service.js";
import SkillDropHandler from "../../actors/drop_handlers/skill_drop_handler.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";
import { expandSpellListEmbeddedSpells } from "../../spells/spell_list_import.js";

export default class RMSSNpcSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-npc-sheet.hbs",
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    _registerItemListeners(html) {
        super._registerItemListeners(html);
        html.find(".spell-cast").click(ev => this._onSpellCastClick(ev));
    }

    async _onSpellCastClick(ev) {
        ev.preventDefault();
        const spellId = ev.currentTarget.dataset.itemId;
        const spellListName = ev.currentTarget.dataset.spellListName;
        const spellListRealm = ev.currentTarget.dataset.spellListRealm;

        const spell = this.actor.items.get(spellId);
        if (!spell) return;

        if (spell.system?.instant) {
            const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
            await InstantSpellService.castInstantSpell({ actor: this.actor, spell });
            return;
        }

        if (spell.system?.type === "BE") {
            const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
            await BaseElementalSpellService.castBaseElementalSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        } else if (spell.system?.type === "DE") {
            const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
            await DirectedElementalSpellService.castDirectedElementalSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        } else {
            await ForceSpellService.castForceSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.npc-skill-calc').on('blur', '[contenteditable="true"]', async (event) => {
            const skillCalc = $(event.currentTarget).closest('.npc-skill-calc');
            const rankBonus = parseInt(skillCalc.find('.npc-item-rank-bonus').text()) || 0;
            const itemBonus = parseInt(skillCalc.find('.npc-item-bonus').text()) || 0;
            const specialBonus = parseInt(skillCalc.find('.npc-item-special-bonus-1').text()) || 0;
            const total = rankBonus + itemBonus + specialBonus;
            skillCalc.find('.npc-item-total-bonus').text(total);
            
            const itemIdElement = skillCalc.find('[data-item-id]').first();
            const itemId = itemIdElement.data('item-id');
            const item = this.actor.items.get(itemId);

            if (item) {
                const data = {
                    "system.rank_bonus": rankBonus,
                    "system.item_bonus": itemBonus,
                    "system.special_bonus_1": specialBonus,
                    "system.total_bonus": total,
                };
                await item.update(data);
            }
        });
    }

    async getData() {
        // Expand embedded spells in spell lists (for lists added before we had drop-handling)
        // Skip if we're in the middle of a drop (avoids double expansion when drop triggers re-render)
        if (!this.actor.getFlag("rmss", "expandingSpellList")) {
            for (const list of this.actor.items.filter(i => i.type === "spell_list")) {
                const embedded = list.system?.spells ?? [];
                if (embedded.length === 0) continue;
                const listId = list.id ?? list._id;
                const hasExpanded = this.actor.items.some(
                    s => s.type === "spell" && s.flags?.rmss?.containerId === listId
                );
                if (!hasExpanded) {
                    await expandSpellListEmbeddedSpells(this.actor, list);
                }
            }
        }

        const context = await super.getData();
        // Use a safe clone of the actor data for further operations.
        const actorData = this.actor.toObject(false);
        let enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description, {async: true});

        // Add the actor's data to context.data for easier access, as well as flags.
        context.system = actorData.system;
        context.flags = actorData.flags;
        context.enrichedDescription = enrichedDescription;

        //effects
        context.effects = this.actor.effects.contents;

        // Prepare character data and items.
        this._prepareItems(context);

        return context;
    }

    async _onDropItem(event, data) {
        const newItem = await Item.implementation.fromDropData(data);
        const itemData = newItem.toObject();

        if (itemData.type === "skill") {
            const handler = new SkillDropHandler(this.actor);
            return handler.handle(itemData);
        }

        return super._onDropItem(event, data);
    }

    _prepareItems(context) {
        return ItemService.prepareItems(this.actor, context);
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;

        // Get the type of item to create.
        const type = header.dataset.type;

        // Grab any data associated with this control.
        const data = duplicate(header.dataset);

        // Initialize a default name.
        const name = `New ${type.capitalize()}`;

        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            data: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.data.type;
        // Finally, create the item!
        return await Item.create(itemData, {parent: this.actor});
    }
}