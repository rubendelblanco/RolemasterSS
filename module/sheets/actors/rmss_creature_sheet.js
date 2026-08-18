import RMSSCharacterSheet from "./rmss_character_sheet.js";
import ItemService from "../../actors/services/item_service.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";
import { expandSpellListEmbeddedSpells } from "../../spells/spell_list_import.js";
import { bindCreatureTagsEditor, getCreatureTagsArray, getCreatureTagListId } from "./creature_tags_ui.js";

export default class RMSSCreatureSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-creature-sheet.hbs",
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

        const spell = this.actor.items.get(spellId);
        if (!spell) return;

        const { spellListName, spellListRealm } = this._resolveSpellListCastContext(spell, ev.currentTarget.dataset);

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
        bindCreatureTagsEditor(this, html);
        const saveCreatureAttack = async (event) => {
            const attackCalc = $(event.currentTarget).closest('.creature-attack-calc');
            const attackBonus = parseInt(attackCalc.find('.creature-attack-bonus').text().trim(), 10) || 0;
            const attackMult = parseInt(attackCalc.find('.creature-attack-multiplier select').val(), 10) || 1;
            const attackNumber = parseInt(attackCalc.find('.creature-attack-number').text().trim(), 10) || 1;
            const attackProb = parseInt(attackCalc.find('.creature-attack-probability').text().trim(), 10) || 100;
            const data = {
                "system.attacks_number": attackNumber,
                "system.bonus": attackBonus,
                "system.multiplier": attackMult,
                "system.probability": attackProb
            };
            const specialSelect = attackCalc.find(".creature-attack-special select");
            if (specialSelect.length) {
                data["system.special"] = specialSelect.val();
            }
            const itemId = attackCalc.data('item-id');
            const item = this.actor.items.get(itemId);

            if (item) {
                await item.update(data);
            }
        };

        // contenteditable fires 'blur' when user leaves the field, not 'change'
        html.find('.creature-attack-calc').on('blur', '[contenteditable="true"]', saveCreatureAttack);
        // select fires 'change' when user picks a new value
        html.find('.creature-attack-calc').on('change', 'select', saveCreatureAttack);

        if (this.isEditable) {
            this._registerCreatureAttackSortable(html);
        }

        html.find('select[name="system.initiative_code"]').on("change", ev => {
            const newValue = Number(ev.target.value);

            this.actor.update({
                "system.attributes.initiative.mod": newValue,
                "system.attributes.initiative.value": newValue
            });
        });
    }

    async _onDropItem(event, data) {
        await super._onDropItem(event, data);

        if (data.type === 'Item') {
            const item = await fromUuid(data.uuid);

            if (item && item.type === "creature_attack") {
                const creatureAttacks = this.actor.items.filter(item => item.type === "creature_attack");

                for (let [index, attack] of creatureAttacks.entries()) {
                    await attack.update({ "system.order": index + 1 });
                }
            }
        }
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
        context.initiative_codes = CONFIG.rmss.creature_speed;
        context.creatureTags = getCreatureTagsArray(actorData.system);
        context.creatureTagListId = getCreatureTagListId(this.actor);

        //effects
        context.effects = this.actor.effects.contents;

        // Prepare character data and items.
        this._prepareItems(context);

        return context;
    }

    _prepareItems(context) {
        return ItemService.prepareItems(this.actor, context);
    }

    /**
     * Drag handle reorders creature attacks (updates system.order).
     * @param {jQuery} html
     */
    _registerCreatureAttackSortable(html) {
        const container = html.find(".creature-attacks-sortable");
        if (!container.length) return;

        container.on("dragstart", ".creature-attack-drag-handle", (ev) => {
            const id = ev.currentTarget.dataset.itemId;
            this._creatureAttackDragSourceId = id;
            ev.originalEvent.dataTransfer?.setData("text/plain", "rmss-creature-attack-reorder");
            ev.originalEvent.dataTransfer.effectAllowed = "move";
        });

        container.on("dragend", ".creature-attack-drag-handle", () => {
            this._creatureAttackDragSourceId = null;
            html.find(".creature-attack-calc").removeClass("creature-attack-drag-over");
        });

        container.on("dragover", (ev) => {
            if (!this._creatureAttackDragSourceId) return;
            const row = ev.target.closest(".creature-attack-calc");
            ev.preventDefault();
            ev.originalEvent.dataTransfer.dropEffect = "move";
            if (row) {
                html.find(".creature-attack-calc").removeClass("creature-attack-drag-over");
                row.classList.add("creature-attack-drag-over");
            }
        });

        container.on("drop", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            html.find(".creature-attack-calc").removeClass("creature-attack-drag-over");
            const draggedId = this._creatureAttackDragSourceId;
            this._creatureAttackDragSourceId = null;
            const row = ev.target.closest(".creature-attack-calc");
            if (!row || !draggedId) return;
            const targetId = row.dataset.itemId;
            if (draggedId === targetId) return;

            const ids = [...container[0].querySelectorAll(".creature-attack-calc")].map((el) => el.dataset.itemId);
            const dragI = ids.indexOf(draggedId);
            const targetI = ids.indexOf(targetId);
            if (dragI === -1 || targetI === -1) return;

            const next = ids.filter((id) => id !== draggedId);
            let insertAt = targetI;
            if (dragI < targetI) insertAt--;
            next.splice(insertAt, 0, draggedId);

            const updates = next.map((id, i) => ({
                _id: id,
                system: { order: i + 1 }
            }));
            await this.actor.updateEmbeddedDocuments("Item", updates);
        });
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
        if (type === "creature_attack") {
            const maxOrder = this.actor.items
                .filter((i) => i.type === "creature_attack")
                .reduce((m, i) => Math.max(m, Number(i.system?.order) || 0), 0);
            itemData.data.order = maxOrder + 1;
        }
        // Finally, create the item!
        return await Item.create(itemData, {parent: this.actor});
    }
}