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

        // Agregar evento de drop
        html[0].addEventListener("drop", this._onDropSpell.bind(this));
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
            return console.warn("Error al leer los datos arrastrados.", err);
        }

        if (!data || !data.uuid) return;

        const droppedSpell = await fromUuid(data.uuid);
        if (!droppedSpell || droppedSpell.type !== "spell") {
            return ui.notifications.warn("Solo puedes añadir hechizos a la lista.");
        }

        const spellList = this.item;
        const existingSpells = spellList.system.spells || [];

        if (existingSpells.includes(droppedSpell.id)) {
            return ui.notifications.warn("Este hechizo ya está en la lista.");
        }

        await spellList.update({
            "system.spells": [...existingSpells, droppedSpell]
        });

        ui.notifications.info(`Añadido ${droppedSpell.name} a la lista.`);
    }
}
