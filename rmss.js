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
import RMSSMerchantSheet from "./module/sheets/actors/rmss_merchant_sheet.js";
import RMSSLootSheet from "./module/sheets/actors/rmss_loot_sheet.js";
import RMSSCreatureAttackSheet from "./module/sheets/items/rmss_creature_attack.js"
import utils from "./module/utils.js";
import { createProfession, createProfessionDialog } from "./module/tools/profession_creator.js";
import {ContainerHandler} from "./module/actors/utils/container_handler.js";
import { syncHitsAndPowerPointsFromSkills } from "./module/actors/utils/hits_pp_sync.js";
import EffectsPopupService from "./module/core/rolls/effects_popup_service.js";
import ExperiencePointsCalculator from "./module/sheets/experience/rmss_experience_manager.js";
import CurrencyService from "./module/actors/services/currency_service.js";
import { getItemGlowClass } from "./module/actors/utils/item_identity_util.js";
import { advanceArtifactRecharge } from "./module/sheets/items/enchantment_utils.js";

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
    "systems/rmss/templates/sheets/actors/dialogs/weapon_preference_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/stat_assignment_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/merchant_sell_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/merchant_request_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/loot_item_request_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/loot_money_request_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/sell_to_merchant_dialog.html",
    "systems/rmss/templates/sheets/actors/dialogs/populate_from_roll_table_dialog.html",
    "systems/rmss/templates/chat/request-card.html",
    "systems/rmss/templates/sheets/items/parts/item-tags.hbs",
    "systems/rmss/templates/sheets/items/parts/container-allowed-tags.hbs",
    "systems/rmss/templates/sheets/items/parts/passive-modifiers.hbs",
    "systems/rmss/templates/sheets/items/parts/unidentified-item-body.html",
  ];
  return loadTemplates(templatePaths);
}

//Socketlib actions
Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerSystem("rmss");
  socket.register("confirmWeaponAttack", RMSSWeaponSkillManager.attackMessagePopup);
  socket.register("confirmWeaponCritical", RMSSWeaponCriticalManager.criticalMessagePopup);
  socket.register("applyLargeCreatureCritical", RMSSWeaponCriticalManager.applyLargeCreatureCriticalGM);
  socket.register("chooseCriticalOption", RMSSWeaponCriticalManager.chooseCriticalOption);
  socket.register("updateActorHits", RMSSWeaponCriticalManager.updateActorHits);
  socket.register("postCreatureAttackChainReminderGm", RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder);
  socket.register("applyCriticalToEnemy", RMSSWeaponCriticalManager.applyCriticalToEnemy);
  socket.register("applySpellHealHits", async (payload) => {
    const { default: SpellHealService } = await import("./module/spells/services/spell_heal_service.js");
    return SpellHealService.applySpellHealHitsGM(payload);
  });
  socket.register("recordCombatStat", async (combatId, op, payload) => {
    const combat = game.combats.get(combatId);
    if (!combat) return;
    const current = combat.getFlag("rmss", "combatStats") || {};
    const ensure = (id) => {
      if (!current[id]) {
        current[id] = {
          critsInflicted: 0, critsReceived: 0, hpInflicted: 0, hpReceived: 0, kills: 0,
          hpByDefender: {}, hpFromAttacker: {}, critsBySeverityInflicted: {}, critsBySeverityReceived: {},
          killsList: [], spellsCast: 0, ppSpent: 0, spellXpGained: 0
        };
      }
      return current[id];
    };
    if (op === "damage") {
      const { attackerId, defenderId, amount, defenderDied } = payload;
      if (attackerId) {
        const s = ensure(attackerId);
        s.hpInflicted = (s.hpInflicted || 0) + amount;
        s.hpByDefender = s.hpByDefender || {};
        s.hpByDefender[defenderId] = (s.hpByDefender[defenderId] || 0) + amount;
        if (defenderDied) {
          s.kills = (s.kills || 0) + 1;
          s.killsList = s.killsList || [];
          s.killsList.push({ defenderId, defenderName: game.actors.get(defenderId)?.name ?? "?", attackerId });
        }
      }
      if (defenderId) {
        const s = ensure(defenderId);
        s.hpReceived = (s.hpReceived || 0) + amount;
        s.hpFromAttacker = s.hpFromAttacker || {};
        s.hpFromAttacker[attackerId] = (s.hpFromAttacker[attackerId] || 0) + amount;
      }
    } else if (op === "critical") {
      const { attackerId, defenderId, severity } = payload;
      const sev = severity && /^[A-E]$/i.test(severity) ? severity.toUpperCase() : null;
      if (attackerId) {
        const s = ensure(attackerId);
        s.critsInflicted = (s.critsInflicted || 0) + 1;
        if (sev) {
          s.critsBySeverityInflicted = s.critsBySeverityInflicted || {};
          s.critsBySeverityInflicted[sev] = (s.critsBySeverityInflicted[sev] || 0) + 1;
        }
      }
      if (defenderId) {
        const s = ensure(defenderId);
        s.critsReceived = (s.critsReceived || 0) + 1;
        if (sev) {
          s.critsBySeverityReceived = s.critsBySeverityReceived || {};
          s.critsBySeverityReceived[sev] = (s.critsBySeverityReceived[sev] || 0) + 1;
        }
      }
    } else if (op === "kill") {
      const { attackerId, defenderId } = payload;
      if (attackerId) {
        const s = ensure(attackerId);
        s.kills = (s.kills || 0) + 1;
        s.killsList = s.killsList || [];
        s.killsList.push({ defenderId, defenderName: game.actors.get(defenderId)?.name ?? "?", attackerId });
      }
    } else if (op === "spell") {
      const { actorId, spellLevel, xpAwarded } = payload;
      if (actorId) {
        const s = ensure(actorId);
        s.spellsCast = (s.spellsCast || 0) + 1;
        s.ppSpent = (s.ppSpent || 0) + (spellLevel || 0);
        s.spellXpGained = (s.spellXpGained || 0) + (xpAwarded || 0);
      }
    }
    await combat.setFlag("rmss", "combatStats", foundry.utils.deepClone(current));
  });
});

