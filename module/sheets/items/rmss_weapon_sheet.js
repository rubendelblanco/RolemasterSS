// Our Item Sheet extends the default

import ItemMacroEditor from "../../core/macros/item_macro_editor.js";


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

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      enrichedDescription: enrichedDescription,
      armsTables: await game.rmss?.attackTableIndex || [],
      criticalTables: await game.rmss?.criticalTableIndex || [],
      offensiveSkills: await this.getOffensiveSkills()
    };

    console.log("------------------------------------------------------");
    console.log (sheetData);

    return sheetData;
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
  /** @override */
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

  /**
   * Abrir el editor de macro del item
   */
  _onOpenMacroEditor(event) {
    new ItemMacroEditor(this.item).render(true);
  }
}
