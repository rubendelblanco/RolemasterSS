export default class RMSSProfessionSheet extends ItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 620,
            height: 640,
            template: "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html",
            classes: ["rmss", "sheet", "profession"]
        });
    }

    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html";
    }

    async getData() {
        const baseData = await super.getData();
        const context = super.getData();

        //let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

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

    async _updateObject(event, formData) {
        console.log("PROFESSION SKILL CATEGORIES");
        for (const item of this.game.items) {
            if (item.type === "skill_category") {
                item.delete();
            }
        }
        /*
        const pack = game.packs.get(formData.selectOptions);
        const skillCategoryData = await pack.getIndex();

        console.log("Importing New Skill Categories.");

        for (const sc of skillCategoryData) {
            const newitem = await pack.getDocument(sc._id);

            let newDocuments = [];
            if (newitem.type === "skill_category") {
                console.log(newitem);
                newDocuments.push(newitem);
            }
            if (newDocuments.length > 0) {
                await Item.createDocuments(newDocuments, {parent: this.character});
            }
        } */
    }

    activateListeners(html) {
        // Show Sheet Settings
        html.find(".import-skillcats").click(async ev => {
            let skillCategoriesPack = null;
            this.object.system.skills_category = [];
            this.object.update();

            for (const pack of game.packs) {
                if (pack.metadata.name === "skill_categories") {
                    skillCategoriesPack = pack;
                    break;
                }
            }

            for (let i of skillCategoriesPack.index) {
                this.object.system.skills_category.push({"name":i.name, "progression":""});
            }

            this.object.system.skills_category.sort(function(a, b) {
                if (a.name < b.name) {
                    return -1;
                }
                if (a.name > b.name) {
                    return 1;
                }
                return 0;
            });

           this.object.update();

        });
    }

    _prepareItems(context){
        console.log(context);
    }
}