// Import Configuration Object
import { rmss } from "./module/config.js";
// Import document classes.
import { RMSSActor } from "./module/documents/actor.js";
import { RMSSItem } from "./module/documents/item.js";

//Import combat classes
import {CombatEndManager, CombatStartManager, RMSSCombat} from "./module/combat/rmss_combat.js";
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
import utils from "./module/utils.js";
import {ContainerHandler} from "./module/actors/utils/container_handler.js";

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
    "systems/rmss/templates/sheets/actors/parts/actor-transport.html",
    "systems/rmss/templates/sheets/actors/parts/actor-herbs.html",
    "systems/rmss/templates/sheets/actors/parts/actor-spells.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fav-spells.html",
    "systems/rmss/templates/sheets/actors/parts/actor-fav-items.html",
    "systems/rmss/templates/sheets/actors/parts/actor-status-info.html",
    "systems/rmss/templates/sheets/actors/parts/actor-exp-points.html",
    "systems/rmss/templates/sheets/actors/parts/npc-skills.hbs",
    "systems/rmss/templates/sheets/actors/parts/creature-attacks.hbs",
    "systems/rmss/templates/sheets/actors/rmss-critical-codes.hbs",
    "systems/rmss/templates/sheets/actors/parts/active-effects.hbs",
    "systems/rmss/templates/sheets/actors/parts/search-text.hbs",
    "systems/rmss/templates/sheets/actors/parts/actor-skill-list.hbs",
    "systems/rmss/templates/sheets/items/rmss-macro-editor.hbs",
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

Hooks.once("ready", async function() {
  console.log("RMSS | Loading arms table index...");
  const indexPath = `${CONFIG.rmss.paths.arms_tables.replace(/\/?$/, "/")}index.json`;
  const response = await fetch(indexPath);
  console.log(response);
  if (response.ok) {
    const tablesIndex = await response.json();
    game.rmss = game.rmss || {};
    game.rmss.attackTableIndex = tablesIndex;
  } else {
    console.error("RMSS | Can't load attack table index:", indexPath);
  }

  console.log("RMSS | Loading criticals table index...");
  const lang = game.i18n.lang === "es" ? "es" : "en";
  const base = `${CONFIG.rmss.paths.critical_tables}/${lang}/`;
  const response2 = await fetch(`${base}index.json`);
  if (response2.ok) {
    const list = await response2.json();
    game.rmss.criticalTableIndex = list;
  }
});

