import RMSSNpcSheet from "./rmss_npc_sheet.js";

/**
 * Alternate visual skin for the NPC sheet ("Warden's Chrome"): same data, same interactions
 * and event bindings as {@link RMSSNpcSheet} (inherited unchanged), only the template and CSS
 * scope differ. Selectable per-actor from Foundry's own Sheet Configuration dialog alongside
 * the default NPC sheet.
 */
export default class RMSSNpcWardensChromeSheet extends RMSSNpcSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/actors/rmss-npc-wardens-chrome-sheet.hbs",
      classes: ["rmss", "sheet", "actor"]
    });
  }
}
