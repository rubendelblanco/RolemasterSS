// Our Item Sheet extends the default
import {ContainerHandler} from "../container.js";

export default class RMSSSpellListSheet extends ItemSheet {
    // Default options
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 530,
            height: 440,
            classes: ["rmss", "sheet", "item"]
        });
    }

    /** Template path */
    get template() {
        return "systems/rmss/templates/sheets/spell_lists/rmss-spell-list-sheet.html";
    }

    /** Activate listeners */
    activateListeners(html) {
        super.activateListeners(html);

        // Handle drop
        html[0].addEventListener("drop", this._onDropSpell.bind(this));

        // Delete spell
        html.find(".item-delete").click(async ev => {
            ev.preventDefault();
            const itemId = ev.currentTarget.dataset.itemId;
            const spell = this.item.parent?.items.get(itemId) || game.items.get(itemId);
            if (!spell) return;

            await spell.unsetFlag("rmss", "containerId");
            const handler = ContainerHandler.for(this.item);
            if (handler) await handler.recalc();
        });

        // Edit spell
        html.find(".item-edit").click(ev => {
            ev.preventDefault();
            const itemId = ev.currentTarget.dataset.itemId;
            const spell = this.item.parent?.items.get(itemId) || game.items.get(itemId);
            if (spell) spell.sheet.render(true);
        });
    }

    /** Prepare data for the sheet */
    async getData() {
        const baseData = await super.getData();
        let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

        // Use ContainerHandler to gather contents
        let spells = [];
        const handler = ContainerHandler.for(this.item);
        if (handler) {
            spells = handler.contents;
            spells.sort((a, b) => (a.system.level || 0) - (b.system.level || 0));
        }

        return {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss,
            enrichedDescription,
            spells
        };
    }

    /** Handle dropping a spell onto the spell list */
    async _onDropSpell(event) {
        event.preventDefault();
        event.stopPropagation();

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return console.warn("Error reading data", err);
        }

        if (!data || !data.uuid) return;

        const droppedSpell = await fromUuid(data.uuid);
        if (!droppedSpell || droppedSpell.type !== "spell") {
            return ui.notifications.warn("Only spell items can be added to a spell list.");
        }

        const spellList = this.item;
        const handler = ContainerHandler.for(spellList);
        if (!handler) return;

        // Validate compatibility
        if (!handler.canAccept(droppedSpell)) {
            return ui.notifications.warn(`${spellList.name} cannot contain ${droppedSpell.name}`);
        }

        // Case 1: spell already in the same parent (actor or game.items)
        if (droppedSpell.parent?.id === spellList.parent?.id) {
            await droppedSpell.setFlag("rmss", "containerId", spellList.id || spellList._id);
            ui.notifications.info(`${droppedSpell.name} added to ${spellList.name}.`);
            return;
        }

        // Case 2: create a new spell in the correct collection
        let newSpell;
        if (spellList.parent && spellList.parent.items) {
            // Spell list belongs to an Actor
            newSpell = await spellList.parent.createEmbeddedDocuments("Item", [droppedSpell.toObject()]);
        } else {
            // Spell list is global (game.items)
            newSpell = [await Item.create(droppedSpell.toObject(), { renderSheet: false })];
        }

        await newSpell[0].setFlag("rmss", "containerId", spellList.id || spellList._id);
        ui.notifications.info(`${droppedSpell.name} added to ${spellList.name}.`);
    }
}

