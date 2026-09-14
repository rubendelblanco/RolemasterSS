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
 * Asks for confirmation before spending a plain consumable, then consumes it and posts the chat
 * card announcing it. Shared by the sheet's ".item-consume" click and the Argon HUD's Consumables
 * panel button, so both ask before burning a unit of something instead of silently decrementing
 * it with no feedback.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<{applied: boolean, itemDeleted?: boolean}>}
 */
export async function confirmAndConsumeItem(actor, item) {
  if (!actor || !item) return { applied: false };

  const confirmed = await Dialog.confirm({
    title: game.i18n.localize("rmss.dialogs.confirm_consume_title"),
    content: buildDeleteConfirmContent(item.img, game.i18n.format("rmss.dialogs.confirm_consume_item", { name: item.name })),
    defaultYes: false
  });
  if (!confirmed) return { applied: false };

  const result = await consumeItem(item);
  if (result.applied) {
    await _chatItemConsumed(actor, item);
    await FastingService.markAteFoodToday(actor, item);
  }
  return result;
}
