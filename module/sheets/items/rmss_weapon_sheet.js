// Our Item Sheet extends the default

import ItemMacroEditor from "../../core/macros/item_macro_editor.js";


export default class RMSSWeaponSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-weapon-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".rmss-item-tabs", contentSelector: ".sheet-content", initial: "details" }],
      submitOnChange: true
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
    let secretDescription = await TextEditor.enrichHTML(this.item.system.description_secret, { async: true });

    // Get arms tables and sort by translated name
    let armsTables = await game.rmss?.attackTableIndex || [];
    armsTables = armsTables.sort((a, b) => {
      const nameA = game.i18n.localize(`rmss.attack_table.${a}`) || a;
      const nameB = game.i18n.localize(`rmss.attack_table.${b}`) || b;
      return nameA.localeCompare(nameB, game.i18n.lang);
    });

    // Get critical tables and sort by translated name
    let criticalTables = await game.rmss?.criticalTableIndex || [];
    criticalTables = criticalTables.sort((a, b) => {
      const nameA = game.i18n.localize(`rmss.critical_table.${a}`) || a;
      const nameB = game.i18n.localize(`rmss.critical_table.${b}`) || b;
      return nameA.localeCompare(nameB, game.i18n.lang);
    });

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
    const rmss_weapon_total = bonus;

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
      armsTables: armsTables,
      criticalTables: criticalTables,
      offensiveSkills: await this.getOffensiveSkills(),
      weaponTypes: CONFIG.weapons.type,
      materialsOptions,
      bonusEditable,
      magicalEditable,
      rmss_weapon_total,
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
