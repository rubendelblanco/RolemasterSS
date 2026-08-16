import RequestCardService from "../../chat/request_card_service.js";

const ITEM_REQUEST_KIND = "lootItemRequest";
const MONEY_REQUEST_KIND = "lootMoneyRequest";

/**
 * Loot orchestration for "loot" actors (fixed containers — chest, stash...). Unlike
 * MerchantService there is no payment: taking an item or money is free. Players
 * request a pickup, which posts a chat card; the GM's Accept re-validates what's
 * still there (another player may have taken it first) before actually moving it.
 * Runs on the GM's own client once accepted, same no-socket reasoning as MerchantService.
 */
export default class LootService {

  // --- Items --------------------------------------------------------------

  /**
   * Player-facing: posts a chat card requesting to take `quantity` units of `item`
   * from sourceActor. Nothing is mutated until the GM accepts.
   * @param {Actor} sourceActor
   * @param {Item} item
   * @param {Actor} receiverActor
   * @param {number} quantity
   */
  static async requestItem(sourceActor, item, receiverActor, quantity) {
    if (!receiverActor) {
      ui.notifications.warn(game.i18n.localize("rmss.loot.no_receiver_selected"));
      return;
    }

    const totalQty = Number(item.system.quantity) || 0;
    quantity = Math.max(1, Math.min(Number(quantity) || 0, totalQty));
    if (totalQty <= 0 || quantity <= 0) {
      ui.notifications.warn(game.i18n.localize("rmss.loot.out_of_stock"));
      return;
    }

    const bodyHtml = game.i18n.format("rmss.loot.item_request_card_body", {
      receiver: RequestCardService.chip(receiverActor.img, receiverActor.name),
      qty: quantity,
      item: RequestCardService.chip(item.img, item.name),
      source: sourceActor.name
    });

    await RequestCardService.post({
      requestKind: ITEM_REQUEST_KIND,
      title: game.i18n.localize("rmss.loot.item_request_card_title"),
      icon: "fa-duotone fa-solid fa-treasure-chest",
      bodyHtml,
      speakerActor: sourceActor,
      receiverActor,
      data: {
        sourceActorUuid: sourceActor.uuid,
        itemUuid: item.uuid,
        receiverActorUuid: receiverActor.uuid,
        quantity,
        itemName: item.name,
        receiverName: receiverActor.name
      }
    });

    ui.notifications.info(game.i18n.localize("rmss.loot.request_sent"));
  }

  /**
   * GM decision on a pending item request.
   * @param {ChatMessage} message
   * @param {"accept"|"reject"} decision
   */
  static async resolveItemRequest(message, decision) {
    await RequestCardService.resolve(message, ITEM_REQUEST_KIND, decision, {
      rejectedMessage: (data) => game.i18n.format("rmss.loot.item_request_rejected_msg", { item: data.itemName }),
      onAccept: async (data) => {
        // Resolve by UUID, not by bare id: an unlinked token's items live in its
        // ActorDelta, a different document than the world actor a bare id would hit.
        const item = await fromUuid(data.itemUuid);
        const sourceActor = item?.parent ?? await fromUuid(data.sourceActorUuid);
        const receiverActor = await fromUuid(data.receiverActorUuid);

        let result;
        if (!sourceActor || !receiverActor || !item) {
          console.warn("[RMSS] loot item request could not be resolved: missing entity", {
            sourceActor: !!sourceActor, receiverActor: !!receiverActor, item: !!item, data
          });
          result = { success: false, reason: "not_found" };
        } else {
          result = await this._executeItemTransfer(sourceActor, item, receiverActor, data.quantity);
        }

        if (result.success) {
          return {
            statusClass: "approved",
            // result.quantity (not data.quantity): stock may have shrunk since the
            // request, so the card must report what was actually handed over.
            statusMessage: game.i18n.format("rmss.loot.item_taken_success", {
              qty: result.quantity, item: data.itemName, receiver: data.receiverName
            })
          };
        }
        return {
          statusClass: "stock_changed",
          statusMessage: game.i18n.localize(
            result.reason === "not_found" ? "rmss.loot.request_entity_missing" : "rmss.loot.request_stock_changed"
          )
        };
      }
    });
  }

