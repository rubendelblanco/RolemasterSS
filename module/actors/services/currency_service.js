import { socket } from "../../../rmss.js";

/**
 * Currency math for the 8-denomination RMSS money model (mithril..iron).
 * Kept separate from item_service.js since this has nothing to do with
 * item/container/skill grouping.
 */
export default class CurrencyService {

  /**
   * Sum a money object {mithril..iron} into a single integer of base units (iron = 1).
   * @param {object} money
   * @returns {number}
   */
  static toBaseUnits(money) {
    const rates = CONFIG.rmss.currency_exchange_rates;
    return Object.keys(rates).reduce(
      (sum, denom) => sum + (Number(money?.[denom]) || 0) * rates[denom],
      0
    );
  }

  /**
   * Nominal conversion of a base-unit amount into a given denomination (no rounding/minting).
   * @param {number} baseUnits
   * @param {string} denomination
   * @returns {number}
   */
  static baseUnitsToDenomination(baseUnits, denomination) {
    const rate = CONFIG.rmss.currency_exchange_rates[denomination];
    return rate ? baseUnits / rate : baseUnits;
  }

  /**
   * Attempt to spend `amountInBaseUnits` out of `money`. Does not mutate the input.
   * On success, the payer's ENTIRE remaining holdings are re-minted greedily from
   * highest to lowest denomination (total value is always exact; the specific coins
   * on hand are renormalized on every purchase).
   * @param {object} money
   * @param {number} amountInBaseUnits
   * @returns {{success: boolean, newMoney: object|null}}
   */
  static spend(money, amountInBaseUnits) {
    const total = this.toBaseUnits(money);
    if (total < amountInBaseUnits) return { success: false, newMoney: null };

    let remainder = total - amountInBaseUnits;
    const rates = CONFIG.rmss.currency_exchange_rates;
    const newMoney = {};
    for (const denom of Object.keys(rates)) {
      const rate = rates[denom];
      newMoney[denom] = Math.floor(remainder / rate);
      remainder -= newMoney[denom] * rate;
    }
    return { success: true, newMoney };
  }

  /**
   * Credit a merchant's till in the exact denomination an item was sold in.
   * No re-minting needed on the shop side, only the buyer's ability-to-pay does.
   * @param {Actor} merchantActor
   * @param {string} denomination
   * @param {number} amount
   */
  static async creditTill(merchantActor, denomination, amount) {
    const current = Number(merchantActor.system.money?.[denomination]) || 0;
    await merchantActor.update({ [`system.money.${denomination}`]: current + amount });
  }

  /** Clamp a requested {denom: qty} map down to what's actually available. */
  static clampAmounts(availableMoney, amounts) {
    const normalized = {};
    for (const denom of Object.keys(CONFIG.rmss.currency_exchange_rates)) {
      const available = Number(availableMoney?.[denom]) || 0;
      normalized[denom] = Math.max(0, Math.min(Number(amounts?.[denom]) || 0, available));
    }
    return normalized;
  }

  /** "3 gp, 12 cp" style summary, skipping zero denominations. */
  static formatBreakdown(amounts) {
    return Object.entries(amounts)
      .filter(([, qty]) => qty > 0)
      .map(([denom, qty]) => `${qty} ${game.i18n.localize(`rmss.currency_type_abb.${denom}`)}`)
      .join(", ");
  }

  /**
   * Player-facing: give some of sourceActor's own money to any actor with a token on
   * the current scene (PC, NPC, or creature). Unlike LootService's request/approve flow,
   * this is the sender's own money — no GM confirmation needed to give it away — but the
   * actual update still runs through the GM socket since the recipient (another player's
   * character, an NPC, a creature) is usually not owned by the sender.
   * @param {Actor} sourceActor
   * @param {Actor} receiverActor
   * @param {Record<string, number>} amounts - requested {denom: qty}, clamped to what's available
   */
  static async giveMoney(sourceActor, receiverActor, amounts) {
    const normalized = this.clampAmounts(sourceActor.system.money, amounts);
    const total = Object.values(normalized).reduce((sum, v) => sum + v, 0);
    if (total <= 0) {
      ui.notifications.warn(game.i18n.localize("rmss.money_transfer.no_money_selected"));
      return;
    }

    const result = await socket.executeAsGM("doMoneyGive", {
      sourceActorUuid: sourceActor.uuid,
      receiverActorUuid: receiverActor.uuid,
      amounts: normalized
    });

    if (!result?.success) {
      ui.notifications.warn(game.i18n.localize(
        result?.reason === "insufficient_funds"
          ? "rmss.money_transfer.insufficient_funds"
          : "rmss.money_transfer.request_entity_missing"
      ));
    }
  }

  /**
   * GM-side handler (see rmss.js socketlib registration): re-validates funds, moves the
   * coins, and posts a public chat message announcing the transfer.
   * @returns {Promise<{success: boolean, reason?: string}>}
   */
  static async executeGive({ sourceActorUuid, receiverActorUuid, amounts }) {
    const sourceActor = await fromUuid(sourceActorUuid);
    const receiverActor = await fromUuid(receiverActorUuid);
    if (!sourceActor || !receiverActor) return { success: false, reason: "not_found" };

    const denominations = Object.keys(CONFIG.rmss.currency_exchange_rates);
    for (const denom of denominations) {
      const requested = Number(amounts?.[denom]) || 0;
      const available = Number(sourceActor.system.money?.[denom]) || 0;
      if (requested > available) return { success: false, reason: "insufficient_funds" };
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

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      content: game.i18n.format("rmss.money_transfer.chat_message", {
        sender: sourceActor.name,
        receiver: receiverActor.name,
        breakdown: this.formatBreakdown(amounts)
      })
    });

    return { success: true };
  }
}
