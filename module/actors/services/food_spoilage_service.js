import { getItemTagsArray, normalizeTagArray } from "../../sheets/items/item_tags_ui.js";
import { chatMessageOtherStyle } from "../../chat/chatMessages.js";

/**
 * Food items (tag "food", type "item") can spoil, tracked in days advanced by long rests
 * (1 rest = 1 day, see rmssLongRest hook). Opt-in per item: system.shelf_life_days <= 0
 * means spoilage isn't tracked at all - existing/mundane food items are unaffected unless
 * a GM explicitly gives them a shelf life.
 */
export default class FoodSpoilageService {
  /**
   * @param {Item} item
   * @returns {boolean}
   */
  static isTrackedFoodItem(item) {
    if (item?.type !== "item") return false;
    if (!(Number(item.system?.shelf_life_days) > 0)) return false;
    return getItemTagsArray(item.system).some((t) => t.toLowerCase() === "food");
  }

  /**
   * Pure decision step for one day passing on one tracked food item - no document access,
   * easily testable (mirrors advanceArtifactRecharge in enchantment_utils.js).
   * Lazy-init: a freshly-tracked item (daysUntilSpoiled still at its 0 default) starts
   * counting down from its own shelf life as of this rest, rather than needing a separate
   * creation/edit hook to seed it.
   * @param {number} shelfLifeDays
   * @param {number} daysUntilSpoiled
   * @returns {{spoiled: boolean, remaining: number}}
   */
  static computeNextSpoilageState(shelfLifeDays, daysUntilSpoiled) {
    const shelfLife = Number(shelfLifeDays) || 0;
    const current = Number(daysUntilSpoiled) || 0;
    const remaining = (current > 0 ? current : shelfLife) - 1;
    return { spoiled: remaining <= 0, remaining: Math.max(0, remaining) };
  }

  /**
   * Pure guard rules for an in-flight Item#update, applied via preUpdateItem: no document
   * access, easily testable.
   *  - The "food" tag being removed clears shelf_life_days/days_until_spoiled, so the item
   *    stops being tracked immediately (isTrackedFoodItem already requires the tag on every
   *    check, so this isn't needed to prevent an accidental delete - it's so the countdown
   *    doesn't linger stale and silently resume if "food" is ever re-added later).
   *  - shelf_life_days going from 0 (untracked) to a positive value seeds days_until_spoiled
   *    to match right away, rather than leaving it at 0 until the next long rest's lazy-init
   *    quietly kicks in - the GM should see the real countdown the moment they set it.
   * @param {object} currentSystem - item.system before the update
   * @param {object|undefined} changesSystem - the "system" part of the update's changes
   * @returns {object} partial system patch to merge into the update (empty if nothing to do)
   */
  static computeItemUpdateGuards(currentSystem, changesSystem) {
    if (!changesSystem) return {};
    const patch = {};

    if (changesSystem.tags !== undefined) {
      const hasFood = normalizeTagArray(changesSystem.tags).some((t) => t.toLowerCase() === "food");
      const wasTracked = (Number(currentSystem?.shelf_life_days) || 0) > 0;
      if (!hasFood && wasTracked) {
        patch.shelf_life_days = 0;
        patch.days_until_spoiled = 0;
      }
    }

    if (patch.shelf_life_days === undefined && changesSystem.shelf_life_days !== undefined) {
      const newShelfLife = Number(changesSystem.shelf_life_days) || 0;
      const oldShelfLife = Number(currentSystem?.shelf_life_days) || 0;
      if (newShelfLife > 0 && oldShelfLife <= 0) {
        patch.days_until_spoiled = newShelfLife;
      }
    }

    return patch;
  }

  /**
   * Whether two item system blobs are safe to merge into a single stack: same freshness
   * state, so quantity-merging a stackable item (rmss_character_sheet.js's drop-to-stack
   * handler) never silently overwrites or discards a different remaining shelf life.
   * Untracked items (shelf_life_days <= 0 on both sides) are always compatible.
   * @param {object} existingSystem
   * @param {object} incomingSystem
   * @returns {boolean}
   */
  static canMergeFreshness(existingSystem, incomingSystem) {
    const existingShelfLife = Number(existingSystem?.shelf_life_days) || 0;
    const incomingShelfLife = Number(incomingSystem?.shelf_life_days) || 0;
    if (existingShelfLife <= 0 && incomingShelfLife <= 0) return true;
    if (existingShelfLife !== incomingShelfLife) return false;

    const existingRemaining = Number(existingSystem?.days_until_spoiled) || 0;
    const incomingRemaining = Number(incomingSystem?.days_until_spoiled) || 0;
    return existingRemaining === incomingRemaining;
  }

  /**
   * Advance every tracked food item on the actor by one day (called once per long rest).
   * Items that run out of shelf life are deleted and a whispered (owner + GM) chat message
   * is posted per item.
   * @param {Actor} actor
   */
  static async advanceFoodSpoilage(actor) {
    if (!actor) return;

    const foodItems = actor.items.filter((i) => this.isTrackedFoodItem(i));
    if (foodItems.length === 0) return;

    const toUpdate = [];
    const toDelete = [];
    const spoiledItems = [];

    for (const item of foodItems) {
      const { spoiled, remaining } = this.computeNextSpoilageState(
        item.system.shelf_life_days,
        item.system.days_until_spoiled
      );

      if (spoiled) {
        toDelete.push(item.id);
        spoiledItems.push(item);
      } else {
        toUpdate.push({ _id: item.id, "system.days_until_spoiled": remaining });
      }
    }

    try {
      if (toUpdate.length > 0) await actor.updateEmbeddedDocuments("Item", toUpdate);
      if (toDelete.length > 0) await actor.deleteEmbeddedDocuments("Item", toDelete);
    } catch (err) {
      console.error("rmss | food_spoilage_service", err);
    }

    for (const item of spoiledItems) {
      await this._chatFoodSpoiled(actor, item);
    }
  }

  /**
   * @param {Actor} actor
   * @param {Item} item
   */
  static async _chatFoodSpoiled(actor, item) {
    // A stackable food item spoils as a whole stack (every unit came from the same batch, same
    // freshness) - say how many were lost, not just the name, or "5 rations" reads as "1 ration".
    const qty = Number(item.system?.quantity) || 1;
    const itemLabel = qty > 1 ? `${qty}x ${item.name}` : item.name;

    const content = `
      <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          ${actor.img ? `<img src="${actor.img}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;" />` : ""}
          <b style="color: #333;">${actor.name}</b>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${item.img ? `<img src="${item.img}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" />` : ""}
          <p style="color: #333; margin: 0; font-size: 14px;">
            ${game.i18n.format("rmss.item.food_spoiled_message", { item: itemLabel })}
          </p>
        </div>
      </div>`;

    const whispers = new Set();
    (game.users ?? []).filter((u) => actor.testUserPermission(u, "OWNER")).forEach((u) => whispers.add(u.id));
    (game.users ?? []).filter((u) => u.isGM).forEach((u) => whispers.add(u.id));

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      whisper: Array.from(whispers),
      ...chatMessageOtherStyle()
    });
  }
}
