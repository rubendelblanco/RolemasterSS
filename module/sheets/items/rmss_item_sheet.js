import ItemService from "../../actors/services/item_service.js";
import { bindContainerAllowedTagsEditor, getContainerAllowedTagListId, getContainerAllowedTagsArray } from "./container_allowed_tags_ui.js";
import { bindItemTagsEditor, getItemTagListId, getItemTagsArray } from "./item_tags_ui.js";
import { ContainerHandler } from "../../actors/utils/container_handler.js";
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import { castEnchantmentFromItem } from "./cast_enchantment_from_item.js";
import {
  buildEnchantmentList,
  buildSpellDataForStorage,
  getPowerModifierMode,
  normalizeEnchantments,
  onClearPowerModifierProfession,
  resolveProfessionName,
  setupPowerModifierProfessionDropZones
} from "./enchantment_utils.js";
import {
  buildPassiveModifiersListForSheet,
  getRrKeyOptionsForSheet,
  getStatKeyOptionsForSheet,
  mergePassiveModifiersFormData
} from "../../actors/services/passive_item_modifiers_service.js";
import { bindPassiveModifiersEditor } from "./passive_modifiers_ui.js";

export default class RMSSItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-item-sheet.html",
      classes: ["rmss", "sheet", "item"],
      tabs: [{ navSelector: ".rmss-item-tabs", contentSelector: ".sheet-body", initial: "details" }],
      submitOnChange: true
    });
  }

  async getData() {
    const base = await super.getData();
    const item = base.item;
    const system = item.system;

    const enrichedDescription = await TextEditor.enrichHTML(item.system.description, { async: true });
    const secretDescription = await TextEditor.enrichHTML(item.system.description_secret, { async: true });
    const handler = ContainerHandler.for(item);
    const contents = handler ? handler.contents : [];
    const containerStats = handler ? {
      usedValue: handler.usedValue,
      maxCapacity: handler.maxCapacity,
      usedPercent: handler.usedPercent,
      isOverCapacity: handler.isOverCapacity()
    } : null;

    // bonus_skills: [{ skill, skill_name, bonus }]. Migrate from old single bonus_skill/bonus_skill_name/bonus.
    let bonusSkillsList = this._getBonusSkillsArray();
    if (bonusSkillsList.length === 0 && (system.bonus_skill || system.bonus_skill_name)) {
      bonusSkillsList = [{
        skill: system.bonus_skill || "",
        skill_name: system.bonus_skill_name || system.bonus_skill || "",
        bonus: Number(system.bonus) || 0
      }];
    }
    bonusSkillsList = bonusSkillsList.map((e, idx) => ({
      skill: e.skill ?? "",
      skill_name: e.skill_name ?? "",
      bonus: Number(e.bonus) || 0,
      idx
    }));

    const enchantmentList = buildEnchantmentList(system.magic?.enchantments);
    const powerModifierMode = getPowerModifierMode(system);
    const ppMultiplierProfessionName = await resolveProfessionName(system.pp_multiplier_profession ?? "");
    const spellAdderProfessionName = await resolveProfessionName(system.spell_adder_profession ?? "");

    return {
      owner: item.isOwner,
      editable: this.isEditable,
      item,
      system,
      itemTags: getItemTagsArray(system),
      itemTagListId: getItemTagListId(item),
      containerAllowedTags: getContainerAllowedTagsArray(system),
      containerAllowedTagListId: getContainerAllowedTagListId(item),
      config: CONFIG.rmss,
      user: game.user,
      effects: item.getEmbeddedCollection("ActiveEffect").contents,
      enrichedDescription,
      secretDescription,
      contents,
      containerStats,
      bonusSkillsList,
      enchantmentList,
      weightCostMultiplier: item._getWeightReductionModifier?.() ?? 1,
      powerModifierMode,
      ppMultiplierProfessionName,
      spellAdderProfessionName,
      passiveModifiersList: buildPassiveModifiersListForSheet(system),
      statKeyOptions: getStatKeyOptionsForSheet(),
      rrKeyOptions: getRrKeyOptionsForSheet()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // --- Effects ---
    html.find(".effect-control").click(this._onEffectControl.bind(this));

    // --- Containers (only sheet-content drop-target, not modifiers/magic) ---
    html.find(".sheet-content.drop-target").on("drop", this._onDropItem.bind(this));
    html.find(".remove-from-container").click(ev => this._onRemoveFromContainer(ev));

    // --- Holy/Unholy mutually exclusive ---
    this._setupHolyUnholyExclusive(html);
    this._setupPPExclusive(html);
    setupPowerModifierProfessionDropZones(html, this);
    html.find("[data-action='clear-power-modifier-profession']").on("click", ev => onClearPowerModifierProfession(ev, this));
    // --- Bonus skill drop zones ---
    this._setupBonusSkillDropZones(html);
    // Bind to document: el html del sheet puede no incluir el tab Modifiers en algunas configuraciones
    $(document.body).off("mousedown.rmssRemoveBonusSkill");
    $(document.body).on("mousedown.rmssRemoveBonusSkill", ".rmss.sheet.item [data-action='remove-bonus-skill']", ev => {
      if (!this.rendered || !this.form?.contains(ev.target)) return;
      this._onRemoveBonusSkill(ev);
    });

    // --- Enchantments ---
    this._setupEnchantmentsDropZone(html);
    html.find("[data-action='delete-enchantment']").click(ev => this._onDeleteEnchantment(ev));
    html.find("[data-action='use-enchantment']").click(ev => this._onUseEnchantment(ev));
    html.find("[data-action='open-spell-link']").click(ev => this._onOpenSpellLink(ev));

    // --- Macro ---
    html.find(".shtick-type").change(ev => this._onShtickTypeChange(ev));

    bindItemTagsEditor(this, html);
    bindContainerAllowedTagsEditor(this, html);
    bindPassiveModifiersEditor(this, html);
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
    // Power modifier mode is now handled by a single select; no-op for backwards compat
  }

  _getBonusSkillsArray() {
    const raw = this.item.system?.bonus_skills;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      const keys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      return keys.map(k => {
        const e = raw[k];
        return { skill: e?.skill ?? "", skill_name: e?.skill_name ?? "", bonus: Number(e?.bonus) || 0 };
      });
    }
    return [];
  }

  _setupBonusSkillDropZones(html) {
    const zones = html.find(".rmss-bonus-skill-drop-zone");
    zones.each((_, el) => {
      el.addEventListener("dragover", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = "copy";
      });
      el.addEventListener("drop", ev => this._onDropSkill(ev));
    });
  }

  async _onDropSkill(event) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
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
    const isAddZone = zone.dataset.dropZone === "bonus-skill-add";
    const index = zone.dataset.index !== undefined ? parseInt(zone.dataset.index, 10) : null;

    const list = foundry.utils.duplicate(this._getBonusSkillsArray());
    const entry = { skill: slug, skill_name: name, bonus: 0 };

    if (isAddZone) {
      list.push(entry);
    } else if (Number.isInteger(index) && index >= 0 && index < list.length) {
      const existing = list[index];
      const hasSkill = (existing?.skill || existing?.skill_name)?.trim();
      if (hasSkill) {
        list.push(entry);
      } else {
        list[index] = { ...existing, skill: slug, skill_name: name, bonus: Number(existing?.bonus) || 0 };
      }
    } else {
      list.push(entry);
    }

    await this.item.update({ "system.bonus_skills": list });
    this.render(false);
  }

  async _onRemoveBonusSkill(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const btn = event.currentTarget;
    const index = parseInt(btn.dataset.index, 10);
    if (!Number.isInteger(index) || index < 0) return;
    const list = foundry.utils.duplicate(this._getBonusSkillsArray());
    list.splice(index, 1);
    await this.item.update({ "system.bonus_skills": list });
    this.render(false);
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

    let spellData = null;
    if (data.type === "EmbeddedSpell" && data.spellData) {
      const sd = data.spellData;
      spellName = sd.name ?? "";
      level = sd.system?.level ?? "";
      realm = data.realm ?? "";
      listType = data.listType ?? "";
      spellListName = data.spellListName ?? "";
      profession = data.profession ?? "";
      spellListUuid = data.spellListUuid ?? "";
      spellData = buildSpellDataForStorage(sd);
    } else if (data.uuid) {
      const doc = await fromUuid(data.uuid);
      if (!doc || doc.type !== "spell") {
        ui.notifications.warn(game.i18n.localize("rmss.item.enchantments_spell_only") || "Only spells can be dropped here.");
        return;
      }
      spellName = doc.name ?? "";
      level = doc.system?.level ?? "";
      spellUuid = data.uuid ?? "";
      spellData = buildSpellDataForStorage(doc);
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
      spellData: spellData || undefined,
      spellUuid: spellUuid || undefined,
      spellListUuid: spellListUuid || undefined,
      usage: "passive",
      usesPerDay: 1,
      usesRemaining: 1,
      chargesMax: 10,
      charges: 10,
      attackBonus: 0
    });
    await this.item.update({ "system.magic.enchantments": enchantments });
    this.render(false);
  }

  _mergeEnchantmentFormData(formData) {
    const prefix = "system.magic.enchantments.";
    const patchKeys = Object.keys(formData).filter(k => k.startsWith(prefix) && k !== "system.magic.enchantments");
    if (patchKeys.length === 0) return;

    const enchantments = foundry.utils.duplicate(normalizeEnchantments(this.item.system?.magic?.enchantments ?? []));
    for (const key of patchKeys) {
      const rest = key.slice(prefix.length);
      const dotPos = rest.indexOf(".");
      if (dotPos < 0) continue;
      const idx = parseInt(rest.slice(0, dotPos), 10);
      const field = rest.slice(dotPos + 1);
      if (!Number.isInteger(idx) || idx < 0 || idx >= enchantments.length) continue;
      let val = formData[key];
      if (["usesPerDay", "usesRemaining", "chargesMax", "charges", "attackBonus"].includes(field)) val = Number(val) || 0;
      enchantments[idx][field] = val;
      delete formData[key];
    }
    formData["system.magic.enchantments"] = enchantments;
  }

  _onDeleteEnchantment(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const enchantments = foundry.utils.duplicate(this.item.system.magic?.enchantments ?? []);
    enchantments.splice(index, 1);
    this.item.update({ "system.magic.enchantments": enchantments });
    this.render(false);
  }

  async _onUseEnchantment(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const actor = this.item.actor ?? this.item.parent;
    const { itemDeleted, applied } = await castEnchantmentFromItem(actor, this.item, index);
    if (itemDeleted) this.close();
    else if (applied) this.render(false);
  }

  async _onOpenSpellLink(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (doc?.sheet) doc.sheet.render(true);
  }

  /** @override */
  async _updateObject(event, formData) {
    // Holy and unholy are mutually exclusive
    if (formData["system.holy"] === true) formData["system.unholy"] = false;
    if (formData["system.unholy"] === true) formData["system.holy"] = false;

    // Power modifier mode: virtual field → real fields
    const mode = formData["system._powerModifierMode"];
    delete formData["system._powerModifierMode"];
    if (mode !== undefined) {
      if (mode === "multiplier") {
        if (formData["system.pp_multiplier"] === undefined) formData["system.pp_multiplier"] = 2;
        formData["system.spell_adder"] = 0;
        formData["system.spell_adder_realm"] = "";
      } else if (mode === "spell_adder") {
        if (formData["system.spell_adder"] === undefined) formData["system.spell_adder"] = 1;
        const adderVal = Number(formData["system.spell_adder"]) || 1;
        const currentRemaining = Number(this.item.system?.spell_adder_uses_remaining);
        if (!currentRemaining && currentRemaining !== 0 || Number(this.item.system?.spell_adder) <= 0) {
          formData["system.spell_adder_uses_remaining"] = adderVal;
        }
        formData["system.pp_multiplier"] = 1;
        formData["system.pp_multiplier_realm"] = "";
      } else {
        formData["system.pp_multiplier"] = 1;
        formData["system.pp_multiplier_realm"] = "";
        formData["system.spell_adder"] = 0;
        formData["system.spell_adder_realm"] = "";
      }
    }

    this._mergeEnchantmentFormData(formData);
    mergePassiveModifiersFormData(formData, this.item);
    const normalizedData = ItemService.normalizeItemFormData(this.item, formData);
    // Ensure bonus_skills is an array (form may submit object with numeric keys)
    const raw = normalizedData.system?.bonus_skills;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      normalizedData.system.bonus_skills = keys.map(k => {
        const e = raw[k];
        return {
          skill: e?.skill ?? "",
          skill_name: e?.skill_name ?? "",
          bonus: Number(e?.bonus) || 0
        };
      });
    }
    return super._updateObject(event, normalizedData);
  }

  async _onRemoveFromContainer(ev) {
    const itemId = ev.currentTarget.dataset.itemId;
    const containedItem = this.item.parent?.items.get(itemId);
    if (!containedItem) return;

    await containedItem.unsetFlag("rmss", "containerId");

    const handler = ContainerHandler.for(this.item);
    if (handler) {
      await handler.recalc();
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

    await handler.recalc();
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
          name: "New Effect",
          img: "icons/svg/aura.svg",
          origin: this.item.uuid,
          disabled: false,
          changes: [],
          duration: { startTime: game.time.worldTime }
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

  close(options = {}) {
    $(document.body).off("mousedown.rmssRemoveBonusSkill");
    return super.close(options);
  }
}
