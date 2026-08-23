// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import ItemService from "../../actors/services/item_service.js";
import { bindItemTagsEditor, getItemTagListId, getItemTagsArray } from "./item_tags_ui.js";
import { isIdentityHidden, getUnidentifiedDisplayName } from "../../actors/utils/item_identity_util.js";
import { bindMacroDropZone } from "./macro_drop_util.js";

export default class RMSSHerbAndPoisonSheet extends ItemSheet {

  /** @override */
  get title() {
    if (isIdentityHidden(this.item)) return getUnidentifiedDisplayName(this.item);
    return super.title;
  }

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
    const system = baseData.item.system;
    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});
    let secretDescription = await TextEditor.enrichHTML(this.item.system.description_secret, {async: true});
    const identityHidden = isIdentityHidden(baseData.item);
    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      identityHidden,
      displayName: identityHidden ? getUnidentifiedDisplayName(baseData.item) : baseData.item.name,
      equipFieldName: null,
      equipLabelKey: null,
      equipChecked: false,
      system,
      itemTags: getItemTagsArray(system),
      itemTagListId: getItemTagListId(this.item),
      config: CONFIG.rmss,
      user: game.user,
      enrichedDescription: enrichedDescription,
      secretDescription: secretDescription
    };

    return sheetData;
  }

  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();

    if (this.isEditable && !isIdentityHidden(this.item)) {
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

  activateListeners(html) {
    super.activateListeners(html);
    bindItemTagsEditor(this, html);
    bindMacroDropZone(this, html);
  }
}
