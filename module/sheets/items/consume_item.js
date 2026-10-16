import { getItemTagsArray } from "./item_tags_ui.js";
import { buildDeleteConfirmContent } from "./item_delete_confirm_util.js";
import { whisperIdsForOwnersAndGMs, chatMessageOtherStyle } from "../../chat/chatMessages.js";
import FastingService from "../../actors/services/fasting_service.js";

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
 * Guard for preUpdateItem: food is always a consumable, so tagging something "food" implies
 * "consumable" too - no need to type both by hand. Pure/testable, mirrors
 * FoodSpoilageService.computeItemUpdateGuards. Only looks at the incoming tags (a full
 * replacement, not a merge, same assumption the spoilage guard makes) - a no-op unless tags are
 * actually part of this update.
 * @param {object|undefined} changesSystem - the "system" part of the update's changes
 * @returns {object} partial system patch to merge into the update (empty if nothing to do)
 */
export function computeFoodImpliesConsumableGuard(changesSystem) {
  if (!changesSystem || changesSystem.tags === undefined) return {};
  const tags = getItemTagsArray({ tags: changesSystem.tags });
  const hasFood = tags.some((t) => t.toLowerCase() === "food");
  const hasConsumable = tags.some((t) => t.toLowerCase() === "consumable");
  if (!hasFood || hasConsumable) return {};
  return { tags: [...tags, "consumable"] };
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

/**
 * Chat card announcing a plain consumable was used — visible to the actor's owners and every
 * GM, same audience/style as FoodSpoilageService's spoilage message (actor portrait/name header,
 * item icon + message below).
 * @param {Actor} actor
 * @param {Item} item
 */
async function _chatItemConsumed(actor, item) {
  const content = `
    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
        ${actor.img ? `<img src="${actor.img}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;" />` : ""}
        <b style="color: #333;">${actor.name}</b>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        ${item.img ? `<img src="${item.img}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" />` : ""}
        <p style="color: #333; margin: 0; font-size: 14px;">
          ${game.i18n.format("rmss.item.item_consumed_message", { item: item.name })}
        </p>
      </div>
    </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    whisper: whisperIdsForOwnersAndGMs(actor),
    ...chatMessageOtherStyle()
  });
}

/**
 * Index (into system.magic.enchantments) of the first single-use enchantment, or null.
 * A consumable carrying one casts that spell when consumed.
 * @param {Item|{ system?: object }} item
 * @returns {number|null}
 */
export function findSingleUseEnchantmentIndex(item) {
  const enchantments = item?.system?.magic?.enchantments;
  if (!Array.isArray(enchantments)) return null;
  const index = enchantments.findIndex((e) => e?.usage === "single");
  return index >= 0 ? index : null;
}

/**
 * Asks for confirmation before spending a plain consumable, then consumes it and posts the chat
 * card announcing it. Shared by the sheet's ".item-consume" click and the Argon HUD's Consumables
 * panel button, so both ask before burning a unit of something instead of silently decrementing
 * it with no feedback.
 *
 * What consuming does, besides spending the unit:
 * - the consumable carries a single-use spell: that spell is cast (its own macro runs with it) and the
 *   unit is spent only if the cast went through, so a cancelled cast keeps the item;
 * - otherwise: the item's own macro runs, if it has one, before the unit is spent.
 * @param {Actor} actor
 * @param {Item} item
 * @param {{ castEnchantment?: Function }} [options] castEnchantment replaces the real spell cast (tests)
 * @returns {Promise<{applied: boolean, itemDeleted?: boolean}>}
 */
export async function confirmAndConsumeItem(actor, item, { castEnchantment } = {}) {
  if (!actor || !item) return { applied: false };

  const confirmed = await Dialog.confirm({
    title: game.i18n.localize("rmss.dialogs.confirm_consume_title"),
    content: buildDeleteConfirmContent(item.img, game.i18n.format("rmss.dialogs.confirm_consume_item", { name: item.name })),
    defaultYes: false
  });
  if (!confirmed) return { applied: false };

  let result;
  const spellIndex = findSingleUseEnchantmentIndex(item);
  if (spellIndex !== null) {
    const cast = castEnchantment ?? (await import("./cast_enchantment_from_item.js")).castEnchantmentFromItem;
    result = await cast(actor, item, spellIndex, { consumeUnit: true });
    if (!result?.applied) return { applied: false };
  } else {
    await item._executeItemMacro?.();
    result = await consumeItem(item);
  }
  if (result.applied) {
    await _chatItemConsumed(actor, item);
    await FastingService.markAteFoodToday(actor, item);
  }
  return result;
}
