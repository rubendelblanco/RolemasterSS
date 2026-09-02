import RMSSLootSheet from "./rmss_loot_sheet.js";

/**
 * Alternate visual skin for the loot sheet ("Warden's Chrome"): same data, same interactions
 * and event bindings as {@link RMSSLootSheet} (inherited unchanged), only the template and
 * CSS scope differ. Selectable per-actor from Foundry's own Sheet Configuration dialog alongside
 * the default loot sheet.
 */
export default class RMSSLootWardensChromeSheet extends RMSSLootSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/actors/rmss-loot-wardens-chrome-sheet.html",
      classes: ["rmss", "sheet", "actor"]
    });
  }
}
