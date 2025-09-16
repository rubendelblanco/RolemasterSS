// Our Item Sheet extends the default
import {ContainerHandler} from "../container.js";

export default class RMSSSpellListSheet extends ItemSheet {

    // Set the height and width
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 530,
            height: 440,
            classes: ["rmss", "sheet", "item"]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].addEventListener("drop", this._onDropSpell.bind(this));

        html.find(".item-delete").click(async ev => {
            const spellId = ev.currentTarget.getAttribute("data-spell-id");
            const spells = this.object.system.spells;
            const updatedSpells = spells.filter(s => s._id !== spellId);
            await this.object.update({ "system.spells": updatedSpells });
        });

        html.find(".item-edit").click(ev => {
            const spellId = ev.currentTarget.getAttribute("data-spell-id");
            const spells = this.object.system.spells;
            const updatedSpells = spells.filter(s => s._id === spellId);
            console.log(updatedSpells[0]._id);
            const item = game.items.get(updatedSpells[0]._id);
            if (item) item.sheet.render(true);
        });
    }

    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/spell_lists/rmss-spell-list-sheet.html";
    }

    // Make the data available to the sheet template
    async getData() {
        const baseData = await super.getData();
        let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});
        // Use container logic to gather contents
        let contents = [];
        const handler = ContainerHandler.for(this.item);

        if (handler) {
            contents = handler.contents;
        }

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss,
            enrichedDescription: enrichedDescription,
            contents
        };

        return sheetData;
    }

    /**
     * Handle dropping a spell onto a spell list.
     * Works like other containers: uses containerId flag and ContainerHandler.
     */
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

        const spellList = this.item; // puede estar en un actor o en game.items
        const handler = ContainerHandler.for(spellList);
        if (!handler) return;

        // Validate compatibility
        if (!handler.canAccept(droppedSpell)) {
            return ui.notifications.warn(`${spellList.name} cannot contain ${droppedSpell.name}`);
        }

        // Validate capacity
        if (!handler.canFit(droppedSpell)) {
            return ui.notifications.error(`${spellList.name} has no space for ${droppedSpell.name}.`);
        }

        // Case 1: spell already in the same parent (actor o game.items)
        if (droppedSpell.parent?.id === spellList.parent?.id) {
            await droppedSpell.setFlag("rmss", "containerId", spellList.id || spellList._id);
            await handler.recalc();
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
        await handler.recalc();
        ui.notifications.info(`${droppedSpell.name} added to ${spellList.name}.`);
    }
}
