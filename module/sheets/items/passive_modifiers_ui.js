import { normalizePassiveModifiers } from "../../actors/services/passive_item_modifiers_service.js";

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 */
export function bindPassiveModifiersEditor(sheet, html) {
  if (!sheet.isEditable) return;

  html.find("[data-action='add-passive-modifier']").on("click", async (ev) => {
    ev.preventDefault();
    const mods = normalizePassiveModifiers(sheet.item.system?.passive_modifiers ?? []);
    mods.push({
      _id: foundry.utils.randomID(),
      target: "armor_magic",
      action: "add",
      value: 0,
      statKey: "strength",
      rrKey: "essence"
    });
    await sheet.item.update({ "system.passive_modifiers": mods });
    sheet.render(false);
  });

  html.find("[data-action='remove-passive-modifier']").on("click", async (ev) => {
    ev.preventDefault();
    const idx = parseInt(ev.currentTarget.dataset.index, 10);
    if (!Number.isInteger(idx) || idx < 0) return;
    const mods = normalizePassiveModifiers(sheet.item.system?.passive_modifiers ?? []);
    mods.splice(idx, 1);
    await sheet.item.update({ "system.passive_modifiers": mods });
    sheet.render(false);
  });
}
