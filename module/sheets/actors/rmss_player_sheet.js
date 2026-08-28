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
import { expandSpellListEmbeddedSpells } from "../../spells/spell_list_import.js";
import WeaponPreferenceDialog from "../../actors/dialogs/weapon_preference_dialog.js";
import StatAssignmentDialog from "../../actors/dialogs/stat_assignment_dialog.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";
import RaceService from "../../actors/services/race_service.js";
import { getEffectivePowerPointsMaxForSheet } from "../../actors/utils/power_points_util.js";

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
    // Do not call this.actor.prepareData() here: re-rendering the sheet would run preparation
    // again at the wrong time and Active Effects can stack incorrectly (inflated values on save
    // / refresh). super.getData() already uses the prepared actor.
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

    // Encumbrance: carried weight (only items marked "worn" count; equipped armor is exempt
    // like any worn clothing, but unequipped spare armor still counts; transports never count)
    // vs. the weight the character can carry with zero net Movement penalty once their
    // Strength-based negation (stat_bonus * 3) is factored in — i.e. base capacity (10% body
    // weight) times however many -8 tiers Strength fully cancels out. This is the number that
    // matters to the player, not the raw 10% figure. An item inside a container inherits the
    // container's own "worn" state (see actor.js#calculateEncumbrance for the full rationale).
    if (actorData.type === "character") {
      const bodyWeight = Number(context.system.role_traits?.weight);
      const capacity = Number.isFinite(bodyWeight) && bodyWeight > 0 ? bodyWeight * 0.10 : 0;
      const carriedWeight = this.actor.items.reduce((sum, item) => {
        if (item.type === "transport") return sum;
        if (item.type === "armor" && item.system?.equipped === true) return sum;

        const containerId = item.flags?.rmss?.containerId;
        if (containerId) {
          const container = this.actor.items.get(containerId);
          if (!container || container.type === "transport" || container.system?.worn !== true) return sum;
        } else if (item.system?.worn !== true) {
          return sum;
        }

        const w = Number(item.system?.weight);
        return sum + (Number.isFinite(w) ? w : 0);
      }, 0);
      const strBonus = Number(context.system.stats?.strength?.stat_bonus) || 0;
      const negation = Math.max(0, strBonus) * 3;
      const noPenaltyWeight = capacity * (Math.floor(negation / 8) + 1);
      const usedPercent = noPenaltyWeight > 0 ? Math.round((carriedWeight / noPenaltyWeight) * 100) : 0;
      context.encumbrance = {
        carriedWeight: Math.round(carriedWeight * 100) / 100,
        noPenaltyWeight: Math.round(noPenaltyWeight * 100) / 100,
        isConfigured: capacity > 0,
        isOverCapacity: usedPercent > 100,
        usedPercent,
        barPercent: Math.max(0, Math.min(100, usedPercent))
      };
    }

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

    if (itemData.type === "spell_list") {
      const spellListName = itemData.name;
      if (!this.actor.items.find(i => i.type === "skill" && i.name === spellListName)) {
        const created = await this._createSkillForSpellList(spellListName, itemData);
        if (!created) return;
      }
      const spellListData = foundry.utils.duplicate(itemData);
      delete spellListData._id;
      const created = await this.actor.createEmbeddedDocuments("Item", [spellListData]);
      const spellList = created[0];
      const count = await expandSpellListEmbeddedSpells(this.actor, spellList);
      ui.notifications.info(
        count > 0
          ? game.i18n.format("rmss.spell_lists.imported_with_spells", { name: spellList.name, count })
          : game.i18n.format("rmss.spell_lists.imported", { name: spellList.name })
      );
      return;
    }

    return super._onDropItem(event, data);
  }

  _prepareItems(context) {
    return ItemService.prepareItems(this.actor, context);
  }

  /**
   * When dropping a spell list without a matching skill, show dialog to create skill.
   * Uses the spell list's img and description for the new skill.
   * Returns the created skill or null if cancelled.
   * @param {string} spellListName
   * @param {Object} [spellListData] - The dropped spell list item data (for img, description)
   */
  async _createSkillForSpellList(spellListName, spellListData = null) {
    const actor = this.actor;
    const categories = actor.items.filter(i =>
      i.type === "skill_category" && i.system?.slug
    );
    if (categories.length === 0) {
      ui.notifications.warn(game.i18n.localize("rmss.spell_lists.no_skill_categories"));
      return null;
    }
    const spellCategories = categories.filter(c =>
      CONFIG.rmss?.skill_tab_by_slug?.[c.system.slug] === "spells"
    );
    const options = (spellCategories.length > 0 ? spellCategories : categories)
      .map(c => ({
        value: c.id,
        slug: c.system.slug,
        label: c.name
      }));

    return new Promise((resolve) => {
      new Dialog({
        title: game.i18n.format("rmss.spell_lists.create_skill_title", { name: spellListName }),
        content: `
          <form>
            <p>${game.i18n.format("rmss.spell_lists.create_skill_prompt", { name: spellListName })}</p>
            <div class="form-group">
              <label>${game.i18n.localize("rmss.spell_lists.skill_category")}</label>
              <select name="categoryId">
                ${options.map(o => `<option value="${o.value}" data-slug="${o.slug}">${o.label}</option>`).join("")}
              </select>
            </div>
          </form>`,
        buttons: {
          create: {
            icon: "<i class='fas fa-check'></i>",
            label: game.i18n.localize("Create"),
            callback: async (html) => {
              const categoryId = html.find("[name=categoryId]").val();
              const category = actor.items.get(categoryId);
              if (!category) {
                resolve(null);
                return;
              }
              const skillData = {
                name: spellListName,
                type: "skill",
                img: spellListData?.img ?? "systems/rmss/assets/default/skill.svg",
                system: {
                  category: category.id,
                  categorySlug: category.system.slug,
                  ranks: 0,
                  development_cost: category.system.development_cost ?? "0",
                  new_ranks: { value: 0, max: 3, max_default: 3 },
                  rank_bonus: -15,
                  category_bonus: 0,
                  item_bonus: 0,
                  special_bonus_1: 0,
                  special_bonus_2: 0,
                  total_bonus: 0,
                  favorite: false,
                  designation: "None",
                  offensive_skill: "none",
                  description: spellListData?.system?.description ?? ""
                }
              };
              const created = await actor.createEmbeddedDocuments("Item", [skillData]);
              resolve(created[0]);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: game.i18n.localize("Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "create"
      }).render(true);
    });
  }

  /** @override - Inject pp_development_progression when realm changes (single update, no flicker) */
  async _updateObject(event, formData) {
    const realm = formData["system.fixed_info.realm"];
    if (realm != null) {
      const progressions = foundry.utils.getProperty(this.actor.system, "race_stat_fixed_info.race_pp_progressions")
        ?? foundry.utils.getProperty(this.actor.system, "race_stat_fixed_info.race_stat_fixed_info.race_pp_progressions");
      if (progressions) {
        const source = { system: { progression: progressions } };
        const ppProg = RaceService.computePPDevelopmentProgression(source, realm);
        if (ppProg) formData["system.race_stat_fixed_info.pp_development_progression"] = ppProg;
      }
    }
    return super._updateObject(event, formData);
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
    this._registerStatAssignmentListener(html);
    this._registerStatListeners(html);

    // PC-specific auto-calculations (only for playable characters)
    // Auto-calculate total_db when armor_info values change
    this._registerArmorInfoListeners(html);
    
    // Auto-calculate quickness_bonus when any Quickness stat field that affects stat_bonus changes
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

    html.find(".long-rest-btn").on("click", (ev) => this._onLongRest(ev));
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

  _registerStatAssignmentListener(html) {
    html.find(".stat-assignment-open").click(ev => {
      ev.preventDefault();
      new StatAssignmentDialog(this.actor).render(true);
    });
  }

  _registerItemListeners(html) {
    super._registerItemListeners(html);
    html.find(".spell-cast").click(ev => this._onSpellCastClick(ev));
  }

  async _onSpellCastClick(ev) {
    ev.preventDefault();
    const spellId = ev.currentTarget.dataset.itemId;

    const spell = this.actor.items.get(spellId);
    if (!spell) return;

    const { spellListName, spellListRealm } = this._resolveSpellListCastContext(spell, ev.currentTarget.dataset);

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
    html.find(".stat-expand-toggle").click(ev => ev.currentTarget.closest("li.stat-row")?.classList.toggle("expanded"));
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
   * Registers listeners for Quickness fields that feed stat_bonus (temp → basic_bonus, racial, special).
   * quickness_bonus = stats.quickness.stat_bonus × 3 (same total as on the stat line).
   * @param {jQuery} html - The jQuery object containing the sheet HTML
   */
  _registerQuicknessBonusListener(html) {
    const fields = [
      "system.stats.quickness.temp",
      "system.stats.quickness.basic_bonus",
      "system.stats.quickness.racial_bonus",
      "system.stats.quickness.special_bonus"
    ];
    for (const name of fields) {
      html.find(`input[name="${name}"]`).on("change", async () => {
        await this._updateQuicknessBonus(html);
      });
    }
  }

  /**
   * quickness_bonus = (racial + special + basic_bonus) × 3 === stats.quickness.stat_bonus × 3 after prepareData().
   * Recalculates total_db using armor fields from the form when available.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
   */
  async _updateQuicknessBonus(html = null) {
    this.actor.prepareData();
    const quicknessBonus = (Number(this.actor.system.stats?.quickness?.stat_bonus) || 0) * 3;
    const totalDB = this._calculateTotalDB(html, quicknessBonus);
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
      this.actor.prepareData();
      quicknessBonus = (Number(this.actor.system.stats?.quickness?.stat_bonus) || 0) * 3;
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
   * based on constitution.stat_bonus.
   * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
   */
  async _updateConstitutionRecovery(html = null) {
    const statBonus = Number(this.actor.system.stats?.constitution?.stat_bonus) || 0;
    const recoverHitsPerHour = Math.ceil(statBonus / 2);
    const recoverHitsPerSleep = statBonus * 2;
    
    await this.actor.update({ 
      "system.race_stat_fixed_info.recover_hits_per_hour_resting": recoverHitsPerHour,
      "system.race_stat_fixed_info.recover_hits_per_sleep_cycle": recoverHitsPerSleep
    });
  }

  /**
   * Registers listeners for realm and stat changes to automatically
   * calculate and update recover_pp_per_hour_resting (recovery PP, not development).
   * @param {jQuery} html - The jQuery object containing the sheet HTML
   */
  _registerPowerPointRecoveryListener(html) {
    
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
    
    const empathyBonus = Number(stats.empathy?.stat_bonus) || 0;
    const intuitionBonus = Number(stats.intuition?.stat_bonus) || 0;
    const presenceBonus = Number(stats.presence?.stat_bonus) || 0;
    
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

  /**
   * Stat bonus of the primary realm stat for power point recovery (same logic as
   * _getPowerPointRecoveryBaseBonus, using total stat_bonus).
   * @returns {number}
   */
  _getRealmStatBonus() {
    return this._getPowerPointRecoveryBaseBonus();
  }

  /**
   * Open dialog to choose rest duration, then apply long rest recovery and daily resets.
   * @param {Event} event
   */
  _onLongRest(event) {
    event.preventDefault();
    if (!this.actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("DOCUMENT.UpdateRequiresOwnership"));
      return;
    }

    const title = game.i18n.localize("rmss.long_rest.dialog_title");
    const labelHours = game.i18n.localize("rmss.long_rest.dialog_hours");
    const btnLabel = game.i18n.localize("rmss.long_rest.confirm");

    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${labelHours}</label><input type="number" name="hours" value="6" min="1" step="1" data-dtype="Number"/></div></form>`,
      buttons: {
        rest: {
          icon: '<i class="fas fa-bed"></i>',
          label: btnLabel,
          callback: async (html) => {
            const hours = Number(html.find('[name="hours"]').val()) || 6;
            await this._performLongRest(hours);
          }
        }
      },
      default: "rest"
    }, { width: 320 }).render(true);
  }

  /**
   * Apply HP/PP recovery from a long rest, reset enchantments/spell adder via hook, whisper summary.
   * @param {number} hours
   */
  async _performLongRest(hours) {
    this.actor.prepareData();

    const intervals = Math.max(0, Math.floor(Number(hours) / 3));
    const conStatBonus = Number(this.actor.system.stats?.constitution?.stat_bonus) || 0;
    const realmStatBonus = this._getRealmStatBonus();

    const hits = this.actor.system.attributes?.hits || {};
    const hitsMax = Number(hits.max) || 0;
    const hitsCurrent = Number(hits.current) || 0;
    const hpRoom = Math.max(0, hitsMax - hitsCurrent);
    const hpRecovered = Math.min(hpRoom, conStatBonus * 2 * intervals);

    const pp = this.actor.system.attributes?.power_points || {};
    const ppCurrent = Number(pp.current) || 0;
    const ppMax = getEffectivePowerPointsMaxForSheet(this.actor);
    const ppRoom = Math.max(0, ppMax - ppCurrent);
    const ppRecovered = Math.min(ppRoom, realmStatBonus * 2 * intervals);

    await this.actor.update({
      "system.attributes.hits.current": hitsCurrent + hpRecovered,
      "system.attributes.power_points.current": ppCurrent + ppRecovered
    });

    const hookReturns = Hooks.callAll("rmssLongRest", this.actor);
    await Promise.all((hookReturns ?? []).filter((r) => r && typeof r.then === "function"));

    const whispers = new Set();
    (game.users ?? []).filter((u) => this.actor.testUserPermission(u, "OWNER")).forEach((u) => whispers.add(u.id));
    (game.users ?? []).filter((u) => u.isGM).forEach((u) => whispers.add(u.id));

    const hoursNum = Math.max(0, Math.floor(Number(hours)) || 0);
    const hoursUnitKey = hoursNum === 1 ? "rmss.long_rest.hour_unit" : "rmss.long_rest.hours_unit";
    const hoursUnit = game.i18n.localize(hoursUnitKey);
    const nameSafe = typeof foundry.utils?.escapeHTML === "function"
      ? foundry.utils.escapeHTML(this.actor.name)
      : this.actor.name;
    const summaryLine = game.i18n.format("rmss.long_rest.chat_message", {
      name: nameSafe,
      hours: hoursNum,
      hoursUnit
    });
    const imgSrc = this.actor.img;
    const portraitHtml = imgSrc
      ? `<img src="${imgSrc}" alt="" width="40" height="40" style="border-radius: 6px; border: 1px solid #333; object-fit: cover; flex-shrink: 0;" />`
      : "";
    const content = `<p class="rmss-long-rest-chat" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 0.35em 0;">${portraitHtml}<span>${summaryLine}</span></p>
            <p>${game.i18n.localize("rmss.long_rest.hits_recovered")}: ${hpRecovered}</p>
            <p>${game.i18n.localize("rmss.long_rest.pp_recovered")}: ${ppRecovered}</p>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      whisper: Array.from(whispers)
    });
  }
}
