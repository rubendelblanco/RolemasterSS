// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import {ContainerHandler} from "../../actors/utils/container_handler.js";

export default class RMSSTransportSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-transport-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }],
      submitOnChange: true
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-transport-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();
    const item = baseData.item;

    let enrichedDescription = await TextEditor.enrichHTML(item.system.description, {async: true});
    const handler = ContainerHandler.for(item);
    const contents = handler ? handler.contents : [];

    let sheetData = {
      owner: item.isOwner,
      editable: this.isEditable,
      item: item,
      system: item.system,
      config: CONFIG.rmss,
      enrichedDescription: enrichedDescription,
      contents: contents
    };

    return sheetData;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // --- Containers ---
    html.find(".drop-target").on("drop", this._onDropItem.bind(this));
    html.find(".remove-from-container").click(ev => this._onRemoveFromContainer(ev));
  }

  async _onRemoveFromContainer(ev) {
    const itemId = ev.currentTarget.dataset.itemId;
    const containedItem = this.item.parent?.items.get(itemId);
    if (!containedItem) return;

    await containedItem.unsetFlag("rmss", "containerId");

    const handler = ContainerHandler.for(this.item);
    if (handler) {
      await this.item.update({ "system.container.usedCapacity": handler.usedValue });
    }

    this.render(false);
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = JSON.parse(event.originalEvent.dataTransfer.getData("text/plain"));
    if (data.type !== "Item") return;

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    const actor = this.item.parent;
    if (!actor) return;

    const handler = ContainerHandler.for(this.item);
    if (!handler) return;

    if (!handler.canAccept(sourceItem)) {
      return ui.notifications.warn(`${this.item.name} cannot contain ${sourceItem.name}`);
    }

    if (!handler.canFit(sourceItem)) {
      return ui.notifications.error(`${this.item.name} is full and cannot contain ${sourceItem.name}.`);
    }

    if (sourceItem.parent?.id === actor.id) {
      await sourceItem.setFlag("rmss", "containerId", this.item.id);
    } else {
      const newItem = await actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
      await newItem[0].setFlag("rmss", "containerId", this.item.id);
    }

    await this.item.update({ "system.container.usedCapacity": handler.usedValue });
    this.render(false);
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
