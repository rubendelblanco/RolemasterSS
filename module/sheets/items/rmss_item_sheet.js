// Our Item Sheet extends the default
export default class RMSSItemSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-item-sheet.html",
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-item-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();
    const item = await baseData.item;

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      effects: item.getEmbeddedCollection("ActiveEffect").contents,
      enrichedDescription: enrichedDescription
    };

    return sheetData;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (this.isEditable) {
      html.find(".effect-control").click(this._onEffectControl.bind(this));
      html.find(".shtick-type").change(this._onShtickTypeChange.bind(this));
    }
  }

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

  async _onShtickTypeChange(event) {
    await this._onSubmit(event);
    //this.item.update({ img: `systems/fs2e/icons/shticks/${this.item.data.data.type}.png` });
  }

}
