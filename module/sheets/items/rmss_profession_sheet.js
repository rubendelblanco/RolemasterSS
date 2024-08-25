export default class RMSSProfessionSheet extends ItemSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 620,
            height: 640,
            template: "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html",
            classes: ["rmss", "sheet", "profession"],
        });
    }


    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html";
    }

    async getData() {
        const baseData = await super.getData();
        const context = super.getData();

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss
        };

        this._prepareItems(context);

        return sheetData;
    }


    _prepareItems(context){
        console.log(context);
    }
}