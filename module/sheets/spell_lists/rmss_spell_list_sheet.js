// Our Item Sheet extends the default
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

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss,
            enrichedDescription: enrichedDescription
        };

        return sheetData;
    }

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
            return ui.notifications.warn("Just spell items type can added.");
        }

        const spellList = this.item;
        const existingSpells = spellList.system.spells || [];
        const spellCoincidence =  existingSpells.filter(s => s._id === droppedSpell._id);

        if (spellCoincidence.length !== 0) {
            return ui.notifications.warn("This spell is already on the list");
        }

        await spellList.update({
            "system.spells": [...existingSpells, droppedSpell]
        });

        ui.notifications.info(`${droppedSpell.name} added to the list.`);
    }
}
