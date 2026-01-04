// Our Item Sheet extends the default
import { ContainerHandler } from "../../actors/utils/container_handler.js";

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
            const spell = this.item.parent?.items.get(itemId);
            if (!spell) return;

            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("rmss.dialogs.confirm_delete_title"),
                content: game.i18n.format("rmss.dialogs.confirm_delete_spell_from_list", { name: spell.name }),
                defaultYes: false
            });

            if (confirmed) {
                await spell.unsetFlag("rmss", "containerId");
                const handler = ContainerHandler.for(this.item);
                if (handler) await handler.recalc();
            }
        });

        // Edit spell
        html.find(".item-edit").click(ev => {
            ev.preventDefault();
            const itemId = ev.currentTarget.dataset.itemId;
            const spell = this.item.parent?.items.get(itemId);
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

        const spellList = this.item;
        const handler = ContainerHandler.for(spellList);
        if (!handler) return;

        // Case 1: folder drop
        if (data.type === "Folder") {
            const folder = await fromUuid(data.uuid);
            if (!folder || folder.type !== "Item") {
                return ui.notifications.warn("Only Item folders can be dropped here.");
            }

            const spellsInFolder = folder.contents.filter(i => i.type === "spell");
            if (!spellsInFolder.length) {
                return ui.notifications.warn(`The folder "${folder.name}" contains no spells.`);
            }

            for (let spell of spellsInFolder) {
                await this._addSpellToList(spell, spellList, handler);
            }

            ui.notifications.info(`${spellsInFolder.length} spells added from folder "${folder.name}" to ${spellList.name}.`);
            return;
        }

        // Case 2: single spell drop
        const droppedSpell = await fromUuid(data.uuid);
        if (!droppedSpell || droppedSpell.type !== "spell") {
            return ui.notifications.warn("Only spell items or folders of spells can be added to a spell list.");
        }

        await this._addSpellToList(droppedSpell, spellList, handler);
    }

    async _addSpellToList(spell, spellList, handler) {
        // Validate compatibility
        if (!handler.canAccept(spell)) {
            ui.notifications.warn(`${spellList.name} cannot contain ${spell.name}`);
            return;
        }

        // Actor context only
        if (spellList.parent && spellList.parent.items) {
            // Case: spell already in the same actor
            if (spell.parent?.id === spellList.parent.id) {
                await spell.setFlag("rmss", "containerId", spellList.id || spellList._id);
                return;
            }

            // Case: needs to be cloned into actor
            const newSpell = await spellList.parent.createEmbeddedDocuments("Item", [spell.toObject()]);
            await newSpell[0].setFlag("rmss", "containerId", spellList.id || spellList._id);
            if (handler) await handler.recalc();
        } else {
            ui.notifications.warn("Spells cannot be added directly to catalog spell lists. Use actor spell lists instead.");
        }
    }
}