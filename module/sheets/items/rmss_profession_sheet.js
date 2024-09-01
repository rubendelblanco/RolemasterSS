export default class RMSSProfessionSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
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

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: baseData.item.system,
            config: CONFIG.rmss
        };

        return sheetData;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.editor').each((_, editor) => {
            // Cuando se actualice el contenido, asegurar que se guarda el cambio.
            editor.addEventListener('input', () => {
                // Puedes gestionar cambios si es necesario
            });
        });

        html.find("#prime-stats").on( 'change', async ev => {
            const selectedTagsContainer = document.getElementById('prime-stats-selected');
            selectedTagsContainer.innerHTML = '';
            const selectedOptions = Array.from(ev.currentTarget.selectedOptions);
            console.log(selectedOptions);
            let selectedStats = '';

            selectedOptions.forEach(option => {
                selectedStats = selectedStats + ' ' + option.text;
            })

            console.log(selectedStats);
            selectedTagsContainer.innerHTML = selectedStats;

            //Array.from(this.selectedOptions).forEach(option => {
             //   console.log(option);
            //    selectedTagsContainer.appendChild(tag);
            //});
        });
    }
}