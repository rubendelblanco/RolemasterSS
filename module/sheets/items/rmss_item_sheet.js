import ItemMacroEditor from "../macros.js";
import { ContainerHandler } from "../container.js";

export default class RMSSItemSheet extends ItemSheet {

  // Default options for the item sheet
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-item-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }]
    });
  }

  get template() {
    return "systems/rmss/templates/sheets/items/rmss-item-sheet.html";
  }

  // Gather data to render the item sheet
  async getData() {
    const baseData = await super.getData();
    const item = baseData.item;
    const enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

    // Use container logic to gather contents
    let contents = [];
    const handler = ContainerHandler.for(this.item);

    if (handler) {
      contents = handler.contents;
    }

    return {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      effects: item.getEmbeddedCollection("ActiveEffect").contents,
      enrichedDescription,
      contents
    };
  }

  // Setup interactive listeners for UI elements
  activateListeners(html) {
    super.activateListeners(html);

    if (this.isEditable) {
      html.find(".effect-control").click(this._onEffectControl.bind(this));
      html.find(".shtick-type").change(this._onShtickTypeChange.bind(this));
      html.find(".drop-target").on("drop", this._onDropItem.bind(this));
    }

    // Handle removing an item from a container
    html.find(".remove-from-container").click(async ev => {
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.item.parent?.items.get(itemId);
      if (!item) return;

      // Remove item from container
      await item.unsetFlag("rmss", "containerId");

      // Recalculate used capacity
      const handler = ContainerHandler.for(this.item);
      if (handler) {
        const used = handler.usedValue;
        await this.item.update({ "system.container.usedCapacity": used });
      }

      // Re-render container sheet
      if (this.item.sheet.rendered) {
        this.item.sheet.render(false);
      }
    });
  }

  // Handle dropping an item onto a container
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

    // Validate item compatibility
    if (!handler.canAccept(sourceItem)) {
      ui.notifications.warn(`${this.item.name} cannot contain ${sourceItem.name}`);
      return;
    }

    // Validate space
    if (!handler.canFit(sourceItem)) {
      ui.notifications.error(`${this.item.name} is full and cannot contain ${sourceItem.name}.`);
      return;
    }

    // Case 1: item already belongs to this actor
    if (sourceItem.parent?.id === actor.id) {
      await sourceItem.setFlag("rmss", "containerId", this.item.id);
      await this.item.update({ "system.container.usedCapacity": handler.usedValue });
      if (this.item.sheet.rendered) this.item.sheet.render(false);
      return;
    }

    // Case 2: item comes from another actor/compendium
    const newItem = await actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
    await newItem[0].setFlag("rmss", "containerId", this.item.id);
    await this.item.update({ "system.container.usedCapacity": handler.usedValue });

    if (this.item.sheet.rendered) this.item.sheet.render(false);
  }

  // Handle effect button controls (create/edit/delete)
  _onEffectControl(event) {
    event.preventDefault();
    const owner = this.item;
    const a = event.currentTarget;
    const li = a.closest("li");
    const effect = li?.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;

    switch (a.dataset.action) {
      case "create":
        if (this.item.isEmbedded) {
          return ui.notifications.error("Managing embedded Documents which are not direct descendants of a primary Document is un-supported at this time.");
        }
        return owner.createEmbeddedDocuments("ActiveEffect", [{
          label: "New Effect",
          icon: "icons/svg/aura.svg",
          origin: owner.uuid,
          disabled: true
        }]);
      case "edit":
        return effect.sheet.render(true);
      case "delete":
        return effect.delete();
    }
  }

  // Update shtick type immediately
  async _onShtickTypeChange(event) {
    await this._onSubmit(event);
  }

  // Add custom header button for macro editor
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