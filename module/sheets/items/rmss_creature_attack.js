// Our Item Sheet extends the default
import ItemMacroEditor from "../macros.js";

export default class RMSSCreatureAttackSheet extends ItemSheet {

    // Set the height and width
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 530,
            height: 440,
            template: "systems/rmss/templates/sheets/items/rmss-creature-attack-sheet.hbs",
            classes: ["rmss", "sheet", "item"]
        });
    }

    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/items/rmss-creature-attack-sheet.hbs";
    }

    // Make the data available to the sheet template
    async getData() {
        const baseData = await super.getData();
        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss,
            actorId: this.getActorId(),
            armsTables: await this.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.arms_tables),
        };

        return sheetData;
    }

    getActorId() {
        let actorId = null;
        if (this.item.parent instanceof Actor) {
            actorId = this.item.parent.id;
        }
        return actorId;
    }

    async getJSONFileNamesFromDirectory(directory) {
        // Open the file picker and retrieve the files from the specified directory
        const picker = await FilePicker.browse("data", directory);

        const jsonFilesObject = picker.files
            .filter(file => file.endsWith(".json"))
            .reduce((obj, file) => {
                const fileName = file.split('/').pop().replace(".json", "");
                obj[fileName] = fileName; // Create an entry where key and value are the same
                return obj;
            }, {});

        return jsonFilesObject;
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();

        if (this.isEditable) {
            buttons.unshift({
                label: "Macro",
                class: "item-macro-button",
                icon: "fas fa-code",
                onclick: ev => this._onOpenMacroEditor(ev)
            });
        }

        return buttons;
    }

    _onOpenMacroEditor(event) {
        new ItemMacroEditor(this.item).render(true);
    }
}
