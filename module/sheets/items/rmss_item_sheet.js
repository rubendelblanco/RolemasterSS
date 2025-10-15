import ItemService from "../../actors/services/item_service.js";
import {ContainerHandler} from "../../actors/utils/container_handler.js";
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";

export default class RMSSItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-item-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }],
      submitOnChange: true
    });
  }

  async getData() {
    const base = await super.getData();
    const item = base.item;

    const enrichedDescription = await TextEditor.enrichHTML(item.system.description, { async: true });
    const handler = ContainerHandler.for(item);
    const contents = handler ? handler.contents : [];

    return {
      owner: item.isOwner,
      editable: this.isEditable,
      item,
      system: item.system,
      config: CONFIG.rmss,
      effects: item.getEmbeddedCollection("ActiveEffect").contents,
      enrichedDescription,
      contents
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // --- Effects ---
    html.find(".effect-control").click(this._onEffectControl.bind(this));

    // --- Containers ---
    html.find(".drop-target").on("drop", this._onDropItem.bind(this));
    html.find(".remove-from-container").click(ev => this._onRemoveFromContainer(ev));

    // --- Macro ---
    html.find(".shtick-type").change(ev => this._onShtickTypeChange(ev));

  }

  /** @override */
  async _updateObject(event, formData) {
    const normalizedData = ItemService.normalizeItemFormData(this.item, formData);
    return super._updateObject(event, normalizedData);
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

  _onEffectControl(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const effectId = event.currentTarget.closest("li")?.dataset.effectId;
    const effect = effectId ? this.item.effects.get(effectId) : null;

    switch (action) {
      case "create":
        return this.item.createEmbeddedDocuments("ActiveEffect", [{
          label: "New Effect",
          icon: "icons/svg/aura.svg",
          origin: this.item.uuid,
          disabled: true
        }]);
      case "edit":
        return effect?.sheet.render(true);
      case "delete":
        return effect?.delete();
    }
  }

  async _onShtickTypeChange(event) {
    await this._onSubmit(event);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
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
