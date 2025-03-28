// Import Configuration Object
import { rmss } from "./module/config.js";

// Import document classes.
import { RMSSActor } from "./module/documents/actor.js";
import { RMSSItem } from "./module/documents/item.js";

//Import combat classes
import { CombatStartManager, RMSSCombat } from "./module/combat/rmss_combat.js";
import { RMSSCombatant } from "./module/combat/rmss_combatant.js";

// Import Sheets
import RMSSItemSheet from "./module/sheets/items/rmss_item_sheet.js";
import RMSSArmorSheet from "./module/sheets/items/rmss_armor_sheet.js";
import RMSSTransportSheet from "./module/sheets/items/rmss_transport_sheet.js";
import RMSSWeaponSheet from "./module/sheets/items/rmss_weapon_sheet.js";
import RMSSHerbOrPoisonSheet from "./module/sheets/items/rmss_herb_or_poison_sheet.js";
import RMSSSpellSheet from "./module/sheets/spells/rmss_spell_sheet.js";
import RMSSSpellListSheet from "./module/sheets/spell_lists/rmss_spell_list_sheet.js";
import RMSSSkillCategorySheet from "./module/sheets/skills/rmss_skill_category_sheet.js";
import RMSSSkillSheet from "./module/sheets/skills/rmss_skill_sheet.js";
import RMSSRaceSheet from "./module/sheets/items/rmss_race_sheet.js";
import RMSSProfessionSheet from "./module/sheets/items/rmss_profession_sheet.js";
import RMSSPlayerSheet from "./module/sheets/actors/rmss_player_sheet.js";
import RMSSActorSheetConfig from "./module/sheets/actors/rmss_player_sheet_config.js";
import { RMSSWeaponSkillManager } from "./module/combat/rmss_weapon_skill_manager.js";
import { RMSSWeaponCriticalManager } from "./module/combat/rmss_weapon_critical_manager.js";
import RMSSNpcSheet from "./module/sheets/actors/rmss_npc_sheet.js";
import RMSSCreatureSheet from "./module/sheets/actors/rmss_creature_sheet.js";
import RMSSCreatureAttackSheet from "./module/sheets/items/rmss_creature_attack.js"

export let socket;

/**  Preload handlebars templates for character sheets */
async function preloadHandlebarsTemplates() {
  const templatePaths = [
    "systems/rmss/templates/sheets/actors/parts/actor-stats.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fixed-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-armor-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-resistance.html",
    "systems/rmss/templates/sheets/actors/parts/actor-race-stat-fixed-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-role-traits.html",
    "systems/rmss/templates/sheets/actors/parts/actor-background-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-skill-categories.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fav-skills.html",
    "systems/rmss/templates/sheets/actors/parts/actor-items.html",
    "systems/rmss/templates/sheets/actors/parts/actor-weapons.html",
    "systems/rmss/templates/sheets/actors/parts/actor-money.html",
    "systems/rmss/templates/sheets/actors/parts/actor-skill-categories.html",
    "systems/rmss/templates/sheets/actors/parts/actor-armor.html",
    "systems/rmss/templates/sheets/actors/parts/actor-herbs.html",
    "systems/rmss/templates/sheets/actors/parts/actor-spells.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fav-spells.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fav-items.html",
    "systems/rmss/templates/sheets/actors/apps/actor-settings.html",
    "systems/rmss/templates/sheets/actors/parts/actor-status-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-exp-points.html",
    "systems/rmss/templates/sheets/actors/parts/npc-skills.hbs",
    "systems/rmss/templates/sheets/actors/parts/creature-attacks.hbs",
    "systems/rmss/templates/sheets/actors/rmss-critical-codes.hbs",
    "systems/rmss/templates/sheets/actors/parts/active-effects.hbs",
    "systems/rmss/templates/sheets/actors/parts/search-text.hbs",
    "systems/rmss/templates/sheets/actors/parts/actor-skill-list.hbs"
  ];
  return loadTemplates(templatePaths);
}

//Socketlib actions
Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerSystem("rmss");
  socket.register("confirmWeaponAttack", RMSSWeaponSkillManager.attackMessagePopup);
  socket.register("confirmWeaponCritical", RMSSWeaponCriticalManager.criticalMessagePopup);
  socket.register("chooseCriticalOption", RMSSWeaponCriticalManager.chooseCriticalOption);
  socket.register("updateActorHits", RMSSWeaponCriticalManager.updateActorHits);
  socket.register("applyCriticalToEnemy", RMSSWeaponCriticalManager.applyCriticalToEnemy);
});

