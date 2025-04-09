import RankCalculator from './rmss_rank_calculator.js';
import * as CONFIG from "../../config.js";

// Our Item Sheet extends the default
export default class RMSSSkillCategorySheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 580,
      height: 440,
      template: "systems/rmss/templates/sheets/skills/rmss-skill-category-sheet.html",
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/skills/rmss-skill-category-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const context = await super.getData();

    // Get a list of stats that can be used as applicable stats
    let applicableStatList = this.prepareApplicableStatNames(CONFIG);

    // Get the currently selected value for all three applicable stats
    let firstApplicableStat = this.prepareApplicableSelectedStat("app_stat_1");
    let secondApplicableStat = this.prepareApplicableSelectedStat("app_stat_2");
    let thirdApplicableStat = this.prepareApplicableSelectedStat("app_stat_3");

    let applicableCategoryProgression = this.prepareCategoryProgression(CONFIG);
    let applicableSkillProgression = this.prepareSkillProgression(CONFIG);

    const actor = this.item.actor;

    if (actor) {
      const stat_fixed_info = actor.system.race_stat_fixed_info;
      const body_development_skill = {
        'name': stat_fixed_info.body_development_progression,
        'data': stat_fixed_info.body_development_progression
      }
      const pp_development_skill = {
        'name': stat_fixed_info.pp_development_progression,
        'data': stat_fixed_info.pp_development_progression
      }

      const progression_regex = /^\d{1,2}\*\d{1,2}\*\d{1,2}\*\d{1,2}\*\d{1,2}$/;

      if (progression_regex.test(stat_fixed_info.body_development_progression)) {
        applicableSkillProgression[stat_fixed_info.body_development_progression] = body_development_skill
      }

      if (progression_regex.test(stat_fixed_info.pp_development_progression)) {
        applicableSkillProgression[stat_fixed_info.pp_development_progression] = pp_development_skill
      }
    }

    // Build and apply the display string for Applicable Stats
    let applicableStatText =
        this.buildApplicableStatsText(firstApplicableStat, secondApplicableStat, thirdApplicableStat);
    context.item.system.applicable_stats = applicableStatText;

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: context.item,
      system: context.item.system,
      config: CONFIG.rmss,
      applicable_stat_list: applicableStatList,
      applicable_stat_1_selected: firstApplicableStat,
      applicable_stat_2_selected: secondApplicableStat,
      applicable_stat_3_selected: thirdApplicableStat,
      category_progression: applicableCategoryProgression,
      skill_progression: applicableSkillProgression,
      enrichedDescription: enrichedDescription,
      skill_tab: CONFIG.rmss.skill_tab
    };
    return sheetData;
  }

  async _setApplicableStat(item, ev) {
    // Build a JSON Object from the selected tag value and selected name (item data attribute key)
    let updateKey = ev.currentTarget.getAttribute("name");
    let updateData = ev.target.value;

    // Update Item Data
    await item.update({[updateKey]: updateData});
  }

  // Each Skill Category can have up to three Applicable Stats that apply to it. We need to get a list of
  // the Stat Shortnames from Config so the user can select which stats are applicable to this Skill Category
  prepareApplicableStatNames(config) {
    let applicableStatList = {None: "None"};
    for (const item in config.rmss.stats) {
      applicableStatList[config.rmss.stats[item].shortname] = config.rmss.stats[item].shortname;
    }
    return applicableStatList;
  }

  prepareCategoryProgression(config){
    let progressionCategoryList = {};
    for ( const item in config.rmss.skill_category_progression) {
      progressionCategoryList[config.rmss.skill_category_progression[item].name] = {
        'data': config.rmss.skill_category_progression[item].data,
        'name': config.rmss.skill_category_progression[item].name
      };
    }
    return progressionCategoryList;
  }

  prepareSkillProgression(config){
    let progressionSkillList = {};
    for ( const item in config.rmss.skill_progression) {
      progressionSkillList[config.rmss.skill_progression[item].name] = {
        'data': config.rmss.skill_progression[item].data,
        'name': config.rmss.skill_progression[item].name
      };
    }
    return progressionSkillList;
  }

  // Get the values for the currently selected Applicable Stat so we can display it on the Skill Category Sheet
  // If nothing is selected return an empty string.
  prepareApplicableSelectedStat(appStat) {
    let applicableStatSelected = "";
    applicableStatSelected = this.item.system[appStat];
    return applicableStatSelected;
  }

  // The character sheet has an information field that displays the applicable stats in the following format
  // St/Ag/St. This method checks the current applicable stats and builds that field so
  // it can be displayed to the user.
  buildApplicableStatsText(firstAppStat, secondAppStat, thirdAppStat) {
    if (firstAppStat === "None") {
      return ("None");
    }
    else if (firstAppStat !== "None" && secondAppStat === "None") {
      return (firstAppStat);
    }
    else if (firstAppStat !== "None" && secondAppStat !== "None" && thirdAppStat === "None" ) {
      return (`${firstAppStat}/${secondAppStat}`);
    }
    else if (firstAppStat !== "None" && secondAppStat !== "None" && thirdAppStat !== "None" ) {
      return (`${firstAppStat}/${secondAppStat}/${thirdAppStat}`);
    }
    else {
      return ("None");
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    //Calculate rank bonus if ranks field change
    html.find('input[name="system.ranks"]').blur(ev => {
      const total_ranks = ev.currentTarget.value;

      if (this.item.system.progression.toLowerCase()==="standard") {
        RankCalculator.calculateRanksBonus(this.item, total_ranks, "-15*2*1*0.5*0");
      }
    })

    // Every time the user selects one of the Applicable Stat dropdowns
    // fire an event to change the value in the Skill Category
    html.find(".stat-selector").change(ev => {
      this._setApplicableStat(this.item, ev);
    });

    html.find('select[name="system.progression"]').change(ev => {
      const selection = ev.currentTarget.value;
      let total_ranks = document.querySelector('[name="system.ranks"]').value;

      if (selection==="standard") {
        RankCalculator.calculateRanksBonus(this.item, total_ranks, "-15*2*1*0.5*0");
      }
      else {
        this.item.update({ 'system.rank_bonus': 0 });
        this.item.update({ 'system.ranks': 0 });
        this.item.update({ 'system.progression': selection });
        console.log(this.item);
      }
    });

    // Catch the event when the user clicks one of the New Ranks Checkboxes in a Skill Category.
    // It will increment by one or wrap back to zero on a value of three
    html.find(".skillcategorysheet-newrank").click(ev => {
      if (!this.item.parent) {
        return;
      }

      if (this.item.parent) {
        let actor = this.item.parent;
        if (!actor.system.levelUp.isLevelingUp) return;
      }

      var selected_cat = html.find('select[name="system.progression"]').val();

      if (selected_cat !== "Standard") {
        return false;
      }

      switch (ev.currentTarget.getAttribute("value")) {
        case "0":
          this.object.update({system: {new_ranks: { value: 1 }}});
          break;
        case "1":
          this.object.update({system: {new_ranks: { value: 2 }}});
          break;
        case "2":
          this.object.update({system: {new_ranks: { value: 3 }}});
          break;
        case "3":
          this.object.update({system: {new_ranks: { value: 0 }}});
          break;
      }
    });

  }
}
