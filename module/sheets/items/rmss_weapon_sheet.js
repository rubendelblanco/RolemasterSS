// Our Item Sheet extends the default
export default class RMSSWeaponSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-weapon-sheet.html",
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-weapon-sheet.html";
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
      enrichedDescription: enrichedDescription,
      armsTables: await this.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.arms_tables),
      offensiveSkills: await this.getOffensiveSkills()
    };

    return sheetData;
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

  async getOffensiveSkills() {
    if (!this.object.parent) {
      return null
    }

    const offensiveSkills = this.actor.items
        .filter(item => item.type === "skill" && (item.system.offensive_skill !== "none" && item.system.offensive_skill !== ""))
        .map(item => ({ name: item.name, id: item.id }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return offensiveSkills;
  }

}
