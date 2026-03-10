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

    /** Whether this spell list is in compendium (no actor parent) - uses embedded spells */
    get isEmbeddedMode() {
        return !this.item.parent?.items;
    }

    /** Activate listeners */
    activateListeners(html) {
        super.activateListeners(html);

        // Allow drop zone
        const dropZone = html[0].querySelector(".sheet-content.spell-list") || html[0];
        dropZone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = "copy";
        });

        // Handle drop
        html[0].addEventListener("drop", this._onDropSpell.bind(this));

        // Drag spell from list (embedded: spellData; actor: uuid)
        html.find(".spell-draggable").each((i, el) => {
            el.addEventListener("dragstart", ev => this._onDragSpell(ev));
        });

        // Delete spell
        html.find(".item-delete").click(async ev => {
            ev.preventDefault();
            const itemId = ev.currentTarget.dataset.itemId;
            const spellIdx = ev.currentTarget.dataset.spellIdx;

            if (this.isEmbeddedMode && spellIdx !== undefined) {
                await this._deleteEmbeddedSpell(parseInt(spellIdx, 10));
                return;
            }

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
            const spellIdx = ev.currentTarget.dataset.spellIdx;

            if (this.isEmbeddedMode && spellIdx !== undefined) {
                this._editEmbeddedSpell(parseInt(spellIdx, 10));
                return;
            }

            const spell = this.item.parent?.items.get(itemId);
            if (spell) spell.sheet.render(true);
        });

        // Create spell (embedded mode only)
        html.find(".create-spell").click(ev => {
            ev.preventDefault();
            if (this.isEmbeddedMode) this._createEmbeddedSpell();
        });
    }

    /** Prepare data for the sheet */
    async getData() {
        const baseData = await super.getData();
        let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

        let spells = [];
        if (this.isEmbeddedMode) {
            // Compendium: use embedded system.spells
            spells = [...(this.item.system.spells ?? [])];
            spells.sort((a, b) => ((a.system?.level ?? 0) - (b.system?.level ?? 0)));
        } else {
            // Actor: use ContainerHandler
            const handler = ContainerHandler.for(this.item);
            if (handler) {
                spells = handler.contents;
                spells.sort((a, b) => (a.system.level || 0) - (b.system.level || 0));
            }
        }

        return {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss,
            enrichedDescription,
            spells,
            embeddedMode: this.isEmbeddedMode
        };
    }

    /** Start dragging a spell from the list */
    _onDragSpell(ev) {
        const spellIdx = ev.currentTarget.dataset.spellIdx;
        const uuid = ev.currentTarget.dataset.uuid;

        let dragData;
        if (this.isEmbeddedMode && spellIdx !== undefined) {
            const spells = this.item.system.spells ?? [];
            const spell = spells[parseInt(spellIdx, 10)];
            if (!spell) return;
            dragData = {
                type: "EmbeddedSpell",
                spellData: this._spellItemToEmbedded(spell),
                spellListName: this.item.name,
                realm: this.item.system?.realm ?? "",
                listType: this.item.system?.type ?? "",
                profession: this.item.system?.profession ?? ""
            };
        } else if (uuid) {
            dragData = {
                type: "Item",
                uuid,
                spellListName: this.item.name,
                realm: this.item.system?.realm ?? "",
                listType: this.item.system?.type ?? "",
                profession: this.item.system?.profession ?? ""
            };
        } else {
            return;
        }

        const json = JSON.stringify(dragData);
        ev.dataTransfer.setData("text/plain", json);
        ev.dataTransfer.setData("application/json", json);
        ev.dataTransfer.effectAllowed = "copy";
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

        if (!data) return;

        const spellList = this.item;

        // Embedded spell from another spell list (no uuid)
        if (data.type === "EmbeddedSpell" && data.spellData) {
            if (this.isEmbeddedMode) {
                await this._addSpellToEmbedded(data);
                return;
            }
            return ui.notifications.warn("Can only drop embedded spells onto compendium spell lists.");
        }

        if (!data.uuid) return;

        // Embedded mode: add to system.spells
        if (this.isEmbeddedMode) {
            await this._addSpellToEmbedded(data);
            return;
        }

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

    /** Add spell to embedded system.spells (compendium) */
    async _addSpellToEmbedded(data) {
        let spellsToAdd = [];

        if (data.type === "EmbeddedSpell" && data.spellData) {
            spellsToAdd = [data.spellData];
        } else if (data.type === "Folder") {
            const folder = await fromUuid(data.uuid);
            if (!folder || folder.type !== "Item") return;
            spellsToAdd = folder.contents.filter(i => i.type === "spell");
        } else if (data.uuid) {
            const doc = await fromUuid(data.uuid);
            if (doc?.type === "spell") spellsToAdd = [doc];
        }

        if (!spellsToAdd.length) {
            ui.notifications.warn("No spells to add.");
            return;
        }

        const spells = [...(this.item.system.spells ?? [])];
        for (const spell of spellsToAdd) {
            const embedded = spell.system && !spell.uuid
                ? foundry.utils.duplicate(spell)
                : this._spellItemToEmbedded(spell);
            spells.push(embedded);
        }
        await this.item.update({ "system.spells": spells });
        ui.notifications.info(`${spellsToAdd.length} spell(s) added to ${this.item.name}.`);
    }

    /** Convert spell Item to embedded object */
    _spellItemToEmbedded(spell) {
        return {
            name: spell.name,
            img: spell.img ?? "",
            system: foundry.utils.duplicate(spell.system ?? {})
        };
    }

    /** Create new embedded spell - opens full spell sheet (same as spell from actor list) */
    async _createEmbeddedSpell() {
        const spells = this.item.system.spells ?? [];
        const maxLevel = spells.length > 0
            ? Math.max(...spells.map(s => parseInt(s.system?.level, 10) || 0))
            : 0;
        const defaultLevel = maxLevel + 1;

        const defaultSpell = {
            name: game.i18n.localize("rmss.spell.new_spell"),
            type: "spell",
            img: "systems/rmss/assets/default/spell.svg",
            system: {
                favorite: false,
                instant: false,
                level: defaultLevel,
                area_of_effect: "",
                duration: "",
                range: "",
                type: "U",
                subType: "-",
                attack_table: "",
                skillName: "",
                description: ""
            }
        };
        await this._openEmbeddedSpellSheet(defaultSpell, -1);
    }

    /** Edit embedded spell - opens full spell sheet (same as spell from actor list) */
    async _editEmbeddedSpell(idx) {
        const spells = this.item.system.spells ?? [];
        const spell = spells[idx];
        if (!spell) return;
        const spellData = {
            name: spell.name,
            type: "spell",
            img: spell.img ?? "icons/svg/mystery-man.svg",
            system: foundry.utils.duplicate(spell.system ?? {})
        };
        await this._openEmbeddedSpellSheet(spellData, idx);
    }

    /** Open the full spell sheet for create/edit embedded spell. Syncs back on save, cleans up on close. */
    async _openEmbeddedSpellSheet(spellData, idx) {
        const isCreate = idx < 0;
        const spellListUuid = this.item.uuid;

        const createData = foundry.utils.mergeObject(spellData, {
            flags: {
                rmss: {
                    embeddedSpellEdit: { spellListUuid, spellIndex: idx, isCreate }
                }
            }
        });
        const tempItem = await Item.create(createData);

        tempItem.sheet.render(true);
        this.render(false);
    }

    /** Delete embedded spell at index */
    async _deleteEmbeddedSpell(idx) {
        const spells = [...(this.item.system.spells ?? [])];
        const spell = spells[idx];
        if (!spell) return;
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("rmss.dialogs.confirm_delete_title"),
            content: game.i18n.format("rmss.dialogs.confirm_delete_spell_from_list", { name: spell.name }),
            defaultYes: false
        });
        if (confirmed) {
            spells.splice(idx, 1);
            await this.item.update({ "system.spells": spells });
            this.render(false);
        }
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