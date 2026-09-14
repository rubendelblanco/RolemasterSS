import { getItemTagsArray } from "./item_tags_ui.js";

/**
 * Plain (non-magic) consumables — food, drink, and the like — tagged "consumable" but not
 * already handled by the potion/rune magic-cast action in cast_enchantment_from_item.js.
 */

/**
 * @param {Item|{ system?: object }} itemOrSystem
 * @returns {boolean}
 */
export function itemHasConsumableTag(itemOrSystem) {
  const sys = itemOrSystem?.system ?? itemOrSystem;
  return getItemTagsArray(sys).some((t) => t.toLowerCase() === "consumable");
}

/**
 * Consumes one unit of a plain consumable item: decrements quantity, deleting the item once
 * it reaches zero — same pattern as the potion/rune single-use consumption in
 * cast_enchantment_from_item.js.
 * @param {Item} item
 * @returns {Promise<{applied: boolean, itemDeleted?: boolean}>}
 */
export async function consumeItem(item) {
  const qty = Number(item.system?.quantity) || 1;
  if (qty > 1) {
    await item.update({ "system.quantity": qty - 1 });
    return { applied: true };
  }
  await item.delete();
  return { itemDeleted: true, applied: true };
}
