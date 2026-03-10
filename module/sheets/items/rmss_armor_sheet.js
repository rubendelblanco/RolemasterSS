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
    const enchantmentList = enchantments.map((e) => {
      const realm = e.realm ?? "";
      const listType = e.listType ?? "";
      const profession = e.profession ?? "";
      let listTypeLabel = "—";
      if (listType) {
        const isBase = ["base", "own_base", "other_base"].includes(listType);
        const label = isBase ? (CONFIG.rmss?.spell_list_type?.base || "Base") : (CONFIG.rmss?.spell_list_type?.[listType] || listType);
        listTypeLabel = (isBase && profession) ? `${label} (${profession})` : label;
      }
      return {
        ...e,
        spell: e.spell ?? "",
        level: e.level ?? "",
        bonus: e.bonus ?? "",
        realmLabel: realm ? (CONFIG.rmss?.spell_realm?.[realm] || realm) : "—",
        listTypeLabel,
        spellListName: e.spellListName ?? "—"
      };
    });

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
    this._setupEnchantmentsDropZone(html);
  }

  _setupEnchantmentsDropZone(html) {
    const zone = html.find(".rmss-enchantments-drop-zone")[0];
    if (!zone) return;
    zone.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "copy";
    });
    zone.addEventListener("drop", ev => this._onDropSpell(ev));
  }

  async _onDropSpell(event) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!data) return;

    let spellName = "";
    let level = "";
    let realm = "";
    let listType = "";
    let spellListName = "";
    let profession = "";

    if (data.type === "EmbeddedSpell" && data.spellData) {
      const sd = data.spellData;
      spellName = sd.name ?? "";
      level = sd.system?.level ?? "";
      realm = data.realm ?? "";
      listType = data.listType ?? "";
      spellListName = data.spellListName ?? "";
      profession = data.profession ?? "";
    } else if (data.uuid) {
      const doc = await fromUuid(data.uuid);
      if (!doc || doc.type !== "spell") {
        ui.notifications.warn(game.i18n.localize("rmss.item.enchantments_spell_only") || "Only spells can be dropped here.");
        return;
      }
      spellName = doc.name ?? "";
      level = doc.system?.level ?? "";
      const containerId = doc.flags?.rmss?.containerId;
      if (containerId && doc.parent?.items) {
        const spellList = doc.parent.items.get(containerId);
        if (spellList?.type === "spell_list") {
          realm = spellList.system?.realm ?? "";
          listType = spellList.system?.type ?? "";
          spellListName = spellList.name ?? "";
          profession = spellList.system?.profession ?? "";
        }
      }
    } else {
      return;
    }

    if (!spellName) return;

    const enchantments = foundry.utils.duplicate(this.item.system.magic?.enchantments ?? []);
    enchantments.push({
      spell: spellName,
      level: String(level),
      bonus: "",
      realm,
      listType,
      spellListName,
      profession
    });
    await this.item.update({ "system.magic.enchantments": enchantments });
    this.render(false);
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