  /**
   * Core item transfer, re-validated against current stock (another player may have
   * taken some/all of it while this request sat unresolved). No cost/currency at all.
   * @returns {Promise<{success: boolean, reason?: string, quantity?: number}>} On success,
   *   `quantity` is how many actually changed hands — may be less than requested if stock
   *   shrank between the request and the GM's accept, so callers can report the true amount.
   */
  static async _executeItemTransfer(sourceActor, item, receiverActor, quantity) {
    const totalQty = Number(item.system.quantity) || 0;
    quantity = Math.max(1, Math.min(Number(quantity) || 0, totalQty));
    if (totalQty <= 0 || quantity <= 0) {
      console.warn("[RMSS] loot item transfer blocked: out of stock", { itemId: item.id, itemName: item.name, totalQty, requestedQty: quantity });
      return { success: false, reason: "out_of_stock" };
    }

    // Unit weight/cost math, same approach as ItemService.splitStack — cost is kept
    // proportional purely for downstream bookkeeping (e.g. later appraisal/sale),
    // it is never charged to the receiver here.
    const totalWeight = Number(item.system.weight) || 0;
    const totalCost = Number(item.system.cost) || 0;
    const unitWeight = totalQty > 0 ? Number((totalWeight / totalQty).toFixed(2)) : 0;
    const unitCost = totalQty > 0 ? Number((totalCost / totalQty).toFixed(2)) : 0;
    const takenWeight = Number((unitWeight * quantity).toFixed(2));
    const takenCost = Number((unitCost * quantity).toFixed(2));

    const newItemData = foundry.utils.duplicate(item.toObject());
    delete newItemData._id;
    newItemData.system.quantity = quantity;
    newItemData.system.unitWeight = unitWeight;
    newItemData.system.weight = takenWeight;
    newItemData.system.unitCost = unitCost;
    newItemData.system.cost = takenCost;
    if (newItemData.flags?.rmss?.containerId) delete newItemData.flags.rmss.containerId;
    await receiverActor.createEmbeddedDocuments("Item", [newItemData]);

    const remaining = totalQty - quantity;
    if (remaining <= 0) {
      await item.delete();
    } else {
      await item.update({
        "system.quantity": remaining,
        "system.unitWeight": unitWeight,
        "system.weight": Number((unitWeight * remaining).toFixed(2)),
        "system.unitCost": unitCost,
        "system.cost": Number((unitCost * remaining).toFixed(2))
      });
    }

    return { success: true, quantity };
  }

  // --- Money ----------------------------------------------------------------

  /**
   * Player-facing: posts a chat card requesting specific coins from sourceActor's
   * money. `amounts` is a partial {denomination: qty} map; anything missing/over
   * what's currently there is clamped down before the request is even created.
   * @param {Actor} sourceActor
   * @param {Actor} receiverActor
   * @param {Record<string, number>} amounts
   */
  static async requestMoney(sourceActor, receiverActor, amounts) {
    if (!receiverActor) {
      ui.notifications.warn(game.i18n.localize("rmss.loot.no_receiver_selected"));
      return;
    }

    const normalized = this._clampAmounts(sourceActor.system.money, amounts);
    const total = Object.values(normalized).reduce((sum, v) => sum + v, 0);
    if (total <= 0) {
      ui.notifications.warn(game.i18n.localize("rmss.loot.no_money_selected"));
      return;
    }

    const bodyHtml = game.i18n.format("rmss.loot.money_request_card_body", {
      receiver: RequestCardService.chip(receiverActor.img, receiverActor.name),
      source: sourceActor.name,
      breakdown: this._formatMoneyBreakdown(normalized)
    });

    await RequestCardService.post({
      requestKind: MONEY_REQUEST_KIND,
      title: game.i18n.localize("rmss.loot.money_request_card_title"),
      icon: "fas fa-coins",
      bodyHtml,
      speakerActor: sourceActor,
      receiverActor,
      data: {
        sourceActorUuid: sourceActor.uuid,
        receiverActorUuid: receiverActor.uuid,
        amounts: normalized,
        receiverName: receiverActor.name
      }
    });

    ui.notifications.info(game.i18n.localize("rmss.loot.request_sent"));
  }

