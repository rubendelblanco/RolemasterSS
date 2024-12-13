import RMSSCharacterSheet from "./rmss_character_sheet.js";

export default class RMSSPlayerSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-npc-sheet.hbs",
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}