Hooks.once("ready", async function() {
  console.log("RMSS | Loading arms table index...");
  const indexPath = `${CONFIG.rmss.paths.arms_tables.replace(/\/?$/, "/")}index.json`;
  const response = await fetch(indexPath);
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

  // Single delegated listener for every .spell-info-icon across all sheets (27+ spots):
  // the hover tooltip clips long descriptions, so clicking the icon instead opens the
  // full text in a scrollable dialog. Registered on the CAPTURE phase: the icon usually
  // sits inside a row/cell that has its own click handler (e.g. the weapon name cell,
  // which triggers an attack) bound directly on that element — closer to the click target
  // than document.body, so it fires before a normal bubble-phase listener here ever could.
  // Intercepting on the way down (capture) stops it before it reaches that handler at all.
  document.body.addEventListener("click", (ev) => {
    const icon = ev.target.closest(".spell-info-icon");
    if (!icon) return;
    ev.preventDefault();
    ev.stopPropagation();
    const description = icon.dataset.tooltip;
    if (!description) return;
    new Dialog({
      title: game.i18n.localize("rmss.dialogs.item_description_title"),
      content: `<div class="rmss-item-description-modal">${description}</div>`,
      buttons: {}
    }, { width: 420, resizable: true }).render(true);
  }, true);
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

  game.settings.register("rmss", "enableCombatHistoryTracker", {
    name: "Enable Combat History Tracker",
    hint: "Show combat statistics (crits, HP, kills, spells) at the end of each encounter.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("rmss", "sacredToHolyMigrated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("rmss", "ofDarknessToUnholyMigrated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
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
    lastSpellContext: null, // Set by ForceSpellService before spell.use(); used by item macros
    /** Get normalized sex for any actor (character, npc, creature). For spell macros: game.rmss.getActorSex(actor) */
    getActorSex: (actor) => utils.getActorSex(actor),
    applications: {
      RMSSActorSheetConfig
    },
    /**
     * Cast a spell from hotbar/macro context. Finds spell list from spell's containerId and routes to the correct service.
     * Use this when invoking spells outside the character sheet (e.g. hotbar) so lastSpellContext is set for F-type spells with targets.
     * @param {string} actorId - Actor ID
     * @param {string} itemId - Spell item ID
     * @returns {Promise<void>}
     */
    async castSpellFromHotbar(actorId, itemId) {
      const actor = game.actors.get(actorId);
      const spell = actor?.items.get(itemId);
      if (!actor || !spell || spell.type !== "spell") {
        ui.notifications.warn("Hechizo no encontrado.");
        return;
      }
      if (spell.system?.instant) {
        const InstantSpellService = (await import("./module/spells/services/instant_spell_service.js")).default;
        await InstantSpellService.castInstantSpell({ actor, spell });
        return;
      }

      const spellListId = spell.getFlag("rmss", "containerId");
      const spellList = spellListId ? actor.items.get(spellListId) : null;
      const spellListName = spellList?.name ?? spell.name;
      const spellListRealm = spellList?.system?.realm ?? actor.system.fixed_info?.realm ?? "essence";

      if (spell.system?.type === "BE") {
        const BaseElementalSpellService = (await import("./module/spells/services/base_elemental_spell_service.js")).default;
        await BaseElementalSpellService.castBaseElementalSpell({ actor, spell, spellListName, spellListRealm });
      } else if (spell.system?.type === "DE") {
        const DirectedElementalSpellService = (await import("./module/spells/services/directed_elemental_spell_service.js")).default;
        await DirectedElementalSpellService.castDirectedElementalSpell({ actor, spell, spellListName, spellListRealm });
      } else {
        const ForceSpellService = (await import("./module/spells/services/force_spell_service.js")).default;
        await ForceSpellService.castForceSpell({ actor, spell, spellListName, spellListRealm });
      }
    },
    /** Create a profession item from predefined data. Run from macro: await game.rmss.createProfession("Cleric"); */
    createProfession,
    /** Show dialog to pick profession and create it. Run from macro: await game.rmss.createProfessionDialog(); */
    createProfessionDialog,
    /**
     * Heal hit points on targeted token(s) as GM (for spell macros). Target count must be between 1 and `maxTargets` (inclusive).
     * @param {{ amountPerTarget: number, maxTargets?: number, tokenIds?: string[], sceneId?: string }} options
     * @returns {Promise<boolean>}
     */
    async applySpellHealHits(options) {
      const { default: SpellHealService } = await import("./module/spells/services/spell_heal_service.js");
      return SpellHealService.applyHealHits(options);
    },
    /**
     * Ammo stacks on an actor (items with matching tag + quantity &gt; 0). See {@link CONFIG.rmss.ammunition_types}.
     * @param {string} actorId
     * @param {string} ammoTag - e.g. "arrow"
     * @returns {Promise<Item[]>}
     */
    async findAmmoStacksOnActor(actorId, ammoTag) {
      const actor = game.actors.get(actorId);
      if (!actor) return [];
      const { findAmmoStacksOnActor } = await import("./module/actors/utils/ammunition_util.js");
      return findAmmoStacksOnActor(actor, ammoTag);
    },
    /**
     * Ammo stacks using the missile weapon {@code system.ammoType} (must be type {@code mis}).
     * @param {string} actorId
     * @param {string} weaponItemId
     * @returns {Promise<Item[]>}
     */
    async findAmmoStacksForWeapon(actorId, weaponItemId) {
      const actor = game.actors.get(actorId);
      const weapon = actor?.items.get(weaponItemId);
      if (!actor || !weapon) return [];
      const { findAmmoStacksForWeapon } = await import("./module/actors/utils/ammunition_util.js");
      return findAmmoStacksForWeapon(actor, weapon);
    },
    /**
     * Fire a trap/hazard attack from a scene trigger script (Region Behavior "Execute Script",
     * Monk's Active Tiles, a macro...) through the normal weapon-attack pipeline — attack roll,
     * GM confirmation, critical roll/confirmation, Slaying matching, all reused as-is.
     * The trap is a hidden npc actor with one equipped weapon (its OB/attack table/critical
     * type/Slaying tags define the trap), or a hidden creature actor with a natural
     * creature_attack (no Slaying support there, it's a plain natural attack). Example, from a tile trigger:
     * `await game.rmss.triggerTrapAttack("<trapActorId>", token);`
     * @param {string} trapActorId - Actor id of the trap actor
     * @param {string|Token|TokenDocument} target - The token that triggered the trap (or its id)
     * @param {string} [weaponItemId] - Pick a specific equipped weapon when the trap has more than one
     * @returns {Promise<void>}
     */
    async triggerTrapAttack(trapActorId, target, weaponItemId = null) {
      const { default: TrapAttackService } = await import("./module/combat/services/trap_attack_service.js");
      return TrapAttackService.trigger(trapActorId, target, weaponItemId);
    },
    /**
     * Fire a critical directly from a scene trigger script — no attack roll, just "apply
     * severity X of critical table Y" (e.g. a dart trap: severity "C" on the "P" puncture
     * table). See `CONFIG.rmss.criticalDictionary` for valid critType codes. Example:
     * `await game.rmss.triggerTrapCritical(token, { severity: "C", critType: "P" });`
     * @param {string|Token|TokenDocument} target - The token that triggered the trap (or its id)
     * @param {{ severity: string, critType: string, damage?: number, modifier?: number, trapActorId?: string|null }} options
     * @returns {Promise<void>}
     */
    async triggerTrapCritical(target, options) {
      const { default: TrapAttackService } = await import("./module/combat/services/trap_attack_service.js");
      return TrapAttackService.triggerCritical(target, options);
    },
    /**
     * Roll a Resistance Roll against a target and get the outcome back, for spell/item
     * macros that branch on it ("if resisted do A, if not do B"). Rolls immediately (no
     * chat-button step) and still posts the usual RR result card to chat. Example, inside
     * a spell macro after `spellContext` targets are known:
     * ```
     * for (const target of Array.from(game.user.targets)) {
     *   const { success } = await game.rmss.rollResistance({
     *     target,
     *     attackerLevel: actor.system.attributes.level.value
     *   });
     *   if (success) { / * A: resisted * / } else { / * B: failed * / }
     * }
     * ```
     * @param {{ target: string|Token|TokenDocument, attackerLevel: number, defenderLevel?: number, modifier?: number }} options
     *   - target: the resisting token (or its id). defenderLevel defaults to that token's actor level if omitted.
     * @returns {Promise<{ success: boolean, finalRoll: number, rrTarget: number }|null>} null if target not found
     */
    async rollResistance({ target, attackerLevel, defenderLevel, modifier = 0 }) {
      const token = typeof target === "string"
        ? (canvas.tokens?.get(target) ?? canvas.scene?.tokens?.get(target) ?? null)
        : (target ?? null);
      if (!token) {
        ui.notifications.error("Resistance roll: token not found.");
        return null;
      }

      const { default: EffectsPopupService } = await import("./module/core/rolls/effects_popup_service.js");
      const { default: ResistanceRollService } = await import("./module/core/rolls/resistance_roll_service.js");

      const resolvedDefenderLevel = defenderLevel ?? (parseInt(token.actor?.system?.attributes?.level?.value, 10) || 1);
      const rrTarget = ResistanceRollService.getFinalRR(attackerLevel, resolvedDefenderLevel, modifier);
      const result = await EffectsPopupService.executeResistanceRoll(token.id, attackerLevel, resolvedDefenderLevel, modifier, rrTarget);
      return { ...result, rrTarget };
    },
    /**
     * Schedule a macro-style command to run automatically once combat reaches a future
     * round — for spells with a casting delay (e.g. a 2-round summon: place a marker on
     * round 1, the creature actually appears when round 2 begins, with no one having to
     * remember to run a second macro). Survives reloads/disconnects (stored on the Combat
     * document) and is cleaned up automatically when the encounter ends. Example:
     * ```
     * await game.rmss.scheduleDelayedAction({
     *   roundsFromNow: 1,
     *   context: { x: token.x, y: token.y, casterId: actor.id, elementalActorId: "<id>" },
     *   command: `
     *     const elemental = game.actors.get(context.elementalActorId);
     *     await elemental.getTokenDocument({ x: context.x, y: context.y }).then(d =>
     *       canvas.scene.createEmbeddedDocuments("Token", [d.toObject()]));
     *   `
     * });
     * ```
     * @param {{ combat?: Combat, roundsFromNow?: number, atRound?: number, command: string, context?: object }} options
     * @returns {Promise<string>} the pending action's id, for game.rmss.cancelDelayedAction
     */
    async scheduleDelayedAction(options) {
      const { scheduleDelayedAction } = await import("./module/combat/delayed_action_service.js");
      return scheduleDelayedAction(options);
    },
    /**
     * Cancel a delayed action scheduled with game.rmss.scheduleDelayedAction (e.g. the
     * caster was interrupted before it could go off).
     * @param {string} id
     * @param {Combat} [combat] - defaults to game.combat
     * @returns {Promise<void>}
     */
    async cancelDelayedAction(id, combat = game.combat) {
      const { cancelDelayedAction } = await import("./module/combat/delayed_action_service.js");
      return cancelDelayedAction(combat, id);
    }
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = RMSSActor;
  CONFIG.Item.documentClass = RMSSItem;

  // Make Config Data Available
  CONFIG.rmss = rmss;
  CONFIG.weapons = CONFIG.weapons || {};
  CONFIG.weapons.type = ["1he","2h","1hc","mis","pa1h","pa2h","th"];

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
  Actors.registerSheet("rmss", RMSSMerchantSheet, { makeDefault: true, label: "rmss.entity_sheet.merchant", types: ["merchant"] });
  Actors.registerSheet("rmss", RMSSLootSheet, { makeDefault: true, label: "rmss.entity_sheet.loot", types: ["loot"] });


  // Preload Handlebars Templates
  preloadHandlebarsTemplates().then(() => {
    Promise.all([
      fetch("systems/rmss/templates/sheets/items/parts/item-tags.hbs").then((r) => r.text()),
      fetch("systems/rmss/templates/sheets/items/parts/container-allowed-tags.hbs").then((r) => r.text()),
      fetch("systems/rmss/templates/sheets/items/parts/passive-modifiers.hbs").then((r) => r.text())
    ])
      .then(([itemTagsText, containerAllowedText, passiveModifiersText]) => {
        Handlebars.registerPartial("rmssItemTags", itemTagsText);
        Handlebars.registerPartial("rmssContainerAllowedTags", containerAllowedText);
        Handlebars.registerPartial("rmssPassiveModifiers", passiveModifiersText);
      })
      .catch((err) => console.warn("rmss | item sheet partials", err));
  });

  // Handlebars Helpers

  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("lt", (a, b) => Number(a) < Number(b));
  Handlebars.registerHelper("eq", (a, b) => a === b);

  Handlebars.registerHelper('inc', function (value) {
    return parseInt(value) + 1;
  });

  /**
   * Crítico A–E: círculo (fas fa-circle) + letra, colores de gravedad creciente.
   * Equivale visualmente a los FA Pro circle-a…e, compatibles con FA Free de Foundry.
   */
  Handlebars.registerHelper("criticalSeverityIcon", function (severity) {
    const raw = severity == null ? "" : String(severity);
    const letter = raw.trim().toUpperCase().charAt(0);
    if (!["A", "B", "C", "D", "E"].includes(letter)) {
      return new Handlebars.SafeString(Handlebars.escapeExpression(raw));
    }
    const key = letter.toLowerCase();
    const esc = Handlebars.escapeExpression(letter);
    const html =
      `<span class="rmss-crit-severity rmss-crit-severity-${key}" role="img" aria-label="${esc}" title="${esc}">` +
      `<i class="fas fa-circle" aria-hidden="true"></i>` +
      `<span class="rmss-crit-severity-letter">${esc}</span></span>`;
    return new Handlebars.SafeString(html);
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

  Handlebars.registerHelper("and", function (a, b) {
    return a && b;
  });

  Handlebars.registerHelper("noPpMarker", function () {
    return new Handlebars.SafeString('<span class="spell-no-pp-marker">&bull;</span>');
  });

  Handlebars.registerHelper("percentage", function (a, b) {
    if (typeof a !== "number" || typeof b !== "number" || b === 0) return 0;
    return Math.round((a / b) * 100);
  });

  Handlebars.registerHelper("times", function (n, options) {
    let result = "";
    for (let i = 0; i < n; i++) result += options.fn(i);
    return result;
  });

  Handlebars.registerHelper("formatNumber", function (value, decimals) {
    const n = Number(value);
    if (isNaN(n)) return value ?? "";
    const d = (typeof decimals === "number" && decimals >= 0) ? decimals : 2;
    return n.toFixed(d).replace(/\.?0+$/, "");
  });

  // Register a Handlebars helper to concatenate strings
  Handlebars.registerHelper("concat", function() {
    // Convert arguments to an array and remove the last one (Handlebars options object)
    const args = Array.from(arguments).slice(0, -1);
    // Join all parts together and return the result
    return args.join('');
  });

  // Same magical/consecrated icon glow shown on actor equipment lists, but for
  // the Items sidebar directory — Foundry's own UI, so it's added via hook
  // rather than a system template. No glow for unidentified items unless the
  // viewer is the GM, matching the equipment-list behavior.
  Hooks.on("renderItemDirectory", (app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;
    for (const entry of root.querySelectorAll("[data-entry-id]")) {
      const item = game.items.get(entry.dataset.entryId);
      const img = item ? entry.querySelector("img") : null;
      if (!img) continue;
      img.classList.remove("rmss-directory-glow--magical", "rmss-directory-glow--consecrated");
      const glow = getItemGlowClass(item).replace("rmss-glow--", "rmss-directory-glow--");
      if (glow) img.classList.add(glow);
    }
  });

  Hooks.on("renderTokenHUD", (app, html, data) => {
    console.log("[rmss] renderTokenHUD hook fired", { app, html, data, user: game.user });

    // 1. Solo mostramos el botón al GM.
    if (!game.user.isGM) {
      console.log("[rmss] Usuario no es GM, no se muestra el botón");
      return;
    }

    // 2. Creamos el botón manualmente.
    const effectsButton = document.createElement("div");
    effectsButton.classList.add("control-icon");
    effectsButton.title = game.i18n.localize("rmss.combat.effects_title");
    effectsButton.innerHTML = `<i class="fas fa-skull-crossbones"></i>`;

    // 3. Añadimos el listener.
    effectsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log("[rmss] Botón de efectos pulsado", { app, html, data });

      // Obtenemos el token sobre el que hemos abierto el HUD.
      const targetToken = app.object;
      if (!targetToken?.actor) {
        console.warn("[rmss] Token sin actor", targetToken);
        return;
      }

      // Valores iniciales para el crítico.
      const criticalOptions = {
        damage: 0,
        severity: 'A',
        critType: 'K',
        modifier: 0
      };

      // Mostrar popup con tabs (Crítico / RR).
      const response = await EffectsPopupService.showPopup(targetToken, criticalOptions);

      if (!response) {
        console.log("[rmss] Popup cancelado");
        return;
      }

      // Si fue acción de crítico
      if (response.action === "critical" && response.confirmed) {
        console.log("[rmss] Crítico confirmado por el GM", response);

        const res = await RMSSWeaponCriticalManager.updateActorHits(
            targetToken.id,
            targetToken instanceof Token,
            parseInt(response.damage),
            response
        );

        await RMSSWeaponCriticalManager.applyCriticalTo(
            res,
            utils.getActor(targetToken.id),
            response.attackerId ?? null
        );

        ui.notifications.info(`Crítico aplicado a ${targetToken.name}`);
      }
      // Si fue acción de RR, el mensaje ya se envió al chat desde el servicio
      else if (response.action === "rr") {
        console.log("[rmss] Tirada de RR completada", response);
      }
    });

    // 4. Añadimos el botón al HUD.
    const colRight = html.querySelector('.col.right');
    if (colRight) {
      colRight.appendChild(effectsButton);
    } else {
      console.warn("[rmss] No se encontró '.col.right' en el HUD");
    }
  });

  //Combat hooks
 new CombatStartManager();
 new CombatEndManager();

  Hooks.once("ready", async function () {
    CONFIG.rmss = CONFIG.rmss || {};
    // Build skillCategories from config (slug, name) for skill sheet dropdown when skill has no owner
    const categories = CONFIG.rmss.skill_categories ?? {};
    CONFIG.rmss.skillCategories = Object.entries(categories)
      .map(([slug, data]) => ({ system: { slug }, name: data.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Migration: sacred -> holy (manual uses "Holy")
    const migrated = game.settings.get("rmss", "sacredToHolyMigrated");
    if (!migrated && game.actors) {
      let count = 0;
      for (const actor of game.actors) {
        for (const item of actor.items) {
          if (!["item", "armor", "weapon"].includes(item.type)) continue;
          const sys = item.system;
          if (sys?.sacred !== undefined) {
            await item.update({ "system.holy": sys.sacred, "system.-=sacred": null });
            count++;
          }
        }
      }
      if (count > 0) console.log(`RMSS | Migrated ${count} items from sacred to holy`);
      await game.settings.set("rmss", "sacredToHolyMigrated", true);
    }

    // Migration: of_darkness -> unholy
    const unholyMigrated = game.settings.get("rmss", "ofDarknessToUnholyMigrated");
    if (!unholyMigrated && game.actors) {
      let count = 0;
      for (const actor of game.actors) {
        for (const item of actor.items) {
          if (!["item", "armor", "weapon"].includes(item.type)) continue;
          const sys = item.system;
          if (sys?.of_darkness !== undefined) {
            await item.update({ "system.unholy": sys.of_darkness, "system.-=of_darkness": null });
            count++;
          }
        }
      }
      if (count > 0) console.log(`RMSS | Migrated ${count} items from of_darkness to unholy`);
      await game.settings.set("rmss", "ofDarknessToUnholyMigrated", true);
    }
  });

  // Fix corrupted enchantments (object with numeric keys instead of array)
  Hooks.once("ready", async () => {
    if (!game.actors) return;
    for (const actor of game.actors) {
      for (const item of actor.items) {
        if (!["item", "armor", "weapon"].includes(item.type)) continue;
        const ench = item.system?.magic?.enchantments;
        if (ench && !Array.isArray(ench) && typeof ench === "object") {
          const arr = Object.keys(ench).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map(k => ench[k]);
          await item.update({ "system.magic.enchantments": arr });
          console.log(`RMSS | Fixed corrupted enchantments on ${item.name} (${actor.name})`);
        }
      }
    }
  });

  Hooks.once("ready", async () => {
    const { syncPassiveItemEffectsForActor } = await import("./module/actors/services/passive_item_modifiers_service.js");
    if (!game.actors) return;
    for (const actor of game.actors) {
      if (actor.isOwner || game.user.isGM) {
        await syncPassiveItemEffectsForActor(actor);
      }
    }
  });

  /** Reset daily enchantment uses and spell adder uses.
   *  Call Hooks.call("rmssLongRest") for all actors, or Hooks.call("rmssLongRest", actor) for one. */
  Hooks.on("rmssLongRest", async (actor) => {
    const actors = actor ? [actor] : (game.actors || []);
    for (const a of actors) {
      for (const item of a.items) {
        if (!["item", "armor", "weapon"].includes(item.type)) continue;

        const enchantments = item.system?.magic?.enchantments;
        if (Array.isArray(enchantments)) {
          let changed = false;
          const updated = enchantments.map((e) => {
            if (e.usage === "daily") {
              const perDay = Number(e.usesPerDay) || 0;
              if (Number(e.usesRemaining) !== perDay) {
                changed = true;
                return { ...e, usesRemaining: perDay };
              }
            }
            return e;
          });
          if (changed) await item.update({ "system.magic.enchantments": updated });
        }

        const spellAdder = Number(item.system?.spell_adder) || 0;
        if (spellAdder > 0 && Number(item.system?.spell_adder_uses_remaining) !== spellAdder) {
          await item.update({ "system.spell_adder_uses_remaining": spellAdder });
        }

        // Artifact power pool: periodic recharge every N days (rechargeDays), tracked by
        // daysUntilRecharge counting down one per long rest — this system has no calendar,
        // a long rest is the only "time passes" signal available.
        const recharge = advanceArtifactRecharge(item.system?.magic);
        if (recharge) {
          const currentPool = Number(item.system?.magic?.chargePool?.current) || 0;
          const currentDays = Number(item.system?.magic?.daysUntilRecharge) || 0;
          if (recharge.current !== currentPool || recharge.daysUntilRecharge !== currentDays) {
            await item.update({
              "system.magic.chargePool.current": recharge.current,
              "system.magic.daysUntilRecharge": recharge.daysUntilRecharge
            });
          }
        }
      }
    }
  });

  /** Generate slug from name: lowercase, normalize accents, replace spaces/special chars with hyphens. */
  const slugFromName = (name) => {
    if (!name || typeof name !== "string") return "";
    return String(name)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s*[•·]\s*/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // Ensure skill_category has slug when created (e.g. from compendium without slug)
  Hooks.on("preCreateItem", (item, data, options) => {
    if (item.type !== "skill_category") return;
    const existingSlug = item.system?.slug ?? data.system?.slug;
    if (existingSlug) return;
    const slug = (name) =>
      String(name || "")
        .toLowerCase()
        .replace(/\s*[•·]\s*/g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    const derivedSlug = slug(item.name || data.name);
    if (derivedSlug) {
      item.updateSource({ "system.slug": derivedSlug });
    }
  });

  // Ensure skill has slug when created or when name changes
  Hooks.on("preCreateItem", (item, data, options) => {
    if (item.type !== "skill") return;
    const name = item.name ?? data.name ?? "";
    const derivedSlug = slugFromName(name);
    if (derivedSlug) {
      item.updateSource({ "system.slug": derivedSlug });
    }
  });

  Hooks.on("preUpdateItem", (item, update, options, userId) => {
    if (item.type !== "skill") return;
    const nameChanged = "name" in update;
    if (!nameChanged) return;
    const newName = update.name ?? item.name ?? "";
    const derivedSlug = slugFromName(newName);
    if (derivedSlug) {
      update.system = foundry.utils.mergeObject(update.system ?? {}, { slug: derivedSlug });
    }
  });

  // Items dropped onto an actor are worn by default (character is carrying them)
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    if (item.type !== "item") return;
    if (!(item.parent instanceof Actor)) return;
    item.updateSource({ "system.worn": true });
  });

  // Hook: renderChatMessage - Handle RR roll buttons
  Hooks.on("renderChatMessage", (message, html, data) => {
    const rrButton = html.find(".rr-roll-button");
    if (!rrButton.length) return;

    const ownerIds = (rrButton.data("owner-ids") || "").split(",").filter(id => id);
    const isOwner = ownerIds.includes(game.user.id);
    const isGM = game.user.isGM;

    // Hide button if user is not owner or GM
    if (!isOwner && !isGM) {
      rrButton.hide();
      return;
    }

    // Add click listener
    rrButton.on("click", async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      
      const tokenId = button.dataset.tokenId;
      const attackerLevel = parseInt(button.dataset.attackerLevel);
      const defenderLevel = parseInt(button.dataset.defenderLevel);
      const modifier = parseInt(button.dataset.modifier);
      const rrTarget = parseInt(button.dataset.rrTarget);

      // Disable button to prevent double clicks
      button.disabled = true;
      button.textContent = "⏳...";

      await EffectsPopupService.executeResistanceRoll(
        tokenId,
        attackerLevel,
        defenderLevel,
        modifier,
        rrTarget
      );

      // Remove the button after rolling
      $(button).remove();
    });
  });

  // Temp spell item id → index in spell list after first push (embedded create from compendium)
  const _rmssEmbeddedSpellListIndex = new Map();

  /**
   * Build the object stored in spell_list.system.spells from the editing temp Item (flags minus embeddedSpellEdit).
   * @param {Item} item
   * @returns {{ name: string, img: string, system: object, flags?: object }}
   */
  function embeddedTempItemToStoredSpell(item) {
    const flags = foundry.utils.duplicate(item.flags ?? {});
    if (flags.rmss?.embeddedSpellEdit) {
      const rmss = { ...flags.rmss };
      delete rmss.embeddedSpellEdit;
      if (Object.keys(rmss).length > 0) flags.rmss = rmss;
      else delete flags.rmss;
    }
    const spell = {
      name: item.name,
      img: item.img,
      system: foundry.utils.duplicate(item.system)
    };
    if (flags && Object.keys(flags).length > 0) spell.flags = flags;
    return spell;
  }

  // Hook: updateItem - sync embedded spell from temp item back to spell list (compendium; includes flags.rmss.macro)
  Hooks.on("updateItem", async (item, update, options, userId) => {
    const editCtx = item.getFlag("rmss", "embeddedSpellEdit");
    if (!editCtx) return;

    try {
      const spellList = await fromUuid(editCtx.spellListUuid);
      if (!spellList) return;

      const spellPayload = embeddedTempItemToStoredSpell(item);
      const spells = [...(spellList.system.spells ?? [])];

      if (editCtx.isCreate) {
        let idx = _rmssEmbeddedSpellListIndex.get(item.id);
        if (idx === undefined) {
          spells.push(spellPayload);
          idx = spells.length - 1;
          _rmssEmbeddedSpellListIndex.set(item.id, idx);
        } else {
          spells[idx] = spellPayload;
        }
      } else {
        const i = Number(editCtx.spellIndex);
        if (Number.isFinite(i) && i >= 0 && i < spells.length) {
          spells[i] = spellPayload;
        } else {
          spells.push(spellPayload);
        }
      }

      await spellList.update({ "system.spells": spells });
      if (spellList.sheet?.rendered) spellList.sheet.render(false);
    } catch (e) {
      console.error("rmss | embedded spell sync", e);
    }
  });

  Hooks.on("deleteItem", (item) => {
    if (item.type === "spell") _rmssEmbeddedSpellListIndex.delete(item.id);
  });

  // Hook: updateItem - refresh actor armor_info when armor item changes
  Hooks.on("updateItem", async (item, update, options, userId) => {
    if (item.type !== "armor") return;
    const actor = item.parent;
    if (!actor?.system?.armor_info) return;
    const s = update.system;
    const armorRelevant =
      "system.equipped" in update || "system.bonus" in update || "system.at" in update || "system.db" in update ||
      "system.armorSlot" in update || "system.material" in update ||
      s?.equipped !== undefined || s?.bonus !== undefined || s?.at !== undefined || s?.db !== undefined ||
      s?.armorSlot !== undefined || s?.material !== undefined;
    if (!armorRelevant) return;
    const ArmorInfoService = (await import("./module/actors/services/armor_info_service.js")).default;
    await ArmorInfoService.updateActorArmorInfo(actor);
  });

  // Hook: deleteItem - keep armor_info in sync when armor is removed from an actor
  Hooks.on("deleteItem", async (item, options, userId) => {
    if (item.type !== "armor") return;
    const actor = item.parent;
    if (!actor?.system?.armor_info) return;
    const ArmorInfoService = (await import("./module/actors/services/armor_info_service.js")).default;
    await ArmorInfoService.updateActorArmorInfo(actor);
  });

  // Passive modifiers on items → Actor ActiveEffects while worn/equipped
  const passiveItemModImport = () => import("./module/actors/services/passive_item_modifiers_service.js");
  Hooks.on("updateItem", async (item, update, options, userId) => {
    const actor = item.parent;
    if (!actor) return;
    if (!["item", "weapon", "armor", "herb_or_poison", "transport"].includes(item.type)) return;
    const { syncPassiveItemEffectsForActor, shouldSyncPassiveEffectsOnItemDiff } = await passiveItemModImport();
    if (!shouldSyncPassiveEffectsOnItemDiff(update)) return;
    await syncPassiveItemEffectsForActor(actor);
  });
  Hooks.on("createItem", async (item, options, userId) => {
    const actor = item.parent;
    if (!actor) return;
    if (!["item", "weapon", "armor", "herb_or_poison", "transport"].includes(item.type)) return;
    const { syncPassiveItemEffectsForActor } = await passiveItemModImport();
    await syncPassiveItemEffectsForActor(actor);
  });
  Hooks.on("deleteItem", async (item, options, userId) => {
    const actor = item.parent;
    if (!actor) return;
    if (!["item", "weapon", "armor", "herb_or_poison", "transport"].includes(item.type)) return;
    const { syncPassiveItemEffectsForActor } = await passiveItemModImport();
    await syncPassiveItemEffectsForActor(actor);
  });

  // Hook: updateItem - container capacity
  Hooks.on("updateItem", async (item, update, options, userId) => {
    const actor = item.parent;
    if (!actor) return;

    // Case 1: A contained item's weight/quantity changed
    if ("system.weight" in update || "system.quantity" in update ||
        update.system?.weight !== undefined || update.system?.quantity !== undefined) {
      const containerId = item.getFlag("rmss", "containerId");
      if (!containerId) return;
      const container = actor.items.get(containerId);
      if (!container) return;
      const handler = ContainerHandler.for(container);
      if (!handler) return;
      await handler.enforceCapacity(item);
      await handler.recalc();
      return;
    }

    // Case 2: The container itself was updated (maxCapacity reduced) — eject items until under capacity
    if (ContainerHandler.isContainer(item) && update.system?.container?.maxCapacity !== undefined) {
      const handler = ContainerHandler.for(item);
      if (handler?.isOverCapacity()) {
        await handler.enforceCapacityByEjectingUntilUnder();
      } else if (handler) {
        await handler.recalc();
      }
    }
  });

  // Hook: updateItem - sync Body Development / Power Point Development skills to actor hits.max / power_points.max
  // Also sync when weapon/armor/item with pp_multiplier/spell_adder changes
  Hooks.on("updateItem", async (item, update, options, userId) => {
    const actor = item.parent;
    if (!actor) return;
    const ppRelevant = ["weapon", "armor", "item"].includes(item.type)
      && ("system" in update)
      && (["pp_multiplier", "pp_multiplier_realm", "spell_adder", "spell_adder_realm", "equipped"].some((k) => k in (update.system || {})));
    if (item.type !== "skill" && item.type !== "skill_category" && !ppRelevant) return;

    await syncHitsAndPowerPointsFromSkills(actor);
  });

  // Hook: createItem - sync Body Development / Power Point Development skills to actor hits.max / power_points.max
  Hooks.on("createItem", async (item, options, userId) => {
    const actor = item.parent;
    if (!actor) return;
    if (item.type !== "skill" && !["weapon", "armor", "item"].includes(item.type)) return;

    await syncHitsAndPowerPointsFromSkills(actor);
  });

  // Hook: closeApplication - delete temp spell item when sheet closed without saving.
  // Was gated on `app.constructor?.name === "ItemSheet"`, but RMSS registers its own sheet
  // classes (e.g. RMSSSpellSheet) instead of the core one, so that check never matched and
  // this never ran. The flag check alone is enough to identify our temporary bridge item.
  Hooks.on("closeApplication", (app, html) => {
    const item = app.item ?? app.object;
    if (item?.getFlag && item.getFlag("rmss", "embeddedSpellEdit")) {
      item.delete().catch(() => {});
    }
  });

  // Hook: deleteItem
  // This hook triggers whenever an item is deleted.
  // If the item was inside a container, we recalculate the container's used capacity.
  // This ensures the container updates correctly when items are removed from the actor.
  Hooks.on("deleteItem", async (item, options, userId) => {
    const actor = item.parent;
    if (!actor) return;

    const containerId = item.getFlag("rmss", "containerId");
    if (containerId) {
      const container = actor.items.get(containerId);
      if (container) {
        const handler = ContainerHandler.for(container);
        if (handler) await handler.recalc();
      }
    }

    if (["skill", "weapon", "armor", "item"].includes(item.type)) {
      await syncHitsAndPowerPointsFromSkills(actor);
    }
  });

  // Hook: updateActor - sync hits.max / power_points.max when stats change (affects skill total_bonus)
  Hooks.on("updateActor", async (actor, update, options, userId) => {
    if (!actor) return;
    if (!("system" in update)) return;

    if (
      actor.type === "character" &&
      game.user.isGM &&
      foundry.utils.hasProperty(update, "system.attributes.experience_points.value")
    ) {
      const xp = parseInt(actor.system?.attributes?.experience_points?.value ?? 0, 10);
      const sheetLevel = parseInt(actor.system?.attributes?.level?.value ?? 0, 10);
      const calcLevel = ExperiencePointsCalculator.getCharacterLevelNumber(xp);
      if (calcLevel > sheetLevel) {
        const delta = calcLevel - sheetLevel;
        const prevAbove = Number(actor.system?.levelUp?.levelAbove ?? 0);
        if (delta > prevAbove) {
          const soundPath = "systems/rmss/assets/sounds/power_up.mp3";
          foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }).catch(() => {});
          await ChatMessage.create({
            content: `
                    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                    <img src="systems/rmss/assets/default/level_up.png" alt="Level up" style="width:100px; height:auto; border: 2px solid #333;">
                      <p style="color: #333; font-size: 16px;">
                        <b>${actor.name}</b> sube a <b>nivel ${calcLevel}</b>
                      </p>
                    </div>
                    `,
            speaker: { alias: "GM" },
          });
          await actor.update({ "system.levelUp.levelAbove": delta });
        }
      }
    }

    if (actor.type === "character" && actor.system?.armor_info && update.system?.stats?.quickness) {
      const ArmorInfoService = (await import("./module/actors/services/armor_info_service.js")).default;
      await ArmorInfoService.syncQuicknessArmorBonus(actor);
    }

    await syncHitsAndPowerPointsFromSkills(actor);
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
    // Apply profession skill designation when a skill is added to an actor with a profession
    if (item.type === "skill" && item.actor) {
      const profession = item.actor.items.find(i => i.type === "profession");
      const designations = profession?.system?.skillDesignations ?? [];
      const match = designations.find(d => d.slug === item.name);
      if (match) {
        await item.update({ "system.designation": match.designation });
      }
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

    // containerId refers to a container on the source actor; strip it for the recipient
    if (itemData.flags?.rmss?.containerId != null) {
      delete itemData.flags.rmss.containerId;
    }

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

  // Register GM-only money give handler
  socket.register("doMoneyGive", (payload) => CurrencyService.executeGive(payload));

});