// Hook the init function and set up our system
Hooks.once("init", function () {
  // Register the system setting for critical table language
  game.settings.register("rmss", "criticalTableLanguage", {
    name: "Critical tables language",
    hint: "Select the language for the critical descriptions.",
    scope: "world",              // Setting is shared across the entire world
    config: true,                // Displayed in the configuration UI
    type: String,                // The stored data type
    choices: {
      "es": "Spanish",
      "en": "English"
    },
    default: "en",               // Default language
    onChange: value => {
      // Triggered whenever the setting changes
      console.log(`Critical table language changed to: ${value}`);
      ui.notifications.info(`Critical table language changed to: ${value.toUpperCase()}.`);
    }
  });

  // --- Register the system setting for maximum Fate Points ---
  game.settings.register("rmss", "maxFatePoints", {
    name: "Maximum Fate Points",
    hint: "Defines the maximum number of Fate Points available to player characters (0–6).",
    scope: "world",              // Shared across the entire world
    config: true,                // Visible in the configuration UI
    type: Number,                // Stored as a numeric value
    range: { min: 0, max: 6, step: 1 }, // Numeric range selector
    default: 3,                  // Default maximum Fate Points
    onChange: async value => {
      // Triggered whenever the setting changes
      ui.notifications.info(`Maximum Fate Points changed to: ${value}`);
    }
  });

  CONFIG.time.roundTime = 10; //1 round is 10 seconds in Rolemaster system

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
  CONFIG.weapons = CONFIG.weapons || {};
  CONFIG.weapons.type = ["1he","2h","1hc","mis","pa","th"];

  //combat tracker
  CONFIG.Combat.initiative = {
    formula: "2d10+ @stats.quickness.stat_bonus+ @attributes.initiative.value",
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

  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("lt", (a, b) => Number(a) < Number(b));
  Handlebars.registerHelper("eq", (a, b) => a === b);

  Handlebars.registerHelper('inc', function (value) {
    return parseInt(value) + 1;
  });

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

  Handlebars.registerHelper('localizeKey', function (key) {
    return game.i18n.localize(`rmss.experience.${key}`);
  });

  Handlebars.registerHelper('localizeKey', function (key) {
    return game.i18n.localize(`rmss.experience.${key}`);
  });

  Handlebars.registerHelper("join", function (array, separator) {
    // If it's not an array, return empty string
    if (!Array.isArray(array)) return "";
    return array.join(separator);
  });

  Handlebars.registerHelper("divide", function (a, b) {
    if (typeof a !== "number" || typeof b !== "number" || b === 0) return 0;
    return a / b;
  });

  Handlebars.registerHelper("or", function (a, b) {
    return a || b;
  });

  Handlebars.registerHelper("percentage", function (a, b) {
    if (typeof a !== "number" || typeof b !== "number" || b === 0) return 0;
    return Math.round((a / b) * 100);
  });

  // Register a Handlebars helper to concatenate strings
  Handlebars.registerHelper("concat", function() {
    // Convert arguments to an array and remove the last one (Handlebars options object)
    const args = Array.from(arguments).slice(0, -1);
    // Join all parts together and return the result
    return args.join('');
  });

  Hooks.on("renderTokenHUD", (app, html, data) => {
    console.log("[rmss] renderTokenHUD hook fired", { app, html, data, user: game.user });

    // 1. Solo mostramos el botón al GM.
    if (!game.user.isGM) {
      console.log("[rmss] Usuario no es GM, no se muestra el botón");
      return;
    }

    // 2. Creamos el botón manualmente.
    const critButton = document.createElement("div");
    critButton.classList.add("control-icon");
    critButton.title = "Forzar Crítico (RMSS)";
    critButton.innerHTML = `<i class="fas fa-skull-crossbones"></i>`;

    // 3. Añadimos el listener.
    critButton.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log("[rmss] Botón de crítico pulsado", { app, html, data });

      // Obtenemos el actor del token sobre el que hemos abierto el HUD.
      const targetToken = app.object;
      if (!targetToken?.actor) {
        console.warn("[rmss] Token sin actor", targetToken);
        return;
      }

      // Valores iniciales que el GM puede modificar.
      const initialDamage = 0;
      const initialSeverity = 'A';
      const initialCritType = 'K';

      // Mostrar pop-up al GM.
      console.log("[rmss] Llamando a criticalMessagePopup", {
        actor: targetToken.actor,
        initialDamage,
        initialSeverity,
        initialCritType
      });

      const gmResponse = await RMSSWeaponCriticalManager.criticalMessagePopup(
          targetToken.actor,
          initialDamage,
          initialSeverity,
          initialCritType
      );

      // Si el GM confirmó, aplicamos el resultado.
      if (gmResponse && gmResponse.confirmed) {
        console.log("[rmss] Crítico confirmado por el GM", gmResponse);

        const res = await RMSSWeaponCriticalManager.updateActorHits(
            targetToken.id,
            targetToken instanceof Token,
            parseInt(gmResponse.damage),
            gmResponse
        );

        await RMSSWeaponCriticalManager.applyCriticalTo(
            res,
            utils.getActor(targetToken.id),
            null
        );

        ui.notifications.info(`Crítico aplicado a ${targetToken.name} según lo confirmado por el GM.`);
      } else {
        console.log("[rmss] Acción de crítico cancelada o no confirmada", gmResponse);
        ui.notifications.warn("Acción de crítico cancelada.");
      }
    });

    // 4. Añadimos el botón al HUD.
    const colRight = html.querySelector('.col.right');
    if (colRight) {
      colRight.appendChild(critButton);
    } else {
      console.warn("[rmss] No se encontró '.col.right' en el HUD");
    }
  });

  //Combat hooks
 new CombatStartManager();
 new CombatEndManager();

  Hooks.once("ready", async function () {
    const pack = game.packs.get("rmss.skill-categories");
    const documents = await pack?.getDocuments() ?? [];
    CONFIG.rmss = CONFIG.rmss || {};
    CONFIG.rmss.skillCategories = documents;
    CONFIG.rmss.skillCategories.sort((a, b) => a.name.localeCompare(b.name));
  });

  // Hook: updateItem
  // This hook triggers whenever an item is updated.
  // We only care about changes to weight or quantity, because they affect container capacity.
  // If the updated item is inside a container, we enforce the capacity limit (eject if exceeded)
  // and recalculate the container's used capacity to keep it in sync.
  Hooks.on("updateItem", async (item, update, options, userId) => {
    if (!(
        "system.weight" in update ||
        "system.quantity" in update ||
        update.system?.weight !== undefined ||
        update.system?.quantity !== undefined
    )) return;

    const containerId = item.getFlag("rmss", "containerId");
    if (!containerId) return;

    const actor = item.parent;
    if (!actor) return;

    const container = actor.items.get(containerId);
    if (!container) return;

    const handler = ContainerHandler.for(container);
    if (!handler) return;

    // Check capacity and recalculate
    await handler.enforceCapacity(item);
    await handler.recalc();
  });

  // Hook: deleteItem
  // This hook triggers whenever an item is deleted.
  // If the item was inside a container, we recalculate the container's used capacity.
  // This ensures the container updates correctly when items are removed from the actor.
  Hooks.on("deleteItem", async (item, options, userId) => {
    const containerId = item.getFlag("rmss", "containerId");
    if (!containerId) return;

    const actor = item.parent;
    if (!actor) return;

    const container = actor.items.get(containerId);
    if (!container) return;

    const handler = ContainerHandler.for(container);
    if (!handler) return;

    await handler.recalc();
  });

  // Auto-prefix spell names with their level
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    if (item.type !== "spell") return;

    const level = item.system.level;
    if (level == null) return;

    const baseName = item.name.replace(/^\d+\.\s*/, ""); // quita prefijo si ya lo tenía
    const padded = String(level).padStart(2, "0");
    item.updateSource({ name: `${padded}. ${baseName}` });
  });

  // Hook to calculate skill category bonuses when created (including from folder drops)
  Hooks.on("createItem", async (item, options, userId) => {
    // Only process if it's a skill category with standard progression
    if (item.type === "skill_category" && item.actor && item.system.progression?.toLowerCase() === "standard") {
      const RankCalculator = (await import("./module/core/skills/rmss_rank_calculator.js")).default;
      const initialRanks = Number(item.system.ranks) || 0;
      await RankCalculator.applyAbsoluteRanksAndBonus(item, initialRanks, "-15*2*1*0.5*0");
    }
  });

  Hooks.on("preUpdateItem", (item, update, options, userId) => {
    if (item.type !== "spell") return;

    //only if name or level changes
    const newLevel = update?.system?.level ?? item.system.level;
    if (newLevel == null) return;

    const newName = update?.name ?? item.name;
    const baseName = newName.replace(/^\d+\.\s*/, ""); // quita prefijo anterior
    const padded = String(newLevel).padStart(2, "0");

    update.name = `${padded}. ${baseName}`;
  });

  // Register GM-only transfer handler
  socket.register("doItemTransfer", async ({ sourceActorId, sourceItemId, targetActorId, qty }) => {
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    if (!sourceActor || !targetActor) return;

    const sourceItem = sourceActor.items.get(sourceItemId);
    if (!sourceItem) return;

    // Clone item data for the target
    const itemData = sourceItem.toObject();
    itemData.system.quantity = qty;
    delete itemData._id; // ensure new document is created

    await targetActor.createEmbeddedDocuments("Item", [itemData]);

    // Update or remove from the source
    const newQty = (sourceItem.system.quantity || 1) - qty;
    if (newQty <= 0) {
      await sourceItem.delete();
    } else {
      await sourceItem.update({ "system.quantity": newQty });
    }

    ui.notifications.info(
        `${qty}x ${sourceItem.name} transferido de ${sourceActor.name} a ${targetActor.name}`
    );
  });

});
