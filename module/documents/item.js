/**
 * @typedef {Object} SpellContextTargetRR
 * @property {string} name - Target name
 * @property {number} finalRR - RR value the target must roll above to resist
 * @property {number} targetLevel - Target level
 * @property {number} rrModifier - RR modifier from spell attack table
 * @property {string} subindex - Subindex display
 * @property {string} tokenId - Token document id
 * @property {string|null} tokenUuid - Token UUID for cross-scene lookup
 */

/**
 * @typedef {Object} SpellContext
 * @property {SpellContextTargetRR[]} targetRRs - Targets with their RR values
 * @property {number} casterLevel - Caster level
 */

import { normalizeTagArray } from "../sheets/items/item_tags_ui.js";

export class RMSSItem extends Item {

  /**
   * Effective unit cost = unitCost × material baseCostModifier × weight reduction modifier (Arms Law table 08-02).
   * For custom material, modifier is 1. Weight reduction uses % of min normal weight.
   */
  get effectiveUnitCost() {
    if (!["armor", "weapon", "item"].includes(this.type)) return Number(this.system.unitCost) || 0;
    const mat = CONFIG.rmss?.materials?.[this.system.material];
    const matMod = mat?.baseCostModifier ?? 1;
    const weightMod = this._getWeightReductionModifier();
    return (Number(this.system.unitCost) || 0) * matMod * weightMod;
  }

  /** Get weight reduction cost modifier from table 08-02 (Weight Decreases Due to Material and Design). */
  _getWeightReductionModifier() {
    return RMSSItem.getWeightModifierFromPercent(this.system.weight_percent);
  }

  /** Static: compute weight cost modifier from a raw percent value (for live UI updates). */
  static getWeightModifierFromPercent(percent) {
    const wr = CONFIG.rmss?.weight_reduction;
    if (!wr) return 1;
    const p = Number(percent) || 100;
    for (const entry of Object.values(wr)) {
      if (p >= entry.min && p <= entry.max) return entry.modifier;
    }
    return p >= 95 ? 1 : 500;
  }

  /** @override */
  prepareData() {
    // Prepare data for the item. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  async _preCreate(data, options, userId) {
    if (data.type === "weapon") {
      if (!data.system) data.system = {};
      const tags = normalizeTagArray(data.system.tags);
      if (!tags.some((t) => t.toLowerCase() === "weapon")) {
        tags.unshift("weapon");
      }
      data.system.tags = tags;
    }
    if (data.type === "herb_or_poison") {
      if (!data.system) data.system = {};
      const tags = normalizeTagArray(data.system.tags);
      if (!tags.some((t) => t.toLowerCase() === "herb")) {
        tags.unshift("herb");
      }
      data.system.tags = tags;
    }
    await super._preCreate(data, options, userId);
  }

  prepareDerivedData() {
    const itemData = this;
    const systemData = itemData.system;
    const flags = itemData.flags.rmss || {};

    // Transport items are always containers
    if (itemData.type === "transport") {
      if (!systemData.is_container) {
        systemData.is_container = true;
      }
      // Ensure container structure exists
      if (!systemData.container) {
        systemData.container = {
          maxCapacity: systemData.capacity || 0,
          usedCapacity: 0,
          capacityType: "weight",
          allowedTags: null
        };
      }
    }

    // Make separate methods for each item type to keep things organized.

    if (itemData.type === "skill") {
      this._prepareSkillCategoryData(itemData);
    }

    if (itemData.type === "skill") {
      this._prepareSkillData(itemData);
    }

    if (itemData.type === "armor") {
      this._prepareArmorData(itemData);
    }
  }

  _prepareArmorData(itemData) {
    if (itemData.type !== "armor") return;
    const sys = itemData.system;
    if (sys.armorSlot === undefined) {
      sys.armorSlot = sys.isShield === true ? "shield" : "body";
    }
    sys.isShield = sys.armorSlot === "shield";
  }

