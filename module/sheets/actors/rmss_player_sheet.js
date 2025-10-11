import ExperiencePointsCalculator from '../experience/rmss_experience_manager.js';
import { InputTextSearchStrategy } from '../search/rmss_text_search.js';
import RMSSCharacterSheet from "./rmss_character_sheet.js";
import SkillService from "../../actors/services/skill_service.js";
import ItemService from "../../actors/services/item_service.js";
import StatService from "../../actors/services/stat_service.js";
import SkillCategoryService from "../../actors/services/skill_category_service.js";
import SkillDropHandler from "../../actors/drop_handlers/skill_drop_handler.js";

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
    }
    return context;
  }

  // Override this method to check for duplicates when things are dragged to the sheet
  // We don't want duplicate skills and skill categories.
  async _onDropItem(event, data) {
    const newItem = await Item.implementation.fromDropData(data);
    const itemData = newItem.toObject();

    if (itemData.type === "skill") {
      const handler = new SkillDropHandler(this.actor);
      return handler.handle(itemData);
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
    this._registerItemListeners(html);
    this._registerStatListeners(html);
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

  _registerItemListeners(html) {
    html.find(".spell-favorite, .skill-favorite").click(ev => this._onItemFavoriteClick(ev));
    html.find(".item-give").click(ev => this._onItemGiveClick(ev));
    html.find(".split-stack").click(ev => this._onItemSplitClick(ev));
    html.find(".wearable").click(ev => this._onItemWearableClick(ev));
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
}
