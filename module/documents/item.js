export class RMSSItem extends Item {

  /** @override */
  prepareData() {
    // Prepare data for the item. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  // Set the icon images for newly created images.
  async _preCreate(data, options, userId) {
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
  }

  _prepareSkillCategoryData(itemData) {
    if (itemData.type !== "skill_category") return;
    // Calculate Skill Category Total Bonus
    this.calculateSkillCategoryTotalBonus(itemData);
  }

  _prepareSkillData(itemData) {
    if (itemData.type !== "skill") return;
    // Make modifications to data here. For example:
    // const systemData = itemData.system;
    // Calculate Skill Category Bonus
    this.calculateSelectedSkillCategoryBonus(itemData);
    // Calculate Skill Total Bonus
    this.calculateSkillTotalBonus(itemData);
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
    if (this.isEmbedded === null) {
      console.log(`rmss | item.js | Skill ${this.name} has no owner. Not calculating Skill Category bonus`);
    }
    else
    {
      const items = this.parent?.items || [];
      console.log(`rmss | item.js | Skill ${this.name} has owner, calculating skill category bonus.`);
      for (const item of items) {
        if (item.type === "skill_category" && item._id === itemData.system.category) {
          console.log(`rmss | item.js | Calculating Skill Category bonus for skill: ${this.name}`);
          this.system.category_bonus = item.system.total_bonus;
          this.system.development_cost = item.system.development_cost;
        }
      }
    }
  }

  /**
   * Main entry point when the item is used.
   * Executes any assigned macro and triggers system hooks.
   */
  async use() {
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
   * @typedef {Object} SpellContextTargetRR
   * @property {string} name - Target name
   * @property {number} finalRR - RR value the target must roll above to resist
   * @property {number} targetLevel - Target level
   * @property {number} rrModifier - RR modifier from spell attack table
   * @property {string} subindex - Subindex display
   * @property {string} tokenId - Token document id
   * @property {string|null} tokenUuid - Token UUID for cross-scene lookup
   *
   * @typedef {Object} SpellContext
   * @property {SpellContextTargetRR[]} targetRRs - Targets with their RR values
   * @property {number} casterLevel - Caster level
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
