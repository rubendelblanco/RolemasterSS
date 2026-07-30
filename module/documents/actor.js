import EquipmentService from "../actors/services/equipment_service.js";

export class RMSSActor extends Actor {

  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  prepareDerivedData() {
    const actorData = this;
    const systemData = actorData.system;
    const flags = actorData.flags.rmss || {};

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
    this._prepareCreatureData(actorData);
  }

  /**
   * Prepare Character specific data.
   * @param {Actor} actorData The NPC Object to prepare data for
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== "character") return;

    // Calculate basic bonus
    this.calculateBasicBonuses(actorData);

    // Calculate Stat Bonuses for the Actor
    this.calculateStatBonuses(actorData);

    // Calculate Movement Rate penalty from carried weight (needs strength.stat_bonus above)
    this.calculateEncumbrance(actorData);

    // Calculate Resistance Rolls for the Actor
    this.calculateResistanceRolls(actorData);

    // Iterate through and apply Stat bonuses for Skill Category Items
    this.calculateSkillCategoryStatBonuses();

    // Iterate through and apply Skill Category Bonuses for Skill items
    this.calculateSkillBonuses();
  }

  /**
   * Prepare NPC specific data.
   * @param {Actor} actorData The NPC Object to prepare data for
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== "npc") return;

    this.calculateSkillBonuses();

    // Make modifications to data here. For example:
    const data = actorData.system;
  }

  /**
   * Criaturas: mismo orden que PJ (categorías → habilidades), sin paso duplicado en Item.prepareDerivedData.
   * @param {Actor} actorData
   */
  _prepareCreatureData(actorData) {
    if (actorData.type !== "creature") return;
    this.calculateSkillCategoryStatBonuses();
    this.calculateSkillBonuses();
  }

  _getStatBasicBonusFromTable(value){
    var statsTable = {
      "102": 14,
      "101": 12,
      "100": 10,
      "98-99": 9,
      "96-97": 8,
      "94-95": 7,
      "92-93": 6,
      "90-91": 5,
      "85-89": 4,
      "80-84": 3,
      "75-79": 2,
      "70-74": 1,
      "31-69": 0,
      "26-30": -1,
      "21-25": -2,
      "16-20": -3,
      "11-15": -4,
      "10": -5,
      "08-09": -6,
      "06-07": -7,
      "04-05": -8,
      "02-03": -9,
      "01": -10
    }

    for (var range in statsTable) {
      var limits = range.split('-');
      var min = parseInt(limits[0], 10);
      var max = limits.length > 1 ? parseInt(limits[1], 10) : min;

      if (value >= min && value <= max) {
        return statsTable[range];
      }

      if (value <= 0) return 0
      if (value > 102) return 14
    }
  }