  _prepareSkillCategoryData(itemData) {
    if (itemData.type !== "skill_category") return;
    // Calculate Skill Category Total Bonus
    this.calculateSkillCategoryTotalBonus(itemData);
  }

  _prepareSkillData(itemData) {
    if (itemData.type !== "skill") return;
    // category_bonus / item_bonus / total_bonus: solo RMSSActor.calculateSkillBonuses()
    // tras preparar categorías (PJ, PNJ, criatura). Evita 2× trabajo por skill y cada
    // prepareData del actor (efectos, hoja, hooks) ya no duplica con el ítem.
  }

  calculateSkillCategoryTotalBonus(itemData) {
    if (this.type === "skill_category") {
      const systemData = itemData.system;
      itemData.system.total_bonus = Number(systemData.rank_bonus)
                                  + Number(systemData.stat_bonus)
                                  + Number(systemData.prof_bonus)
                                  + Number(systemData.special_bonus_1)
                                  + Number(systemData.special_bonus_2);
    }
  }

  calculateSkillTotalBonus(itemData) {
    if (this.type === "skill") {
      const systemData = itemData.system;
      itemData.system.total_bonus = Number(systemData.rank_bonus)
                                  + Number(systemData.category_bonus)
                                  + Number(systemData.item_bonus)
                                  + Number(systemData.special_bonus_1)
                                  + Number(systemData.special_bonus_2);
    }
  }

  calculateSelectedSkillCategoryBonus(itemData) {
    if (this.isEmbedded === null) return;
    const items = this.parent?.items || [];
    for (const item of items) {
      if (item.type === "skill_category" && item._id === itemData.system.category) {
        this.system.category_bonus = item.system.total_bonus;
        this.system.development_cost = item.system.development_cost;
      }
    }
  }

  /**
   * Main entry point when the item is used.
   * Executes any assigned macro and triggers system hooks.
   * For weapons: blocks use (including macro) if not equipped.
   */
  async use() {
    if (["weapon", "creature_attack"].includes(this.type)) {
      const EquipmentService = (await import("../actors/services/equipment_service.js")).default;
      if (!EquipmentService.isWeaponEquipped(this)) {
        ui.notifications.warn(game.i18n.localize("rmss.equipment.weapon_not_equipped"));
        return;
      }
    }

    // 1. Execute custom macro if present
    await this._executeItemMacro();

    // 2. Trigger system-wide hook for specific handlers
    Hooks.callAll("rmssItemUsed", this);
  }

  /**
   * Execute an embedded macro if the item defines one.
   * The macro receives: item, actor, token (caster), and optionally spellContext.
   *
   * @private
   *
   * Macro variables:
   * - item: this Item
   * - actor: owner actor
   * - token: caster's active token
   * - spellContext: {SpellContext|null} Set by Force (F) spells with targets before use().
   *   Use spellContext?.targetRRs to roll RR per target and apply effects (e.g. Sleep).
   *   null for non-Force spells or when no targets. Safe to ignore.
   */
  async _executeItemMacro() {
    const macroData = this.getFlag("rmss", "macro");
    if (!macroData || !macroData.command?.trim()) return;

    try {
      const macro = new Macro({
        name: macroData.name || `${this.name} Macro`,
        type: "script",
        command: macroData.command
      });

      const spellContext = game.rmss?.lastSpellContext ?? null;
      await macro.execute({
        item: this,
        actor: this.actor,
        token: this.actor?.getActiveTokens()?.[0],
        spellContext
      });
      if (game.rmss?.lastSpellContext) game.rmss.lastSpellContext = null;
    } catch (err) {
      console.error("Error executing item macro:", err);
      ui.notifications.error(`Macro error: ${err.message}`);
    }
  }

  static _getOwnerActor() {
    const ownerId = Object.keys(item.ownership).find(k => k !== "default");
    return game.actors.get(ownerId);
  }
}
