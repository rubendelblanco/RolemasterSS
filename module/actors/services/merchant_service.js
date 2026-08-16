import CurrencyService from "./currency_service.js";
import RequestCardService from "../../chat/request_card_service.js";

const REQUEST_KIND = "merchantRequest";

/**
 * Sale orchestration for merchant actors. Direct sale (sellItem) is GM-only: the GM
 * operates the merchant sheet directly and already has write access to both the
 * merchant and the buyer, so no socket relay is needed (unlike ItemService.giveItem).
 *
 * Players with observer access instead go through requestItem/resolveRequest: the
 * request is posted as a chat card and the actual transaction only runs once the GM
 * clicks Accept, at which point it executes on the GM's own client (same no-socket
 * reasoning as sellItem).
 */
export default class MerchantService {

  /**
   * Sell `quantity` units of `item` (owned by merchantActor) to buyerActor.
   * GM-only, with user-facing notifications on success/failure.
   * @param {Actor} merchantActor
   * @param {Item} item
   * @param {Actor} buyerActor
   * @param {number} quantity
   * @returns {Promise<boolean>}
   */
  static async sellItem(merchantActor, item, buyerActor, quantity) {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("rmss.merchant.gm_only"));
      return false;
    }
    if (!buyerActor) {
      ui.notifications.warn(game.i18n.localize("rmss.merchant.no_buyer_selected"));
      return false;
    }
    const { success } = await this._executeSale(merchantActor, item, buyerActor, quantity, { notify: true });
    return success;
  }

  /**
   * Core sale mutation, shared by the GM's direct sell dialog and by an approved
   * player request. Re-validates stock/funds against current state before mutating
   * anything, since a request may sit unresolved for a while.
   * @returns {Promise<{success: boolean, reason?: string, quantity?: number}>} On success,
   *   `quantity` is how many actually changed hands — may be less than requested if stock
   *   shrank between the request and the GM's accept, so callers can report the true amount.
   */
  static async _executeSale(merchantActor, item, buyerActor, quantity, { notify = false } = {}) {
    const totalQty = Number(item.system.quantity) || 0;
    quantity = Math.max(1, Math.min(Number(quantity) || 0, totalQty));
    if (totalQty <= 0 || quantity <= 0) {
      if (notify) ui.notifications.warn(game.i18n.localize("rmss.merchant.out_of_stock"));
      console.warn("[RMSS] merchant sale blocked: out of stock", { itemId: item.id, itemName: item.name, totalQty, requestedQty: quantity });
      return { success: false, reason: "out_of_stock" };
    }

    // Unit cost/weight math, same approach as ItemService.splitStack.
    const totalCost = Number(item.system.cost) || 0;
    const totalWeight = Number(item.system.weight) || 0;
    const unitCost = totalQty > 0 ? Number((totalCost / totalQty).toFixed(2)) : 0;
    const unitWeight = totalQty > 0 ? Number((totalWeight / totalQty).toFixed(2)) : 0;
    const saleCost = Number((unitCost * quantity).toFixed(2));
    const saleWeight = Number((unitWeight * quantity).toFixed(2));
    const denomination = item.system.currency_type;

    // Affordability check first — nothing is mutated until we know the buyer can pay.
    const rate = CONFIG.rmss.currency_exchange_rates[denomination] || 1;
    const priceInBaseUnits = saleCost * rate;
    const { success, newMoney } = CurrencyService.spend(buyerActor.system.money, priceInBaseUnits);
    if (!success) {
      if (notify) ui.notifications.warn(game.i18n.format("rmss.merchant.insufficient_funds", { buyer: buyerActor.name }));
      console.warn("[RMSS] merchant sale blocked: insufficient funds", {
        buyerId: buyerActor.id, buyerName: buyerActor.name, denomination, rate,
        saleCost, priceInBaseUnits, buyerMoney: buyerActor.system.money,
        buyerTotalBaseUnits: CurrencyService.toBaseUnits(buyerActor.system.money)
      });
      return { success: false, reason: "insufficient_funds" };
    }

    // Grant the item to the buyer.
    const newItemData = foundry.utils.duplicate(item.toObject());
    delete newItemData._id;
    newItemData.system.quantity = quantity;
    newItemData.system.unitCost = unitCost;
    newItemData.system.unitWeight = unitWeight;
    newItemData.system.cost = saleCost;
    newItemData.system.weight = saleWeight;
    if (newItemData.flags?.rmss?.containerId) delete newItemData.flags.rmss.containerId;
    await buyerActor.createEmbeddedDocuments("Item", [newItemData]);

    // Decrement (or remove) the merchant's stock.
    const remaining = totalQty - quantity;
    if (remaining <= 0) {
      await item.delete();
    } else {
      await item.update({
        "system.quantity": remaining,
        "system.unitCost": unitCost,
        "system.unitWeight": unitWeight,
        "system.cost": Number((unitCost * remaining).toFixed(2)),
        "system.weight": Number((unitWeight * remaining).toFixed(2))
      });
    }

    // Debit the buyer last, then credit the till.
    await buyerActor.update({ "system.money": newMoney });
    await CurrencyService.creditTill(merchantActor, denomination, saleCost);

    if (notify) {
      ui.notifications.info(
        game.i18n.format("rmss.merchant.sale_success", { qty: quantity, item: item.name, buyer: buyerActor.name })
      );
    }
    return { success: true, quantity };
  }

  /**
   * Player-facing counterpart to sellItem: posts a chat card requesting the purchase
   * instead of mutating anything. Whispered to GMs and to the buyer's owner(s); the
   * GM-only Accept/Reject buttons are stripped client-side for everyone else
   * (see chat/hooks.js's ".rmss-chat-gm-only" handling).
   * @param {Actor} merchantActor
   * @param {Item} item
   * @param {Actor} buyerActor
   * @param {number} quantity
   */
  static async requestItem(merchantActor, item, buyerActor, quantity) {
    if (!buyerActor) {
      ui.notifications.warn(game.i18n.localize("rmss.merchant.no_buyer_selected"));
      return;
    }

    const totalQty = Number(item.system.quantity) || 0;
    quantity = Math.max(1, Math.min(Number(quantity) || 0, totalQty));
    if (totalQty <= 0 || quantity <= 0) {
      ui.notifications.warn(game.i18n.localize("rmss.merchant.out_of_stock"));
      return;
    }

    const totalCost = Number(item.system.cost) || 0;
    const unitCost = totalQty > 0 ? Number((totalCost / totalQty).toFixed(2)) : 0;
    const saleCost = Number((unitCost * quantity).toFixed(2));
    const denomination = item.system.currency_type;
    const currencyAbb = game.i18n.localize(`rmss.currency_type_abb.${denomination}`);

    // Quoted price is frozen into the card at request time, even if stock/cost
    // changes before the GM resolves it — the re-validation in _executeSale still
    // protects against actually completing a sale that no longer holds up.
    const bodyHtml = game.i18n.format("rmss.merchant.request_card_body", {
      buyer: RequestCardService.chip(buyerActor.img, buyerActor.name),
      qty: quantity,
      item: RequestCardService.chip(item.img, item.name),
      merchant: merchantActor.name,
      cost: saleCost,
      currency: currencyAbb
    });

    await RequestCardService.post({
      requestKind: REQUEST_KIND,
      title: game.i18n.localize("rmss.merchant.request_card_title"),
      icon: "fas fa-hand-holding-dollar",
      bodyHtml,
      speakerActor: merchantActor,
      receiverActor: buyerActor,
      data: {
        merchantActorUuid: merchantActor.uuid,
        itemUuid: item.uuid,
        buyerActorUuid: buyerActor.uuid,
        quantity,
        itemName: item.name,
        buyerName: buyerActor.name
      }
    });

    ui.notifications.info(game.i18n.localize("rmss.merchant.request_sent"));
  }

  /**
   * GM decision on a pending request (called from the chat card's Accept/Reject
   * buttons). Runs on the GM's own client, mirroring sellItem's no-socket approach.
   * @param {ChatMessage} message
   * @param {"accept"|"reject"} decision
   */
  static async resolveRequest(message, decision) {
    await RequestCardService.resolve(message, REQUEST_KIND, decision, {
      rejectedMessage: (data) => game.i18n.format("rmss.merchant.request_rejected_msg", { item: data.itemName }),
      onAccept: async (data) => {
        // Resolve by UUID (not game.actors.get/items.get by bare id): an unlinked token's
        // actor/items live in its ActorDelta, a different document than the world actor
        // that a bare id would resolve to. fromUuid follows that delta correctly.
        const item = await fromUuid(data.itemUuid);
        const merchantActor = item?.parent ?? await fromUuid(data.merchantActorUuid);
        const buyerActor = await fromUuid(data.buyerActorUuid);

        let result;
        if (!merchantActor || !buyerActor || !item) {
          console.warn("[RMSS] merchant request could not be resolved: missing entity", {
            merchantActor: !!merchantActor, buyerActor: !!buyerActor, item: !!item, data
          });
          result = { success: false, reason: "not_found" };
        } else {
          result = await this._executeSale(merchantActor, item, buyerActor, data.quantity);
        }

        if (result.success) {
          return {
            statusClass: "approved",
            // result.quantity (not data.quantity): stock may have shrunk since the
            // request, so the card must report what was actually handed over.
            statusMessage: game.i18n.format("rmss.merchant.sale_success", {
              qty: result.quantity, item: data.itemName, buyer: data.buyerName
            })
          };
        }
        return {
          statusClass: "stock_changed",
          statusMessage: game.i18n.localize(
            result.reason === "insufficient_funds"
              ? "rmss.merchant.insufficient_funds_short"
              : result.reason === "not_found"
                ? "rmss.merchant.request_entity_missing"
                : "rmss.merchant.request_stock_changed"
          )
        };
      }
    });
  }
}