  calculateBasicBonuses(actorData) {
    const systemData = actorData.system;
    actorData.system.stats.agility.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.agility.temp);
    actorData.system.stats.constitution.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.constitution.temp);
    actorData.system.stats.memory.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.memory.temp);
    actorData.system.stats.reasoning.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.reasoning.temp);
    actorData.system.stats.self_discipline.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.self_discipline.temp);
    actorData.system.stats.empathy.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.empathy.temp);
    actorData.system.stats.intuition.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.intuition.temp);
    actorData.system.stats.presence.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.presence.temp);
    actorData.system.stats.quickness.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.quickness.temp);
    actorData.system.stats.strength.basic_bonus = this._getStatBasicBonusFromTable(systemData.stats.strength.temp);
  }

  // Tally each stat bonus and populate the total field.
  calculateStatBonuses(actorData) {
    const systemData = actorData.system;

    actorData.system.stats.agility.stat_bonus = Number(systemData.stats.agility.racial_bonus)
                                              + Number(systemData.stats.agility.special_bonus)
                                              + Number(systemData.stats.agility.basic_bonus);

    actorData.system.stats.constitution.stat_bonus = Number(systemData.stats.constitution.racial_bonus)
                                                   + Number(systemData.stats.constitution.special_bonus)
                                                   + Number(systemData.stats.constitution.basic_bonus);

    actorData.system.stats.memory.stat_bonus = Number(systemData.stats.memory.racial_bonus)
                                             + Number(systemData.stats.memory.special_bonus)
                                             + Number(systemData.stats.memory.basic_bonus);

    actorData.system.stats.reasoning.stat_bonus = Number(systemData.stats.reasoning.racial_bonus)
                                                + Number(systemData.stats.reasoning.special_bonus)
                                                + Number(systemData.stats.reasoning.basic_bonus);


    actorData.system.stats.self_discipline.stat_bonus = Number(systemData.stats.self_discipline.racial_bonus)
                                                      + Number(systemData.stats.self_discipline.special_bonus)
                                                      + Number(systemData.stats.self_discipline.basic_bonus);

    actorData.system.stats.empathy.stat_bonus = Number(systemData.stats.empathy.racial_bonus)
                                              + Number(systemData.stats.empathy.special_bonus)
                                              + Number(systemData.stats.empathy.basic_bonus);

    actorData.system.stats.intuition.stat_bonus = Number(systemData.stats.intuition.racial_bonus)
                                                + Number(systemData.stats.intuition.special_bonus)
                                                + Number(systemData.stats.intuition.basic_bonus);

    actorData.system.stats.presence.stat_bonus = Number(systemData.stats.presence.racial_bonus)
                                               + Number(systemData.stats.presence.special_bonus)
                                               + Number(systemData.stats.presence.basic_bonus);

    actorData.system.stats.quickness.stat_bonus = Number(systemData.stats.quickness.racial_bonus)
                                                + Number(systemData.stats.quickness.special_bonus)
                                                + Number(systemData.stats.quickness.basic_bonus);

    actorData.system.stats.strength.stat_bonus = Number(systemData.stats.strength.racial_bonus)
                                               + Number(systemData.stats.strength.special_bonus)
                                               + Number(systemData.stats.strength.basic_bonus);
  }

  // Weight penalty (encumbrance): carrying more than 10% of body weight (only items marked
  // "worn" count; armor you have equipped is exempt like any worn clothing, but unequipped
  // spare armor still counts; transports never count, and items stashed inside a transport
  // are carried by the mount, not the character) penalizes Movement Rate in steps of -8 per
  // multiple of capacity exceeded, reduced by Strength stat_bonus * 3. Characters only.
  calculateEncumbrance(actorData) {
    const move = actorData.system.attributes?.movement_rate;
    if (!move) return;

    const bodyWeight = Number(actorData.system.role_traits?.weight);
    if (!Number.isFinite(bodyWeight) || bodyWeight <= 0) {
      move.weight_penalty = 0;
      move.effective_value = Number(move.value) || 0;
      return;
    }

    const capacity = bodyWeight * 0.10;
    const carriedWeight = actorData.items.reduce((sum, item) => {
      if (item.type === "transport" || item.system?.worn !== true) return sum;
      if (item.type === "armor" && item.system?.equipped === true) return sum;
      const containerId = item.flags?.rmss?.containerId;
      if (containerId && actorData.items.get(containerId)?.type === "transport") return sum;
      const w = Number(item.system?.weight);
      return sum + (Number.isFinite(w) ? w : 0);
    }, 0);

    const ratio = carriedWeight / capacity;
    const tier = ratio > 1 ? Math.ceil(ratio) - 1 : 0;
    const rawPenalty = tier * 8;

    const strBonus = Number(actorData.system.stats?.strength?.stat_bonus) || 0;
    const negation = Math.max(0, strBonus) * 3;
    const finalPenalty = Math.max(0, rawPenalty - negation);

    move.weight_penalty = finalPenalty;
    move.effective_value = Math.max(0, (Number(move.value) || 0) - finalPenalty);
  }

  // Calculate each Resistance Roll with the formula on the character sheet.
  calculateResistanceRolls(actorData) {
    const stats = actorData.system.stats;
    const rolls = actorData.system.resistance_rolls;

    const configs = [
      { key: "essence", value: () => stats.empathy.stat_bonus * 3 },
      { key: "channeling", value: () => stats.intuition.stat_bonus * 3 },
      { key: "mentalism", value: () => stats.presence.stat_bonus * 3 },
      { key: "fear", value: () => stats.self_discipline.stat_bonus * 3 },
      { key: "poison", value: () => stats.constitution.stat_bonus * 3, noRaceMod: true },
      { key: "disease", value: () => stats.constitution.stat_bonus * 3, noRaceMod: true },
      { key: "chann_ess", value: () => stats.intuition.stat_bonus + stats.empathy.stat_bonus },
      { key: "chann_ment", value: () => stats.intuition.stat_bonus + stats.presence.stat_bonus },
      { key: "ess_ment", value: () => stats.empathy.stat_bonus + stats.presence.stat_bonus },
      { key: "arcane", value: () => stats.empathy.stat_bonus + stats.intuition.stat_bonus + stats.presence.stat_bonus },
    ];

    for (const { key, value, noRaceMod } of configs) {
      const val = Number(value());
      rolls[key].value = val;
      rolls[key].total = val + (noRaceMod ? 0 : rolls[key].race_mod);
    }
  }

  calculateSkillBonuses() {
    const profession = this.items.find(i => i.type === "profession");
    const skillBonuses = (profession?.system?.professionBonuses ?? []).filter(b => b.type === "skill");
    const bonusBySkillName = Object.fromEntries(skillBonuses.map(b => [b.slug, Number(b.bonus) || 0]));

    const equippedWeapons = EquipmentService.getEquippedWeapons(this);
    const weaponBonusBySkillId = {};
    if (equippedWeapons.length === 1) {
      const weapon = equippedWeapons[0];
      const skillId = weapon.system?.offensive_skill;
      const bonus = Number(weapon.system?.bonus) || 0;
      if (skillId && bonus !== 0) {
        weaponBonusBySkillId[skillId] = bonus;
      }
    } else if (equippedWeapons.length === 2) {
      const skills = equippedWeapons.map(w => (w.system?.offensive_skill || "").trim()).filter(Boolean);
      const uniqueSkills = [...new Set(skills)];
      if (uniqueSkills.length === 2) {
        equippedWeapons.forEach(weapon => {
          const skillId = weapon.system?.offensive_skill;
          const bonus = Number(weapon.system?.bonus) || 0;
          if (skillId && bonus !== 0) {
            weaponBonusBySkillId[skillId] = (weaponBonusBySkillId[skillId] || 0) + bonus;
          }
        });
      }
    }

    // Gear (item worn), armor (equipped), weapon (equipped) that grant bonus to skills
    const gearBonusBySkillSlug = {};
    const gearBonusBySkillName = {};
    const normalizeBonusEntries = (raw) => {
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") {
        const keys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        return keys.map(k => raw[k]);
      }
      return [];
    };
    const addBonusSkillsFromItem = (item) => {
      const raw = item.system.bonus_skills ?? (item.system.bonus_skill ? [{ skill: item.system.bonus_skill, skill_name: item.system.bonus_skill_name || "", bonus: Number(item.system.bonus) || 0 }] : []);
      const entries = normalizeBonusEntries(raw);
      for (const e of entries) {
        const bonus = Number(e?.bonus) || 0;
        if (bonus === 0) continue;
        const slug = (e?.skill || "").trim();
        const name = (e?.skill_name || "").trim();
        if (slug) gearBonusBySkillSlug[slug] = (gearBonusBySkillSlug[slug] || 0) + bonus;
        if (name) gearBonusBySkillName[name] = (gearBonusBySkillName[name] || 0) + bonus;
      }
    };
    for (const gear of this.items) {
      if (gear.type === "item" && gear.system?.worn) addBonusSkillsFromItem(gear);
      else if (gear.type === "armor" && gear.system?.equipped) addBonusSkillsFromItem(gear);
      else if (gear.type === "weapon" && gear.system?.equipped) addBonusSkillsFromItem(gear);
    }


    for (const item of this.items) {
      if (item.type === "skill") {
        const profBonus = bonusBySkillName[item.name] ?? 0;
        const weaponBonus = weaponBonusBySkillId[item.id ?? item._id] ?? 0;
        const skillSlug = (item.system?.slug || "").trim();
        const skillName = (item.name || "").trim();
        const gearBonus = gearBonusBySkillSlug[skillSlug] ?? gearBonusBySkillName[skillName] ?? 0;
        item.system.item_bonus = profBonus + weaponBonus + gearBonus;
        item.calculateSelectedSkillCategoryBonus(item);
        item.calculateSkillTotalBonus(item);
      }
    }
  }

  // Tallys the bonus for each Stat that is applicable to the Skill Category and then updates the total
  calculateSkillCategoryStatBonuses() {
    for (const item of this.items) {
      if (item.type === "skill_category") {

        // Get all the applicable stats for this skill category
        let app_stat_1 = item.system.app_stat_1;
        let app_stat_2 = item.system.app_stat_2;
        let app_stat_3 = item.system.app_stat_3;

        // If the first one is None we don't need to do anything further
        if (app_stat_1 === "None") {
          continue;
        }

        let applicable_stat_bonus = 0;
        let app_stat_1_found = false;
        let app_stat_2_found = false;
        let app_stat_3_found = false;

        // Iterate through the applicable stats and find their full names
        for (const stat in CONFIG.rmss.stats) {
          if (app_stat_1 === CONFIG.rmss.stats[stat].shortname) {
            app_stat_1_found = true;
            applicable_stat_bonus = applicable_stat_bonus + this.system.stats[stat].stat_bonus;
          }
          if (app_stat_2 === CONFIG.rmss.stats[stat].shortname) {
            app_stat_2_found = true;
            applicable_stat_bonus = applicable_stat_bonus + this.system.stats[stat].stat_bonus;
          }
          if (app_stat_3 === CONFIG.rmss.stats[stat].shortname) {
            app_stat_3_found = true;
            applicable_stat_bonus = applicable_stat_bonus + this.system.stats[stat].stat_bonus;
          }
        }

        if (app_stat_1_found && (!app_stat_3_found || app_stat_2_found)) {
          item.system.stat_bonus = applicable_stat_bonus;
          item.calculateSkillCategoryTotalBonus(item);
        }
      }
    }
  }

  // For each skill category return an object in this format.
  // {{ _id: "skill category name"}}
  // This is the format that the select helper on the skill sheet needs

  getOwnedItemsByType(item_type) {
    let ownedItems = {None: "None"};
    for (const item of this.items) {
      if (item.type === item_type) {
        ownedItems[item._id] = item.name;
      }
    }
    return (ownedItems);
  }
}
