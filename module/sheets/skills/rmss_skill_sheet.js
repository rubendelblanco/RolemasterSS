// Our Item Sheet extends the default
import RankCalculator from "../../skills/rmss_rank_calculator.js";

export default class RMSSSkillSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/races/rmss-skill-sheet.html",
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/skills/rmss-skill-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

    // Get a list of the parent item's skill categories for the dropdown
    let ownedSkillCategories = this.prepareSkillCategoryValues();

    // Figure out if a valid Skill Category is already selected
    let selectedSkillCategory = this.prepareSelectedSkillCategory(ownedSkillCategories, this.object.system.category);

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      owned_skillcats: ownedSkillCategories,
      enrichedDescription: enrichedDescription,
      selected_skillcat: selectedSkillCategory,
      designations: CONFIG.rmss.skill_designations
    };

    return sheetData;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const actor = this.item.actor;
    const category_skill = actor.items.get(this.item.system.category);
    let progression;

    if (category_skill.system.skill_progression.split('*').length > 1) {
      progression = category_skill.system.skill_progression //some special race value (PP development or body development)
    }
    else {
      progression = CONFIG.rmss.skill_progression[category_skill.system.skill_progression].progression;
    }

    html.find('input[name="system.ranks"]').blur(async ev => {
      // Ensure numeric value from the input
      const raw = ev.currentTarget.value;
      const total = Number(raw);

      // Guard against NaN
      if (Number.isNaN(total)) return;

      await RankCalculator.applyAbsoluteRanksAndBonus(this.item, total, progression);
    })

    // Catch the event when the user clicks one of the New Ranks Checkboxes in a Skill.
    // It will increment by one or wrap back to zero on a value of three
    html.find(".skillsheet-newrank").click(ev => {
      if (!this.item.parent) {
        return;
      }

      if (this.item.parent) {
        let actor = this.item.parent;
        if (!actor.system.levelUp.isLevelingUp) return;
      }

      switch (ev.currentTarget.getAttribute("value")) {
        case "0":
          this.object.update({system: {new_ranks: { value: 1 }}});
          RankCalculator.applyRanksAndBonus(this.item,RankCalculator.increaseRanks(this.item,1,progression),
              progression);
          break;
        case "1":
          this.object.update({system: {new_ranks: { value: 2 }}});
          RankCalculator.applyRanksAndBonus(this.item,RankCalculator.increaseRanks(this.item,1,progression),
              progression);
          break;
        case "2":
          this.object.update({system: {new_ranks: { value: 3 }}});
          RankCalculator.applyRanksAndBonus(this.item,RankCalculator.increaseRanks(this.item,1,progression),
              progression);
          break;
        case "3":
          debugger;
          this.object.update({system: {new_ranks: { value: 0 }}});
          RankCalculator.applyRanksAndBonus(this.item,RankCalculator.increaseRanks(this.item,-3,progression),
              progression);
          break;
      }
    });
  }

  // Skills are related to Skill Categories so we need something to allow the user to choose that relationship
  // If this Skill is owned then we will return a list of Skill Categories and allow them to choose
  // Otherwise we'll just return 'Skill has no owner'
  prepareSkillCategoryValues() {
    let skillNoOwner = {None: "Skill Has No Owner"};

    if (this.item.isEmbedded === null) {
      return (skillNoOwner);
    }
    else
    {
      if (!this.item.parent){
        return CONFIG.rmss.skillCategories.map(cat => [cat.id, cat.name]);
      }
      const skillCategories = this.item.parent.getOwnedItemsByType("skill_category");
      console.log(skillCategories);
      return Object.entries(skillCategories)
          .sort((a, b) => a[1].localeCompare(b[1]));
    }
  }

  // Determine which Skill Category is selected and test that it is in the current list of categories.
  // If it isn't set it to None.
  prepareSelectedSkillCategory(ownedSkillCategories, selectedSkillCategory) {
    let defaultSelectedCategory = "None";
    if (Object.keys(ownedSkillCategories).includes(selectedSkillCategory)) {
      return (selectedSkillCategory);
    } else {
      return (defaultSelectedCategory);
    }
  }

  // Populate the Skill Category Bonus field on the Skill Sheet.
  // Iterate through the owned skill categories and if one of them matches the item id of currently
  // selected skill category then set the Skill Category Bonus field to the Total Bonus field of the Skill Category
  prepareSelectedSkillCategoryBonus(selected_skillcat) {
    if (this.item.isEmbedded === null) {
      console.log("Skill has no owner");
    }
    else
    {
      const items = this.object.parent.items;

      for (const item of items) {
        if (item.type === "skill_category" && item._id === selected_skillcat) {
          console.log(`rmss | rmss_skill_sheet | Calculating Skill Category bonus for skill: ${this.object.name}`);
          this.object.system.category_bonus = item.system.total_bonus;
        }
      }
    }
  }
}