  /**
   * GM decision on a pending money request.
   * @param {ChatMessage} message
   * @param {"accept"|"reject"} decision
   */
  static async resolveMoneyRequest(message, decision) {
    await RequestCardService.resolve(message, MONEY_REQUEST_KIND, decision, {
      rejectedMessage: () => game.i18n.localize("rmss.loot.money_request_rejected_msg"),
      onAccept: async (data) => {
        const sourceActor = await fromUuid(data.sourceActorUuid);
        const receiverActor = await fromUuid(data.receiverActorUuid);

        let result;
        if (!sourceActor || !receiverActor) {
          console.warn("[RMSS] loot money request could not be resolved: missing entity", {
            sourceActor: !!sourceActor, receiverActor: !!receiverActor, data
          });
          result = { success: false, reason: "not_found" };
        } else {
          result = await this._executeMoneyTransfer(sourceActor, receiverActor, data.amounts);
        }

        if (result.success) {
          return {
            statusClass: "approved",
            statusMessage: game.i18n.format("rmss.loot.money_taken_success", {
              receiver: data.receiverName,
              breakdown: this._formatMoneyBreakdown(data.amounts)
            })
          };
        }
        return {
          statusClass: "stock_changed",
          statusMessage: game.i18n.localize(
            result.reason === "not_found" ? "rmss.loot.request_entity_missing" : "rmss.loot.money_request_stock_changed"
          )
        };
      }
    });
  }

  /**
   * Core money transfer: moves the exact requested coins, re-validated against
   * current balances (another player may have taken some first). No exchange-rate
   * math at all — these are specific physical coins, not a converted payment.
   * @returns {Promise<{success: boolean, reason?: string}>}
   */
  static async _executeMoneyTransfer(sourceActor, receiverActor, amounts) {
    const denominations = Object.keys(CONFIG.rmss.currency_exchange_rates);
    for (const denom of denominations) {
      const requested = Number(amounts?.[denom]) || 0;
      const available = Number(sourceActor.system.money?.[denom]) || 0;
      if (requested > available) {
        console.warn("[RMSS] loot money transfer blocked: insufficient coins", { denom, requested, available });
        return { success: false, reason: "insufficient_funds" };
      }
    }

    const sourceUpdate = {};
    const receiverUpdate = {};
    for (const denom of denominations) {
      const requested = Number(amounts?.[denom]) || 0;
      if (requested <= 0) continue;
      sourceUpdate[`system.money.${denom}`] = (Number(sourceActor.system.money?.[denom]) || 0) - requested;
      receiverUpdate[`system.money.${denom}`] = (Number(receiverActor.system.money?.[denom]) || 0) + requested;
    }
    if (Object.keys(sourceUpdate).length) await sourceActor.update(sourceUpdate);
    if (Object.keys(receiverUpdate).length) await receiverActor.update(receiverUpdate);

    return { success: true };
  }

  /** Clamp a requested {denom: qty} map down to what's actually available. */
  static _clampAmounts(availableMoney, amounts) {
    const normalized = {};
    for (const denom of Object.keys(CONFIG.rmss.currency_exchange_rates)) {
      const available = Number(availableMoney?.[denom]) || 0;
      normalized[denom] = Math.max(0, Math.min(Number(amounts?.[denom]) || 0, available));
    }
    return normalized;
  }

  /** "3 gp, 12 cp" style summary, skipping zero denominations. */
  static _formatMoneyBreakdown(amounts) {
    return Object.entries(amounts)
      .filter(([, qty]) => qty > 0)
      .map(([denom, qty]) => `${qty} ${game.i18n.localize(`rmss.currency_type_abb.${denom}`)}`)
      .join(", ");
  }
}
