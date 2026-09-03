import RMSSCreatureAttackSheet from "./rmss_creature_attack.js";

/**
 * Alternate visual skin for the creature_attack item sheet ("Warden's Chrome"): same data and
 * event bindings as {@link RMSSCreatureAttackSheet} (inherited unchanged), only the template
 * and CSS scope differ. Selectable per-item from Foundry's own Sheet Configuration dialog
 * alongside the default creature attack sheet.
 *
 * The base class overrides `get template()` directly (rather than relying on
 * `this.options.template`), so that getter has to be overridden here too - merging a new
 * `defaultOptions.template` alone would be silently ignored.
 */
export default class RMSSCreatureAttackWardensChromeSheet extends RMSSCreatureAttackSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/items/rmss-creature-attack-wardens-chrome-sheet.hbs"
    });
  }

  get template() {
    return "systems/rmss/templates/sheets/items/rmss-creature-attack-wardens-chrome-sheet.hbs";
  }
}
