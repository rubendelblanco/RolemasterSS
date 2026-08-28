import RMSSPlayerSheet from "./rmss_player_sheet.js";

/**
 * Alternate visual skin for the player character sheet ("Warden's Chrome"): same data,
 * same interactions and event bindings as {@link RMSSPlayerSheet} (inherited unchanged),
 * only the template and CSS scope differ. Selectable per-actor from Foundry's own
 * Sheet Configuration dialog alongside the default sheet.
 */
export default class RMSSWardensChromeSheet extends RMSSPlayerSheet {

  static get defaultOptions() {
    // NOTE: `classes` here lands on Foundry's outer window-app element (alongside the title
    // bar), not on the sheet's own <form> - so it is NOT used to scope the Warden's Chrome
    // CSS (that would style the title bar too). The "wardens-chrome" scoping class is set
    // directly on the <form> in rmss-wardens-chrome-sheet.html instead.
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/actors/rmss-wardens-chrome-sheet.html",
      classes: ["rmss", "sheet", "actor"]
    });
  }
}
