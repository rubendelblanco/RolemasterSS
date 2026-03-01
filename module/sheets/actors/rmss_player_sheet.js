import ExperiencePointsCalculator from '../experience/rmss_experience_manager.js';
import { InputTextSearchStrategy } from '../search/rmss_text_search.js';
import RMSSCharacterSheet from "./rmss_character_sheet.js";
import SkillService from "../../actors/services/skill_service.js";
import ItemService from "../../actors/services/item_service.js";
import StatService from "../../actors/services/stat_service.js";
import SkillCategoryService from "../../actors/services/skill_category_service.js";
import SkillDropHandler from "../../actors/drop_handlers/skill_drop_handler.js";
import SkillCategoryDropHandler from "../../actors/drop_handlers/skill_category_drop_handler.js";
import RaceDropHandler from "../../actors/drop_handlers/race_drop_handler.js";
import ProfessionDropHandler from "../../actors/drop_handlers/profession_drop_handler.js";
import WeaponPreferenceDialog from "../../actors/dialogs/weapon_preference_dialog.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";

export default class RMSSPlayerSheet extends RMSSCharacterSheet {

  // Override Default Options, Set CSS Classes, Set Default Sheet, Set up Sheet Tabs
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 860,
      height: 780,
      template: "systems/rmss/templates/sheets/actors/rmss-character-sheet.html",
      classes: ["rmss", "sheet", "actor"],
      tabs: [
          { navSelector: ".sheet-tabs", contentSelector: ".sheet-body" },
          { navSelector: ".sub-tabs[data-group='skills-tabs']", contentSelector: ".tab.skills .sub-tab-content" },
          { navSelector: ".sub-tabs[data-group='equipment-tabs']", contentSelector: ".tab.equipment .sub-tab-content" }
      ]
    });
  }

  // Make the data available to the sheet template
  async getData() {
    // Retrieve base data from Foundry's ActorSheet
    let context = await super.getData();

    // Safe clone of the actor data for further operations
    const actorData = this.actor.toObject(false);

    // Enrich description text for HTML rendering
    const enrichedDescription = await TextEditor.enrichHTML(
        this.actor.system.description,
        { async: true }
    );

    // Attach actor system data and description to context
    context.system = actorData.system;
    context.enrichedDescription = enrichedDescription;

    // Active effects
    context.effects = this.actor.effects.contents;

    // Prepare character data and items (use ItemService instead of legacy)
    if (actorData.type === "character") {
      context = this._prepareItems(context);
    }

    // Calculate experience progress percentage
    const experiencePoints = parseInt(context.system?.attributes?.experience_points?.value) || 0;
    context.experienceProgress = ExperiencePointsCalculator.getExperienceProgress(experiencePoints);

    // Return the enriched context to the template
    return context;
  }


  // Override this method to check for duplicates when things are dragged to the sheet
  // We don't want duplicate skills and skill categories.
  async _onDropItem(event, data) {
    // Handle folder drop (multiple items)
    // Check if data.type is Folder, or parse from event if needed
    let dropData = data;
    if (!dropData && event?.dataTransfer) {
      try {
        dropData = JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch (err) {
        // Ignore parse errors
      }
    }

    if (dropData?.type === "Folder") {
      const folder = await fromUuid(dropData.uuid);
      if (!folder || folder.type !== "Item") {
        return super._onDropItem(event, data);
      }

      const skillCategoriesInFolder = folder.contents.filter(i => i.type === "skill_category");
      if (skillCategoriesInFolder.length > 0) {
        const handler = new SkillCategoryDropHandler(this.actor);
        for (const skillCategory of skillCategoriesInFolder) {
          const itemData = skillCategory.toObject();
          // Create a synthetic event/data for each item
          const syntheticData = { type: "Item", uuid: skillCategory.uuid };
          await handler.handle(itemData, event, syntheticData);
        }
        ui.notifications.info(`${skillCategoriesInFolder.length} skill categories added from folder "${folder.name}".`);
        return;
      }
    }

    const newItem = await Item.implementation.fromDropData(data);
    const itemData = newItem.toObject();

    if (itemData.type === "skill") {
      const handler = new SkillDropHandler(this.actor);
      return handler.handle(itemData);
    }

    if (itemData.type === "skill_category") {
      const handler = new SkillCategoryDropHandler(this.actor);
      return handler.handle(itemData, event, data);
    }

    if (itemData.type === "race") {
      const handler = new RaceDropHandler(this.actor).handle(itemData, event, data);
      return handler;
    }

    if (itemData.type === "profession") {
      const handler = new ProfessionDropHandler(this.actor);
      return handler.handle(itemData, event, data);
    }

    return super._onDropItem(event, data);
  }

  _prepareItems(context) {
    return ItemService.prepareItems(this.actor, context);
  }

  activateListeners(html) {
    super.activateListeners(html);
    ExperiencePointsCalculator.loadListeners(html, this.actor);

    Hooks.on("renderActorSheet", (app, html, data) => {
      InputTextSearchStrategy.create("mod-search-form-actor-skills").load(html);
    });
    Hooks.on("renderActorSheet", (app, html, data) => {
      InputTextSearchStrategy.create("mod-search-form-actor-skill-categories").load(html);
    });
    Hooks.on("renderActorSheet", (app, html, data) => {
      InputTextSearchStrategy.create("mod-search-form-actor-spells").load(html);
    });

    this._registerSkillListeners(html);
    this._registerWeaponPreferenceListener(html);
    this._registerStatListeners(html);

    // PC-specific auto-calculations (only for playable characters)
    // Auto-calculate total_db when armor_info values change
    this._registerArmorInfoListeners(html);
    
    // Auto-calculate quickness_bonus when quickness.basic_bonus changes
    this._registerQuicknessBonusListener(html);
    
    // Calculate quickness_bonus on initial load
    this._updateQuicknessBonus(html);
    
    // Auto-calculate recover_hits_per_hour_resting when constitution.basic_bonus changes
    this._registerConstitutionRecoveryListener(html);
    
    // Calculate recover_hits_per_hour_resting on initial load
    this._updateConstitutionRecovery(html);
    
    // Auto-calculate recover_pp_per_hour_resting when realm or relevant stats change
    this._registerPowerPointRecoveryListener(html);
    
    // Calculate recover_pp_per_hour_resting on initial load
    this._updatePowerPointRecovery(html);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;

    // Get the type of item to create.
    const type = header.dataset.type;

    // Grab any data associated with this control.
    const data = duplicate(header.dataset);

    // Initialize a default name.
    const name = `New ${type.capitalize()}`;

    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data.type;
    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  _registerSkillListeners(html) {
    html.find(".skill-newrank").click(ev => this._onSkillRankClick(ev));
    html.find(".skillcategory-newrank").click(ev => this._onSkillCategoryRankClick(ev));
  }

  _registerWeaponPreferenceListener(html) {
    html.find(".weapon-pref-assign").click(ev => {
      ev.preventDefault();
      new WeaponPreferenceDialog(this.actor).render(true);
    });
  }

  _registerItemListeners(html) {
    super._registerItemListeners(html);
    html.find(".spell-cast").click(ev => this._onSpellCastClick(ev));
  }

  async _onSpellCastClick(ev) {
    ev.preventDefault();
    const spellId = ev.currentTarget.dataset.itemId;
    const spellListName = ev.currentTarget.dataset.spellListName;
    const spellListRealm = ev.currentTarget.dataset.spellListRealm;
    
    const spell = this.actor.items.get(spellId);
    if (!spell) return;

    if (spell.system?.instant) {
      const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
      await InstantSpellService.castInstantSpell({ actor: this.actor, spell });
      return;
    }
    
    if (spell.system?.type === "BE") {
      const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
      await BaseElementalSpellService.castBaseElementalSpell({
        actor: this.actor,
        spell,
        spellListName,
        spellListRealm
      });
    } else if (spell.system?.type === "DE") {
      const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
      await DirectedElementalSpellService.castDirectedElementalSpell({
        actor: this.actor,
        spell,
        spellListName,
        spellListRealm
      });
    } else {
      await ForceSpellService.castForceSpell({
        actor: this.actor,
        spell,
        spellListName,
        spellListRealm
      });
    }
  }

  _registerStatListeners(html) {
    html.find(".fa-dice.roll-stat").click(ev => this._onStatRollClick(ev));
  }

  async _onStatRollClick(ev) {
    const clickedElement = ev.currentTarget;
    const parentLi = clickedElement.closest("li");
    const input = parentLi?.querySelector(".stat-pot");
    if (!input) return;

    await StatService.handleStatRoll(this.actor, clickedElement, input);
  }

  async _onSkillRankClick(ev) {
    if (!this.actor.system.levelUp.isLevelingUp) return;

    const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
    const category = this.actor.items.get(ev.currentTarget.dataset.categoryId);
    const clickedValue = ev.currentTarget.getAttribute("value");

    await SkillService.handleSkillRankClick(this.actor, item, category, clickedValue);
  }

  async _onSkillCategoryRankClick(ev) {
    if (!this.actor.system.levelUp.isLevelingUp) return;

    const itemId = ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    const clickedValue = ev.currentTarget.getAttribute("value");
    await SkillCategoryService.handleSkillCategoryRankClick(this.actor, item, clickedValue);
  }

  async _onItemFavoriteClick(ev) {
    const itemId = ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await ItemService.toggleFavorite(item);
  }

  async _onItemGiveClick(ev) {
    ev.preventDefault();
    const itemId = ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await ItemService.giveItem(this.actor, item);
  }

  async _onItemSplitClick(ev) {
    ev.preventDefault();
    const li = ev.currentTarget.closest("[data-item-id]");
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await ItemService.splitStack(this.actor, item);
  }

  async _onItemWearableClick(ev) {
    const itemId = ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await ItemService.toggleWorn(item);
  }

  /**
   * Registers a listener for quickness.basic_bonus changes to automatically
   * calculate and update quickness_bonus (basic_bonus * 3).
   * @param {jQuery} html - The jQuery object containing the sheet HTML
   */
  _registerQuicknessBonusListener(html) {
    html.find('input[name="system.stats.quickness.basic_bonus"]').on("change", async (ev) => {
      await this._updateQuicknessBonus(html);
    });
    
    html.find('input[name="system.stats.quickness.temp"]').on("change", async (ev) => {
      await this._updateQuicknessBonus(html);
    });
  }

  /**
   * Calculates and updates quickness_bonus based on quickness.basic_bonus * 3.
   * Also recalculates total_db in the same update to avoid flickering.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
   */
  async _updateQuicknessBonus(html = null) {
    const basicBonus = Number(this.actor.system.stats?.quickness?.basic_bonus) || 0;
    const quicknessBonus = basicBonus * 3;
    
    // Calculate total_db with the new quickness_bonus value
    const totalDB = this._calculateTotalDB(html, quicknessBonus);
    
    // Update both values in a single actor update to prevent flickering
    await this.actor.update({ 
      "system.armor_info.quickness_bonus": quicknessBonus,
      "system.armor_info.total_db": totalDB
    });
  }

  _registerArmorInfoListeners(html) {
    // Only fields from template.json lines 39-43 (excluding total_db and quickness_bonus which are calculated)
    const armorInfoFields = [
      "system.armor_info.quickness_penalty",
      "system.armor_info.adrenal_defense",
      "system.armor_info.shield_bonus",
      "system.armor_info.magic"
    ];

    armorInfoFields.forEach(fieldName => {
      html.find(`input[name="${fieldName}"]`).on("change", async (ev) => {
        const updates = {};
        
        // Special handling for quickness_penalty: convert negative to positive
        if (fieldName === "system.armor_info.quickness_penalty") {
          const value = Number(ev.currentTarget.value) || 0;
          if (value < 0) {
            const positiveValue = Math.abs(value);
            updates[fieldName] = positiveValue;
            ev.currentTarget.value = positiveValue;
          } else {
            updates[fieldName] = value;
          }
        } else {
          updates[fieldName] = Number(ev.currentTarget.value) || 0;
        }
        
        // Calculate total_db with the new values
        const totalDB = this._calculateTotalDB(html);
        updates["system.armor_info.total_db"] = totalDB;
        
        // Update all values in a single actor update to prevent flickering
        await this.actor.update(updates);
      });
    });
  }

  /**
   * Calculates the total_db value without updating the actor.
   * Used internally to calculate the value before updating.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional, falls back to actor data)
   * @param {number} quicknessBonusOverride - Optional override for quickness_bonus value
   * @returns {number} The calculated total_db value
   */
  _calculateTotalDB(html = null, quicknessBonusOverride = null) {
    // Parse values more carefully, handling empty strings and null/undefined
    const parseValue = (val) => {
      if (val === null || val === undefined || val === '') return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };
    
    let quicknessBonus, adrenalDefense, magic, shieldBonus, quicknessPenalty;
    
    // Use override if provided, otherwise calculate from actor data
    if (quicknessBonusOverride !== null) {
      quicknessBonus = quicknessBonusOverride;
    } else {
      const basicBonus = Number(this.actor.system.stats?.quickness?.basic_bonus) || 0;
      quicknessBonus = basicBonus * 3;
    }
    
    if (html) {
      // Read values directly from form inputs (current values before actor update)
      adrenalDefense = parseValue(html.find('input[name="system.armor_info.adrenal_defense"]').val());
      magic = parseValue(html.find('input[name="system.armor_info.magic"]').val());
      shieldBonus = parseValue(html.find('input[name="system.armor_info.shield_bonus"]').val());
      quicknessPenalty = parseValue(html.find('input[name="system.armor_info.quickness_penalty"]').val());
    } else {
      // Fallback to actor data if HTML not provided
      const armorInfo = this.actor.system.armor_info || {};
      adrenalDefense = parseValue(armorInfo.adrenal_defense);
      magic = parseValue(armorInfo.magic);
      shieldBonus = parseValue(armorInfo.shield_bonus);
      quicknessPenalty = parseValue(armorInfo.quickness_penalty);
    }
    
    // Sum only the fields from template.json lines 39-43
    // quickness_penalty subtracts (not adds)
    const total = quicknessBonus + adrenalDefense + magic + shieldBonus - quicknessPenalty;
    
    // Ensure total_db is never negative (minimum value is 0)
    return Math.max(0, total);
  }

  /**
   * Registers a listener for constitution.basic_bonus changes to automatically
   * calculate and update recover_hits_per_hour_resting (basic_bonus / 2, rounded up).
   * @param {jQuery} html - The jQuery object containing the sheet HTML
   */
  _registerConstitutionRecoveryListener(html) {
    html.find('input[name="system.stats.constitution.basic_bonus"]').on("change", async (ev) => {
      await this._updateConstitutionRecovery(html);
    });
    
    html.find('input[name="system.stats.constitution.temp"]').on("change", async (ev) => {
      await this._updateConstitutionRecovery(html);
    });
  }

  /**
   * Calculates and updates recover_hits_per_hour_resting and recover_hits_per_sleep_cycle
   * based on constitution.basic_bonus.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
   */
  async _updateConstitutionRecovery(html = null) {
    const basicBonus = Number(this.actor.system.stats?.constitution?.basic_bonus) || 0;
    const recoverHitsPerHour = Math.ceil(basicBonus / 2);
    const recoverHitsPerSleep = basicBonus * 2;
    
    await this.actor.update({ 
      "system.race_stat_fixed_info.recover_hits_per_hour_resting": recoverHitsPerHour,
      "system.race_stat_fixed_info.recover_hits_per_sleep_cycle": recoverHitsPerSleep
    });
  }

  /**
   * Registers listeners for realm and stat changes to automatically
   * calculate and update recover_pp_per_hour_resting.
   * @param {jQuery} html - The jQuery object containing the sheet HTML
   */
  _registerPowerPointRecoveryListener(html) {
    // Listen to realm changes
    html.find('select[name="system.fixed_info.realm"]').on("change", async (ev) => {
      await this._updatePowerPointRecovery(html);
    });
    
    // Listen to empathy, intuition, and presence basic_bonus and temp changes
    const relevantStats = ['empathy', 'intuition', 'presence'];
    relevantStats.forEach(statName => {
      html.find(`input[name="system.stats.${statName}.basic_bonus"]`).on("change", async (ev) => {
        await this._updatePowerPointRecovery(html);
      });
      
      html.find(`input[name="system.stats.${statName}.temp"]`).on("change", async (ev) => {
        await this._updatePowerPointRecovery(html);
      });
    });
  }

  /**
   * Calculates the base stat bonus for power point recovery based on the character's realm.
   * @returns {number} The base stat bonus value
   */
  _getPowerPointRecoveryBaseBonus() {
    const realm = this.actor.system.fixed_info?.realm || "";
    const stats = this.actor.system.stats || {};
    
    const empathyBonus = Number(stats.empathy?.basic_bonus) || 0;
    const intuitionBonus = Number(stats.intuition?.basic_bonus) || 0;
    const presenceBonus = Number(stats.presence?.basic_bonus) || 0;
    
    switch (realm) {
      case "essence":
        return empathyBonus;
      case "channeling":
        return intuitionBonus;
      case "mentalism":
        return presenceBonus;
      case "essence/channeling":
        return Math.ceil((empathyBonus + intuitionBonus) / 2);
      case "essence/mentalism":
        return Math.ceil((empathyBonus + presenceBonus) / 2);
      case "channeling/mentalism":
        return Math.ceil((intuitionBonus + presenceBonus) / 2);
      case "arcane":
        return Math.ceil((intuitionBonus + presenceBonus + empathyBonus) / 3);
      default:
        return 0;
    }
  }

  /**
   * Calculates and updates recover_pp_per_hour_resting and recover_pp_per_sleep_cycle
   * based on the character's realm and relevant stat bonuses.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
   */
  async _updatePowerPointRecovery(html = null) {
    const baseBonus = this._getPowerPointRecoveryBaseBonus();
    const recoverPPPerHour = Math.ceil(baseBonus / 2);
    const recoverPPPerSleep = baseBonus * 2;
    
    await this.actor.update({ 
      "system.race_stat_fixed_info.recover_pp_per_hour_resting": recoverPPPerHour,
      "system.race_stat_fixed_info.recover_pp_per_sleep_cycle": recoverPPPerSleep
    });
  }
}
