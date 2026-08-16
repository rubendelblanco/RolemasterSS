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
}
