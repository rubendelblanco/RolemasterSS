// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";

export default class RMSSSpellSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/spells/rmss-spell-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {async: true});

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      enrichedDescription: enrichedDescription
    };

    if (this.item.system.type === "BE") {
      const balls = CONFIG.rmss?.ballTables ?? [];
      const bolts = CONFIG.rmss?.boltTables ?? [];
      sheetData.beAttackTables = [...balls, ...bolts];
    }
    if (this.item.system.type === "DE") {
      const actor = this.item.actor;
      const isCreature = actor?.type === "creature";
      sheetData.isCreatureActor = isCreature;
      sheetData.boltTables = CONFIG.rmss?.boltTables ?? [];
      if (isCreature) {
        sheetData.creatureAttacks = this._getCreatureAttacks();
      } else {
        sheetData.directedSpellSkills = this._getDirectedSpellSkills();
      }
    }

    return sheetData;
  }

  /**
   * Get skills from the actor whose category has slug "directed-spells".
   * Used for DE spell skill selection. Returns empty array if no actor.
   * @returns {Array<{name: string}>}
   */
  _getDirectedSpellSkills() {
    const actor = this.item.actor;
    if (!actor?.items) return [];
    return actor.items
      .filter(i => i.type === "skill" && i.system?.categorySlug === "directed-spells")
      .map(s => ({ name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get creature_attacks from the actor. Used for DE spell on creatures (no skills).
   * @returns {Array<{name: string}>}
   */
  _getCreatureAttacks() {
    const actor = this.item.actor;
    if (!actor?.items) return [];
    return actor.items
      .filter(i => i.type === "creature_attack")
      .map(a => ({ name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @override */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();

    if (this.isEditable) {
      buttons.unshift({
        label: "Macro",
        class: "item-macro-button",
        icon: "fas fa-code",
        onclick: ev => this._onOpenMacroEditor(ev)
      });
    }

    return buttons;
  }

  _onOpenMacroEditor(event) {
    new ItemMacroEditor(this.item).render(true);
  }
}
