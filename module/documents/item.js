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
   * @private
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

      await macro.execute({
        item: this,
        actor: this.actor,
        token: this.actor?.getActiveTokens()?.[0]
      });
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
