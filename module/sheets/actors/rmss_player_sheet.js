import RankCalculator from '../skills/rmss_rank_calculator.js';
import ExperiencePointsCalculator from '../experience/rmss_experience_manager.js';
import { InputTextSearchStrategy } from '../search/rmss_text_search.js';
import RMSSCharacterSheet from "./rmss_character_sheet.js";
import * as CONFIG from "../../config.js";
import LevelUpManager from "../experience/rmss_level_up_manager.js";

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
          { navSelector: ".sub-tabs", contentSelector: ".sub-tab-content" }
      ]
    });
  }

  // Make the data available to the sheet template
  async getData() {
    const context = await super.getData();
    // Use a safe clone of the actor data for further operations.
    const actorData = this.actor.toObject(false);
    let enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description, { async: true });

    // Add the actor's data to context.data for easier access.
    context.system = actorData.system;
    context.enrichedDescription = enrichedDescription;

    //effects
    context.effects = this.actor.effects.contents;

    // Prepare character data and items.
    if (actorData.type === "character") {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }
    return context;
  }

  //Not sure if this thing do something (legacy code)
  async renderCharacterSettings(data) {
     const configSheet = await renderTemplate("systems/rmss/templates/sheets/actors/apps/actor-settings.html", data);
     return (configSheet);
  }

  // Override this method to check for duplicates when things are dragged to the sheet
  // We don't want duplicate skills and skill categories.
  async _onDropItem(event, data) {

    // Reconstruct the item from the event
    const newitem = await Item.implementation.fromDropData(data);
    const itemData = newitem.toObject();

    if (itemData.type === "race") {
      this.actor.update({ "system.race_stat_fixed_info.body_development_progression": itemData.system.progression.body_dev })
      this.actor.update({ "system.fixed_info.race": itemData.name })
      //stats race mods
      this.actor.update({ "system.stats.agility.racial_bonus": itemData.system.stat_bonus.ag })
      this.actor.update({ "system.stats.constitution.racial_bonus": itemData.system.stat_bonus.co })
      this.actor.update({ "system.stats.empathy.racial_bonus": itemData.system.stat_bonus.em })
      this.actor.update({ "system.stats.intuition.racial_bonus": itemData.system.stat_bonus.in })
      this.actor.update({ "system.stats.memory.racial_bonus": itemData.system.stat_bonus.me })
      this.actor.update({ "system.stats.presence.racial_bonus": itemData.system.stat_bonus.pr })
      this.actor.update({ "system.stats.quickness.racial_bonus": itemData.system.stat_bonus.qu })
      this.actor.update({ "system.stats.reasoning.racial_bonus": itemData.system.stat_bonus.re })
      this.actor.update({ "system.stats.self_discipline.racial_bonus": itemData.system.stat_bonus.sd })
      this.actor.update({ "system.stats.strength.racial_bonus": itemData.system.stat_bonus.st })

      //RR race mods
      this.actor.update({ "system.resistance_rolls.channeling.race_mod": itemData.system.rr_mods.chan })
      this.actor.update({ "system.resistance_rolls.essence.race_mod": itemData.system.rr_mods.ess })
      this.actor.update({ "system.resistance_rolls.mentalism.race_mod": itemData.system.rr_mods.ment })
      this.actor.update({ "system.resistance_rolls.chann_es.race_mod": itemData.system.rr_mods.chan + itemData.system.rr_mods.ess })
      this.actor.update({ "system.resistance_rolls.ess_ment.race_mod": itemData.system.rr_mods.ess + itemData.system.rr_mods.ment })
      this.actor.update({ "system.resistance_rolls.arcane.race_mod": itemData.system.rr_mods.chan + itemData.system.rr_mods.ment + itemData.system.rr_mods.chan })
    }

    // To Do: Seperate Skills and Skill Categories. Increment Counts for items
    if (itemData.type === "skill_category") {
      // Get the already owned Items from the actor and push into an array
      const owneditems = this.object.getOwnedItemsByType("skill_category");
      let ownedskillcatlist = Object.values(owneditems);

      // Check if the dragged item is not in the array and not owned
      if (!ownedskillcatlist.includes(itemData.name)) {
        console.log("Not Owned!");
        await super._onDropItem(event, data);

        if (itemData.system.progression.toLowerCase()==="standard") {
          const item = this.actor.items.find(i => i.name === itemData.name);
          RankCalculator.calculateRanksBonus(item, 0, "-15*2*1*0.5*0");
        }
      }
    }
    else if (itemData.type === "skill") {
      const originalCategoryId = itemData.system.category;
      const originalCategory = game.items.get(originalCategoryId)
          ?? game.packs.get("rmss.skill-categories-es")?.index.get(originalCategoryId);

      if (!originalCategory) {
        ui.notifications.warn("No se ha podido encontrar la categoría original.");
        return;
      }

      const categoryName = originalCategory.name;
      const actorCategory = this.actor.items.find(i => i.type === "skill_category" && i.name === categoryName);

      if (!actorCategory) {
        ui.notifications.warn("El actor no tiene la categoría correspondiente.");
        return;
      }

      const ownedSkills = this.actor.items.filter(i => i.type === "skill");
      const alreadyOwned = ownedSkills.some(i => i.name === itemData.name);

      if (alreadyOwned) {
        ui.notifications.warn("Skill already acquired.");
        return;
      }

     const skillToCreate = {
        name: itemData.name,
        img: itemData.img,
        type: "skill",
       system: {
         ...foundry.utils.deepClone(itemData.system),
         category: actorCategory.id
       }
      };

       await this.actor.createEmbeddedDocuments("Item", [skillToCreate]);
    }
    else {
      super._onDropItem(event, data);
    }
  }

  _prepareCharacterData(context) {
    // Calculate Power Point Exhaustion
    let powerpointPercentage = (Number(context.system.attributes.power_points.current) / Number(context.system.attributes.power_points.max)) * 100;

    switch (true) {
      case (powerpointPercentage < 25):
        context.system.attributes.power_points.modifier = "PP Exhaustion Penalty: -30 ";
        break;
      case (powerpointPercentage < 50):
        context.system.attributes.power_points.modifier = "PP Exhaustion Penalty: -20 ";
        break;
      case (powerpointPercentage < 75):
        console.log("Less than 75");
        context.system.attributes.power_points.modifier = "PP Exhaustion Penalty: -10 ";
        break;
      default:
        console.log("Setting Default");
        context.system.attributes.power_points.modifier = "PP Exhaustion Penalty: 0 ";
    }

    // Calculate Exhaustion Point Penalty
    let exhaustionPercentage = (Number(context.system.attributes.exhaustion_points.current) / Number(context.system.attributes.exhaustion_points.max)) * 100;

    switch (true) {
      case (exhaustionPercentage < 1):
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: -100 ";
        break;
      case (exhaustionPercentage < 10):
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: -60 ";
        break;
      case (exhaustionPercentage < 25):
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: -30 ";
        break;
      case (exhaustionPercentage < 50):
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: -15 ";
        break;
      case (exhaustionPercentage < 75):
        console.log("Less than 75");
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: -5 ";
        break;
      default:
        console.log("Setting Default");
        context.system.attributes.exhaustion_points.modifier = "Exhaustion Penalty: 0 ";
    }

  }

  _prepareItems(context) {
    // Initialize containers
    const gear = [], playerskill = [], spellskill = [], skillcat = [];
    const languageskill = [], weapons = [], armor = [], herbs = [];
    const spells = [], spellists = [];

    // Iterate through items
    for (let i of context.items) {
      i.actorId = this.actor.id; // needed for uuid

      if (i.type === "item") gear.push(i);
      else if (i.type === "weapon") weapons.push(i);
      else if (i.type === "herb_or_poison") herbs.push(i);
      else if (i.type === "skill_category") skillcat.push(i);
      else if (i.type === "spell_list") spellists.push(i);
      else if (i.type === "skill") {
        const skillCategoryId = i.system.category;
        let skillCategory = this.actor.items.get(skillCategoryId);

        if (!skillCategory) {
          playerskill.push(i);
          continue;
        }

        if (!skillCategory.system.hasOwnProperty("skill_tab")) {
          skillCategory.system.skill_tab = "skills";
        }

        if (skillCategory.system.skill_tab === "spells") spellskill.push(i);
        else if (skillCategory.system.skill_tab === "languages") languageskill.push(i);
        else playerskill.push(i);
      }
      else if (i.type === "armor") armor.push(i);
      else if (i.type === "spell") spells.push(i);
    }

    // Sort skill categories and skills
    skillcat.sort((a, b) => a.name.localeCompare(b.name));
    playerskill.sort((a, b) => a.name.localeCompare(b.name));

    // Map spells to their spell lists using flags
    const spellsByList = {};
    for (let spell of spells) {
      const containerId = spell.flags?.rmss?.containerId;
      if (!containerId) continue;
      if (!spellsByList[containerId]) spellsByList[containerId] = [];
      spellsByList[containerId].push(spell);
    }

    // Sort spell lists by name and attach contents
    const spellistsWithContents = spellists.map(list => {
      const listId = list.id || list._id; // 👈 asegúrate de coger id o _id
      let contents = spellsByList[listId] || [];
      contents.sort((a, b) => (a.system.level || 0) - (b.system.level || 0));
      return {
        ...list,
        contents
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    // Assign to context
    context.gear = gear;
    context.skillcat = skillcat;
    context.playerskill = playerskill;
    context.weapons = weapons;
    context.armor = armor;
    context.herbs = herbs;
    context.spells = spells;
    context.spellskill = spellskill;
    context.spellists = spellistsWithContents;
    context.languageskill = languageskill;
    context.config = CONFIG.rmss;
  }

  async handleStatsPotElement(element, potentialStatsInput) {
    const inputValue = element.value;
    let roll = null;

    if (inputValue >= 20 && inputValue <= 24) {
      roll = new Roll("20+8d10");
    }
    else if (inputValue >= 25 && inputValue <= 34) {
      roll = new Roll("30+7d10");
    }
    if (inputValue >= 35 && inputValue <= 44) {
      roll = new Roll("40+6d10");
    }
    else if (inputValue >= 45 && inputValue <= 54) {
      roll = new Roll("50+5d10");
    }
    if (inputValue >= 55 && inputValue <= 64) {
      roll = new Roll("60+4d10");
    }
    else if (inputValue >= 65 && inputValue <= 74) {
      roll = new Roll("70+3d10");
    }
    if (inputValue >= 75 && inputValue <= 84) {
      roll = new Roll("80+2d10");
    }
    else if (inputValue >= 85 && inputValue <= 91) {
      roll = new Roll("90+1d10");
    }
    else if (inputValue >= 92 && inputValue <= 99) {
      const variable_roll = 100 - inputValue + 1;
      roll = new Roll(inputValue + "+1d" + variable_roll);
    }
    else if (inputValue === 100) {
      roll = new Roll("99+1d10");
    }

    await roll.evaluate();
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: game.i18n.format("rmss.chat.potential_roll", { total: roll.total, result: roll.result }),
      roll: roll
    });

    if (roll.total < element.value) {
      potentialStatsInput.value = element.value;
    }
    else {
      potentialStatsInput.value = roll.total;
    }

    await this.actor.update({[potentialStatsInput.name]: parseInt(potentialStatsInput.value)});
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

    //Calculate potential stats (only when you are level 0)
    html.find(".fa-dice.roll-stat").click(async ev => {
      const clickedElement = ev.currentTarget;
      const parentLi = clickedElement.closest('li');
      const input = parentLi.querySelector(".stat-pot");

      if (parentLi) {
        const closestStatsTemp = parentLi.querySelector('.stat-temp');

        if (closestStatsTemp) {
          if (this.actor.system.levelUp.isLevelZero) {
            this.handleStatsPotElement(closestStatsTemp, input);
          } else if(this.actor.system.levelUp.isLevelingUp) {
            let dps = parseInt(this.actor.system.levelUp.developmentPoints);

            if (dps < 8){
              return;
            }

            dps -=8;
            const statPath = ev.currentTarget.dataset.stat;
            const statName = statPath.split(".")[2];
            const stat = foundry.utils.getProperty(this.actor.system, `stats.${statName}`);
            await LevelUpManager.handleStatRoll(this.actor, statName, stat);
            this.actor.update({'system.levelUp.developmentPoints': dps});
          }
        }
      }

    });

    html.find(".split-stack").click(async ev => {
      ev.preventDefault();

      const li = ev.currentTarget.closest("[data-item-id]");
      const itemId = li.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;

      const max = item.system.quantity;
      const quantity = await Dialog.prompt({
        title: `Dividir pila de ${item.name}`,
        content: `<p>¿Cuántos quieres separar de la pila (${max} disponibles)?</p>
              <input type="number" id="split-qty" value="1" min="1" max="${max - 1}" />`,
        callback: html => parseInt(html.find("#split-qty").val()) || 0,
        rejectClose: false
      });

      if (!quantity || quantity <= 0 || quantity >= max) return;

      // Reducir la pila original
      await item.update({ "system.quantity": max - quantity });

      // Crear un nuevo ítem con la cantidad separada
      const newItemData = duplicate(item.toObject());
      newItemData.system.quantity = quantity;
      delete newItemData._id; // necesario para crear nuevo
      await this.actor.createEmbeddedDocuments("Item", [newItemData]);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Show Sheet Settings
    html.find(".import-skillcats").click(async ev => {
      let selectOptions = {};
      for (const pack of game.packs) {
        selectOptions[pack.metadata.id] = pack.metadata.label;
      }

      new game.rmss.applications.RMSSActorSheetConfig(selectOptions, this.actor).render(true);
    });

    // Check/Uncheck Favorite Skill
    html.find(".skill-favorite").click(ev => {
      const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));

      if (item.system.favorite === true) {
        item.update({ system: { favorite: false } });
      } else {
        item.update({ system: { favorite: true } });
      }
    });

    // Check/Uncheck Favorite Spell
    html.find(".spell-favorite").click(ev => {
      const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));

      if (item.system.favorite === true) {
        item.update({ system: { favorite: false } });
      } else {
        item.update({ system: { favorite: true } });
      }
    });

    // Wear/Remove Item
    html.find(".wearable").click(ev => {
      const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
      console.log(`Before change: ${item.system.equipped}`);
      if (item.system.worn === true) {
        console.log("Setting False");
        item.update({ system: { worn: false } });
      } else {
        console.log("Setting True");
        item.update({ system: { worn: true } });
      }
      console.log(`After change: ${item.system.equipped}`);
    });

    // Change New Ranks value when clicked in player sheet. From 0-3.
    html.find(".skill-newrank").click(ev => {
      if (!this.actor.system.levelUp.isLevelingUp) return;
      const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
      const category = this.actor.items.get(ev.currentTarget.getAttribute("data-category-id"));
      const progression = category.system.skill_progression;
      let progression_value = null;
      if (progression.split('*').length > 1) {
        progression_value = progression; //some special race value (PP development or body development)
      }
      else {
        progression_value = CONFIG.rmss.skill_progression[progression].progression; //otherwise (standard, limited, etc)
      }

      switch (ev.currentTarget.getAttribute("value")) {
        case "0":
          item.update({ system: { new_ranks: { value: 1 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;
          RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value),
            progression_value);
          break;

        case "1":
          item.update({ system: { new_ranks: { value: 2 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;
          RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value),
            progression_value);
          break;

        case "2":
          item.update({ system: { new_ranks: { value: 3 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;
          RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value),
            progression_value);
          break;

        case "3":
          console.log("Skill NewRanks is 3 setting to 0");
          item.update({ system: { new_ranks: { value: 0 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;
          RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, -3, progression_value),
            progression_value);
          break;
      }
    });

    // Change New Ranks value when clicked in player sheet. From 0-3.
    html.find(".skillcategory-newrank").click(ev => {
      if (!this.actor.system.levelUp.isLevelingUp) return;
      const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
      const progression_value = "-15*2*1*0.5*0" //standard progression value

      switch (ev.currentTarget.getAttribute("value")) {
        case "0":
          item.update({ system: { new_ranks: { value: 1 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;

          if (item.system.progression.toLowerCase() === "standard") {
            RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value), progression_value);
          }

          break;

        case "1":
          item.update({ system: { new_ranks: { value: 2 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;

          if (item.system.progression.toLowerCase() === "standard") {
            RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value), progression_value);
          }

          break;

        case "2":
          item.update({ system: { new_ranks: { value: 3 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;

          if (item.system.progression.toLowerCase() === "standard") {
            RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, 1, progression_value), progression_value);
          }

          break;

        case "3":
          item.update({ system: { new_ranks: { value: 0 } } });
          if (RankCalculator.payDevelopmentCost(this.actor, item)) break;

          if (item.system.progression.toLowerCase() === "standard") {
            RankCalculator.calculateRanksBonus(item, RankCalculator.increaseRanks(item, -3, progression_value), progression_value);
          }

          break;
      }
    });
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
}
