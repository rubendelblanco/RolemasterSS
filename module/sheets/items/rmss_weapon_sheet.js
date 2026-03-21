// Our Item Sheet extends the default

import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";

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

    const bonusSkillsList = this._getBonusSkillsArray();

    const rawEnch = system.magic?.enchantments ?? [];
    const enchantments = Array.isArray(rawEnch)
      ? rawEnch
      : Object.keys(rawEnch).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map(k => rawEnch[k]);
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
      const spellLinkUuid = e.spellUuid || e.spellListUuid || "";
      const usage = e.usage ?? "passive";
      const usesPerDay = Number(e.usesPerDay) || 0;
      const usesRemaining = Number(e.usesRemaining) ?? usesPerDay;
      const chargesMax = Number(e.chargesMax) || 0;
      const charges = Number(e.charges) ?? chargesMax;
      const canUse = usage !== "passive" && (
        (usage === "daily" && usesRemaining > 0) ||
        (usage === "charged" && charges > 0) ||
        (usage === "single" && (charges > 0 || usesRemaining > 0))
      );
      const usageLabel = usage === "passive" ? (game.i18n.localize("rmss.item.enchantment_usage_passive") || "Passive") :
        usage === "daily" ? `${usesRemaining}/${usesPerDay}` :
        usage === "charged" ? `${charges}/${chargesMax}` :
        usage === "single" ? (charges > 0 ? `${charges}/1` : (usesRemaining > 0 ? `${usesRemaining}/1` : "0/1")) : "—";
      return {
        ...e,
        spell: e.spell ?? "",
        level: e.level ?? "",
        realmLabel: realm ? (CONFIG.rmss?.spell_realm?.[realm] || realm) : "—",
        listTypeLabel,
        spellListName: e.spellListName ?? "—",
        spellLinkUuid,
        usage,
        usesPerDay,
        usesRemaining,
        chargesMax,
        charges,
        canUse,
        usageLabel
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
      armsTables: armsTables,
      criticalTables: criticalTables,
      offensiveSkills: await this.getOffensiveSkills(),
      weaponTypes: CONFIG.weapons.type,
      materialsOptions,
      bonusEditable,
      magicalEditable,
      rmss_weapon_total,
      weightCostMultiplier: this.item._getWeightReductionModifier?.() ?? 1,
      bonusSkillsList,
      enchantmentList
    };

    return sheetData;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='delete-enchantment']").on("click", this._onDeleteEnchantment.bind(this));
    html.find("[data-action='use-enchantment']").on("click", this._onUseEnchantment.bind(this));
    html.find("[data-action='open-spell-link']").on("click", this._onOpenSpellLink.bind(this));
    html.find('input[name="system.weight_percent"]').on("input", this._onWeightPercentInput.bind(this));
    this._setupHolyUnholyExclusive(html);
    this._setupPPExclusive(html);
    this._setupBonusSkillDropZones(html);
    html.find("[data-action='remove-bonus-skill']").on("click", this._onRemoveBonusSkill.bind(this));
    this._setupEnchantmentsDropZone(html);
  }

  _getBonusSkillsArray() {
    const raw = this.item.system?.bonus_skills;
    if (Array.isArray(raw)) return raw.map((e, idx) => ({ skill: e?.skill ?? "", skill_name: e?.skill_name ?? "", bonus: Number(e?.bonus) || 0, idx }));
    if (raw && typeof raw === "object") {
      const keys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      return keys.map((k, idx) => {
        const e = raw[k];
        return { skill: e?.skill ?? "", skill_name: e?.skill_name ?? "", bonus: Number(e?.bonus) || 0, idx };
      });
    }
    return [];
  }

  _setupBonusSkillDropZones(html) {
    html.find(".rmss-bonus-skill-drop-zone").each((_, el) => {
      el.addEventListener("dragover", ev => { ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = "copy"; });
      el.addEventListener("drop", ev => this._onDropSkill(ev));
    });
  }

  async _onDropSkill(event) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
    if (!data?.uuid) return;
    const dropped = await fromUuid(data.uuid);
    if (!dropped || dropped.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("rmss.item.drop_skill_only"));
      return;
    }
    const slug = dropped.system?.slug || dropped.name || "";
    const name = dropped.name || slug;
    if (!slug) return;
    const zone = event.currentTarget;
    const isAddZone = zone.dataset?.dropZone === "bonus-skill-add";
    const index = zone.dataset?.index !== undefined ? parseInt(zone.dataset.index, 10) : null;
    const list = foundry.utils.duplicate(this._getBonusSkillsArray()).map(e => ({ skill: e.skill, skill_name: e.skill_name, bonus: e.bonus }));
    const entry = { skill: slug, skill_name: name, bonus: 0 };
    if (isAddZone) list.push(entry);
    else if (Number.isInteger(index) && index >= 0 && index < list.length) {
      const existing = list[index];
      if ((existing?.skill || existing?.skill_name)?.trim()) list.push(entry);
      else list[index] = { ...existing, skill: slug, skill_name: name, bonus: Number(existing?.bonus) || 0 };
    } else list.push(entry);
    await this.item.update({ "system.bonus_skills": list });
    this.render(false);
  }

  async _onRemoveBonusSkill(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index, 10);
    if (!Number.isInteger(idx) || idx < 0) return;
    const list = foundry.utils.duplicate(this._getBonusSkillsArray());
    list.splice(idx, 1);
    await this.item.update({ "system.bonus_skills": list.map(e => ({ skill: e.skill, skill_name: e.skill_name, bonus: e.bonus })) });
    this.render(false);
  }

  _setupHolyUnholyExclusive(html) {
    const holy = html.find('input[name="system.holy"]')[0];
    const unholy = html.find('input[name="system.unholy"]')[0];
    if (!holy || !unholy) return;
    const sync = (source) => {
      if (source.checked) {
        const other = source === holy ? unholy : holy;
        other.checked = false;
      }
    };
    holy.addEventListener("change", () => sync(holy));
    unholy.addEventListener("change", () => sync(unholy));
  }

  _setupPPExclusive(html) {
    const ppMult = html.find('input[name="system.pp_multiplier"]')[0];
    const spellAdd = html.find('input[name="system.spell_adder"]')[0];
    if (!ppMult || !spellAdd) return;
    const sync = () => {
      const mult = Number(ppMult.value) || 1;
      const add = Number(spellAdd.value) || 0;
      if (mult >= 2) {
        spellAdd.value = "0";
        const realm = html.find('select[name="system.spell_adder_realm"]')[0];
        if (realm) realm.value = "";
      } else if (add > 0) {
        ppMult.value = "1";
        const realm = html.find('select[name="system.pp_multiplier_realm"]')[0];
        if (realm) realm.value = "";
      }
    };
    ppMult.addEventListener("change", sync);
    spellAdd.addEventListener("change", sync);
  }

  _onWeightPercentInput(event) {
    const input = event.currentTarget;
    const percent = input.value;
    const modifier = this.item.constructor.getWeightModifierFromPercent(percent);
    const span = input.closest("td")?.querySelector(".rmss-weight-multiplier");
    if (span) span.textContent = `${modifier}×`;
  }

  async _onOpenSpellLink(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (doc?.sheet) doc.sheet.render(true);
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
    let spellUuid = "";
    let spellListUuid = "";

    if (data.type === "EmbeddedSpell" && data.spellData) {
      const sd = data.spellData;
      spellName = sd.name ?? "";
      level = sd.system?.level ?? "";
      realm = data.realm ?? "";
      listType = data.listType ?? "";
      spellListName = data.spellListName ?? "";
      profession = data.profession ?? "";
      spellListUuid = data.spellListUuid ?? "";
    } else if (data.uuid) {
      const doc = await fromUuid(data.uuid);
      if (!doc || doc.type !== "spell") {
        ui.notifications.warn(game.i18n.localize("rmss.item.enchantments_spell_only") || "Only spells can be dropped here.");
        return;
      }
      spellName = doc.name ?? "";
      level = doc.system?.level ?? "";
      spellUuid = data.uuid ?? "";
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
      realm,
      listType,
      spellListName,
      profession,
      spellUuid: spellUuid || undefined,
      spellListUuid: spellListUuid || undefined,
      usage: "passive",
      usesPerDay: 0,
      usesRemaining: 0,
      chargesMax: 0,
      charges: 0
    });
    await this.item.update({ "system.magic.enchantments": enchantments });
    this.render(false);
  }

  async _updateObject(event, formData) {
    // Holy and unholy are mutually exclusive
    if (formData["system.holy"] === true) formData["system.unholy"] = false;
    if (formData["system.unholy"] === true) formData["system.holy"] = false;

    // PP multiplier and spell adder are mutually exclusive
    const ppMult = Number(formData["system.pp_multiplier"]) || 1;
    const spellAdd = Number(formData["system.spell_adder"]) || 0;
    if (ppMult >= 2) {
      formData["system.spell_adder"] = 0;
      formData["system.spell_adder_realm"] = "";
    } else if (spellAdd > 0) {
      formData["system.pp_multiplier"] = 1;
      formData["system.pp_multiplier_realm"] = "";
    }

    const material = formData["system.material"];
    if (material && material !== "custom") {
      const matDef = CONFIG.rmss?.materials?.[material];
      if (matDef) {
        formData["system.bonus"] = matDef.bonus;
        formData["system.magical"] = matDef.magical;
        formData["system.quality"] = null;
      }
    }
    const raw = formData["system.bonus_skills"];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      formData["system.bonus_skills"] = keys.map(k => {
        const e = raw[k];
        return { skill: e?.skill ?? "", skill_name: e?.skill_name ?? "", bonus: Number(e?.bonus) || 0 };
      });
    }
    this._mergeEnchantmentFormData(formData);
    return super._updateObject(event, formData);
  }

  _mergeEnchantmentFormData(formData) {
    const prefix = "system.magic.enchantments.";
    const patchKeys = Object.keys(formData).filter(k => k.startsWith(prefix) && k !== "system.magic.enchantments");
    if (patchKeys.length === 0) return;

    const raw = this.item.system.magic?.enchantments ?? [];
    const enchantments = Array.isArray(raw)
      ? foundry.utils.duplicate(raw)
      : Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map(k => foundry.utils.duplicate(raw[k]));
    for (const key of patchKeys) {
      const rest = key.slice(prefix.length);
      const dotPos = rest.indexOf(".");
      if (dotPos < 0) continue;
      const idx = parseInt(rest.slice(0, dotPos), 10);
      const field = rest.slice(dotPos + 1);
      if (!Number.isInteger(idx) || idx < 0 || idx >= enchantments.length) continue;
      let val = formData[key];
      if (["usesPerDay", "usesRemaining", "chargesMax", "charges"].includes(field)) val = Number(val) || 0;
      enchantments[idx][field] = val;
      delete formData[key];
    }
    formData["system.magic.enchantments"] = enchantments;
  }

  _onDeleteEnchantment(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const enchantments = foundry.utils.duplicate(this.item.system.magic?.enchantments ?? []);
    enchantments.splice(index, 1);
    this.item.update({ "system.magic.enchantments": enchantments });
  }

  async _onUseEnchantment(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const enchantments = foundry.utils.duplicate(this.item.system.magic?.enchantments ?? []);
    const enchantment = enchantments[index];
    if (!enchantment) return;

    const actor = this.item.actor ?? this.item.parent;
    if (!actor || !(actor instanceof Actor)) {
      ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_need_actor") || "Item must be owned by an actor to use enchantment.");
      return;
    }

    let spellDoc = null;
    if (enchantment.spellUuid) spellDoc = await fromUuid(enchantment.spellUuid);
    if (!spellDoc || spellDoc.type !== "spell") {
      spellDoc = actor.items.find(i => i.type === "spell" && i.name === enchantment.spell);
    }
    if (!spellDoc || spellDoc.type !== "spell") {
      ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_spell_not_found") || "Spell not found.");
      return;
    }

    const spellListName = enchantment.spellListName || spellDoc.name;
    const spellListRealm = enchantment.realm || actor.system?.fixed_info?.realm || "essence";

    const fromEnchantmentOpt = { consumePowerPoints: false };
    if (spellDoc.system?.instant) {
      const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
      await InstantSpellService.castInstantSpell({ actor, spell: spellDoc, ...fromEnchantmentOpt });
    } else if (spellDoc.system?.type === "BE") {
      const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
      await BaseElementalSpellService.castBaseElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
    } else if (spellDoc.system?.type === "DE") {
      const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
      await DirectedElementalSpellService.castDirectedElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
    } else {
      await ForceSpellService.castForceSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
    }

    const usage = enchantment.usage ?? "passive";
    if (usage === "daily") {
      const r = Number(enchantment.usesRemaining) ?? Number(enchantment.usesPerDay) ?? 0;
      enchantment.usesRemaining = Math.max(0, r - 1);
    } else if (usage === "charged" || usage === "single") {
      const c = Number(enchantment.charges) ?? Number(enchantment.chargesMax) ?? 0;
      enchantment.charges = Math.max(0, c - 1);
    }
    enchantments[index] = enchantment;
    await this.item.update({ "system.magic.enchantments": enchantments });
    this.render(false);
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
