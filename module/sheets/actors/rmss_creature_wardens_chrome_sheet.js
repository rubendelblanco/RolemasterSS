import RMSSCreatureSheet from "./rmss_creature_sheet.js";

/**
 * Alternate visual skin for the creature sheet ("Warden's Chrome"): same data, same interactions
 * and event bindings as {@link RMSSCreatureSheet} (inherited unchanged), only the template and
 * CSS scope differ. Selectable per-actor from Foundry's own Sheet Configuration dialog alongside
 * the default creature sheet.
 */
export default class RMSSCreatureWardensChromeSheet extends RMSSCreatureSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/actors/rmss-creature-wardens-chrome-sheet.hbs",
      classes: ["rmss", "sheet", "actor"]
    });
  }
}
