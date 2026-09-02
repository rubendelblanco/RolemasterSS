import RMSSMerchantSheet from "./rmss_merchant_sheet.js";

/**
 * Alternate visual skin for the merchant sheet ("Warden's Chrome"): same data, same interactions
 * and event bindings as {@link RMSSMerchantSheet} (inherited unchanged), only the template and
 * CSS scope differ. Selectable per-actor from Foundry's own Sheet Configuration dialog alongside
 * the default merchant sheet.
 */
export default class RMSSMerchantWardensChromeSheet extends RMSSMerchantSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/rmss/templates/sheets/actors/rmss-merchant-wardens-chrome-sheet.html",
      classes: ["rmss", "sheet", "actor"]
    });
  }
}
