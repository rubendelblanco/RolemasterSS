export default class RMSSRaceSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 530,
            height: 440,
            template: "systems/rmss/templates/sheets/races/rmss-race-sheet.html",
            classes: ["rmss", "sheet", "race"]
        });
    }

    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/races/rmss-race-sheet.html";
    }

    async getData() {
        const baseData = await super.getData();

        //let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss
           // enrichedDescription: enrichedDescription
        };

        return sheetData;
    }
}