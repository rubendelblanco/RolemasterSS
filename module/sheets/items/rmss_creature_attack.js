// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";

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
            armsTables: await game.rmss?.attackTableIndex || [],
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
