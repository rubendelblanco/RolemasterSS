// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import ItemService from "../../actors/services/item_service.js";

export default class RMSSHerbAndPoisonSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-herb-or-poison-sheet.html",
      classes: ["rmss", "sheet", "item"],
      submitOnChange: true
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    const normalizedData = ItemService.normalizeItemFormData(this.item, formData);
    return super._updateObject(event, normalizedData);
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-herb-or-poison-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();
    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});
    let secretDescription = await TextEditor.enrichHTML(this.item.system.description_secret, {async: true});
    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      user: game.user,
      enrichedDescription: enrichedDescription,
      secretDescription: secretDescription
    };

    return sheetData;
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
