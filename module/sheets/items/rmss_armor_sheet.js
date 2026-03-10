// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";

export default class RMSSArmorSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-armor-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".rmss-item-tabs", contentSelector: ".sheet-content", initial: "details" }],
      submitOnChange: true
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-armor-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});
    let secretDescription = await TextEditor.enrichHTML(this.item.system.description_secret, {async: true});

    const system = baseData.item.system;

    // Migrate old quality/magical to new material structure
    let material = system.material ?? "custom";
    let bonus = system.bonus ?? 0;
    let magical = system.magical ?? false;
    if (system.quality?.bonus !== undefined || system.magical?.bonus !== undefined) {
      const oldQuality = system.quality?.bonus ?? 0;
      const oldMagicalBonus = system.magical?.bonus ?? 0;
      material = "custom";
      bonus = oldQuality + oldMagicalBonus;
      magical = oldMagicalBonus !== 0;
    }

    const materials = CONFIG.rmss?.materials ?? {};
    const matDef = materials[material];
    const bonusEditable = material === "custom";
    const magicalEditable = material === "custom";
    const rmss_armor_total = bonus;

    const materialsOptions = Object.entries(materials).map(([key, def]) => ({
      key,
      label: game.i18n.localize(def.label),
      selected: material === key
    }));

    const enchantments = system.magic?.enchantments ?? [];
    const enchantmentList = enchantments.map((e) => ({
      ...e,
      spell: e.spell ?? "",
      level: e.level ?? "",
      bonus: e.bonus ?? ""
    }));

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: { ...system, material, bonus, magical },
      config: CONFIG.rmss,
      user: game.user,
      enrichedDescription: enrichedDescription,
      secretDescription: secretDescription,
      materialsOptions,
      bonusEditable,
      magicalEditable,
      rmss_armor_total,
      enchantmentList
    };

    return sheetData;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='delete-enchantment']").on("click", this._onDeleteEnchantment.bind(this));
  }

  async _updateObject(event, formData) {
    const material = formData["system.material"];
    if (material && material !== "custom") {
      const matDef = CONFIG.rmss?.materials?.[material];
      if (matDef) {
        formData["system.bonus"] = matDef.bonus;
        formData["system.magical"] = matDef.magical;
      }
    }
    return super._updateObject(event, formData);
  }

  _onDeleteEnchantment(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const enchantments = foundry.utils.duplicate(this.item.system.magic?.enchantments ?? []);
    enchantments.splice(index, 1);
    this.item.update({ "system.magic.enchantments": enchantments });
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
