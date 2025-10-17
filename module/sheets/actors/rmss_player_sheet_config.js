export default class RMSSActorSheetConfig extends FormApplication {
  constructor(selectOptions, character) {
    super();
    this.selectOptions = selectOptions;
    this.character = character;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form"],
      popOut: true,
      template: "systems/rmss/templates/sheets/actors/apps/actor-settings.html"
    });
  }

  getData() {
    // Send data to the template
    return {
      selectOptions: this.selectOptions
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
  }

}