// Hook the init function and set up our system
Hooks.once("init", function () {
  console.log("rmss | Initialising Rolemaster Standard System");

  // Load our custom actor and item classes
  console.log("rmss | Loading Rolemaster Actor and Item classes");
  game.rmss = {
    RMSSActor,
    RMSSItem,
    applications: {
      RMSSActorSheetConfig
    }
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = RMSSActor;
  CONFIG.Item.documentClass = RMSSItem;

  // Make Config Data Available
  CONFIG.rmss = rmss;

  //combat tracker
  CONFIG.Combat.initiative = {
    formula: "2d10+ @stats.quickness.stat_bonus",
    decimals: 2
  };
  CONFIG.Combat.documentClass = RMSSCombat;
  CONFIG.Combatant.documentClass = RMSSCombatant;

  // Unregister Default Sheets
  console.log("rmss | Unregistering core sheets");

  Items.unregisterSheet("core", ItemSheet);
  Actors.unregisterSheet("core", ActorSheet);

  // Register RMSS Sheets
  console.log("rmss | Registering RMSS sheets");

  // Items
  Items.registerSheet("rmss", RMSSItemSheet, { makeDefault: true, label: "rmss.entity_sheet.item", types: ["item"] });
  Items.registerSheet("rmss", RMSSArmorSheet, { makeDefault: true, label: "rmss.entity_sheet.armor", types: ["armor"] });
  Items.registerSheet("rmss", RMSSTransportSheet, { makeDefault: true, label: "rmss.entity_sheet.transport", types: ["transport"] });
  Items.registerSheet("rmss", RMSSWeaponSheet, { makeDefault: true, label: "rmss.entity_sheet.weapon", types: ["weapon"] });
  Items.registerSheet("rmss", RMSSHerbOrPoisonSheet, { makeDefault: true, label: "rmss.entity_sheet.herb_or_poison", types: ["herb_or_poison"] });
  Items.registerSheet("rmss", RMSSCreatureAttackSheet, { makeDefault: true, label: "rmss.entity_sheet.creature_attack", types: ["creature_attack"] });

  // Spells
  Items.registerSheet("rmss", RMSSSpellSheet, { makeDefault: true, label: "rmss.entity_sheet.spell", types: ["spell"] });
  Items.registerSheet("rmss", RMSSSpellListSheet, { makeDefault: true, label: "rmss.entity_sheet.spell_list", types: ["spell_list"] });


  // Skills
  Items.registerSheet("rmss", RMSSSkillCategorySheet, { makeDefault: true, label: "rmss.entity_sheet.skill_category", types: ["skill_category"] });
  Items.registerSheet("rmss", RMSSSkillSheet, { makeDefault: true, label: "rmss.entity_sheet.skill", types: ["skill"] });

  //Races
  Items.registerSheet("rmss", RMSSRaceSheet, { makeDefault: true, label: "rmss.entity_sheet.race", types: ["race"] })

  //Profession
  Items.registerSheet("rmss", RMSSProfessionSheet, { makeDefault: true, label: "rmss.entity_sheet.profession", types: ["profession"] })

  // Actors
  Actors.registerSheet("rmss", RMSSPlayerSheet, { makeDefault: true, label: "rmss.entity_sheet.player_character", types: ["character"] });
  Actors.registerSheet("rmss", RMSSNpcSheet, { makeDefault: true, label: "rmss.entity_sheet.npc", types: ["npc"] });
  Actors.registerSheet("rmss", RMSSCreatureSheet, { makeDefault: true, label: "rmss.entity_sheet.creature", types: ["creature"] });


  // Preload Handlebars Templates
  preloadHandlebarsTemplates();

  // Handlebars Helpers
  Handlebars.registerHelper("switch", function (value, options) {
    const context = Object.assign({}, this);
    context.switch_value = value;
    return options.fn(context);
  });

  Handlebars.registerHelper("case", function (value, options) {
    if (value === this.switch_value) {
      return options.fn(this);
    }
  });

  Handlebars.registerHelper('localizeKey', function(key) {
    return game.i18n.localize(`rmss.experience.${key}`);
  });

  Item.prototype.use = async function () {
    if (this.type !== "weapon") return;
    const enemy = RMSSCombat.getTargets()?.[0];

    if (!enemy) {
      ui.notifications.warn("No hay un objetivo seleccionado.");
      return;
    }

    let ob = null;
    if (this.actor.type !== "creature") {
      ob = this.actor.items.get(this.system.offensive_skill)?.system.total_bonus ?? 0;
    } else {
      ob = this.system.bonus ?? 0;
    }

    await RMSSWeaponSkillManager.sendAttackMessage(this.actor, enemy.actor, this, ob);
  };

  //Combat hooks
  const combatSoundManager = new CombatStartManager();
});
