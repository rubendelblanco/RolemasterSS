import ItemService from "./item_service.js";

/** Item types that a merchant/loot stock table can hold — same grouping as their sheets. */
const STOCK_TYPES = ["item", "weapon", "armor", "herb_or_poison"];

/**
 * Populates a merchant's or loot container's stock by drawing from a Foundry
 * RollTable, similar to Monk's Enhanced Journal's "Populate from Rollable Table".
 * GM-only, local action — no chat card/confirmation involved (unlike the
 * request-based flows), since it's just the GM stocking their own shop/chest.
 */
export default class RollTableStockService {

  /**
   * @param {Actor} actor - merchant or loot actor to populate.
   * @param {RollTable} table
   * @param {object} options
   * @param {number} options.draws - how many times to roll on the table.
   * @param {boolean} options.resetWhenExhausted - auto-reset drawn results once the table runs out.
   * @param {string} options.quantityFormula - fixed number or Roll formula (e.g. "1d4"), rolled per drawn item.
   * @param {"keep"|"clear"} options.clearItems - clear the actor's existing stock before populating.
   * @param {"add"|"ignore"} options.duplicateItems - when a drawn item already exists in stock,
   *   either add to its quantity or leave it untouched (Enhanced Journal's own two options).
   * @returns {Promise<{added: number, skipped: number}>}
   */
  static async populate(actor, table, { draws = 1, resetWhenExhausted = false, quantityFormula = "1", clearItems = "keep", duplicateItems = "add" } = {}) {
    if (clearItems === "clear") {
      const ids = actor.items.filter(i => STOCK_TYPES.includes(i.type)).map(i => i.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    }

    let added = 0;
    let skipped = 0;

    for (let i = 0; i < draws; i++) {
      const draw = await this._drawOne(table, resetWhenExhausted);
      if (!draw) break; // table exhausted and not allowed to reset — stop early

      for (const result of draw.results) {
        const doc = result.documentUuid ? await fromUuid(result.documentUuid) : null;
        if (!doc || doc.documentName !== "Item" || !STOCK_TYPES.includes(doc.type)) {
          skipped++;
          continue;
        }

        const stackable = ItemService.isStackable(doc);
        const qty = stackable ? await this._rollQuantity(quantityFormula) : 1; // weapons/armor: always 1, never a stack
        const existing = actor.items.find(i => STOCK_TYPES.includes(i.type) && ItemService.equals(i, doc));

        if (existing) {
          if (duplicateItems !== "add") {
            skipped++;
            continue;
          }
          if (stackable) {
            await this._increaseStock(existing, qty);
          } else {
            // Not stackable — a second draw of the same weapon/armor becomes its own
            // separate entry instead of merging into an ambiguous "x2".
            await this._addNewStock(actor, doc, qty);
          }
          added++;
          continue;
        }

        await this._addNewStock(actor, doc, qty);
        added++;
      }
    }

    return { added, skipped };
  }

  /**
   * One RollTable#draw(), auto-resetting and retrying once if the table is exhausted
   * and resetWhenExhausted is true. Returns null if nothing could be drawn.
   */
  static async _drawOne(table, resetWhenExhausted) {
    try {
      return await table.draw({ displayChat: false });
    } catch (err) {
      if (!resetWhenExhausted) {
        console.warn("[RMSS] populate from table: table exhausted", err);
        return null;
      }
      await (table.resetResults ? table.resetResults() : table.reset());
      try {
        return await table.draw({ displayChat: false });
      } catch (err2) {
        console.warn("[RMSS] populate from table: draw failed even after reset", err2);
        return null;
      }
    }
  }

  /** Fixed number or dice formula (e.g. "1", "1d4") — Roll handles both. */
  static async _rollQuantity(formula) {
    const roll = new Roll(String(formula || "1"));
    await roll.evaluate();
    return Math.max(1, Math.round(roll.total));
  }

  /** Merge a newly-drawn quantity into an already-present stock item. */
  static async _increaseStock(item, addQty) {
    const currentQty = Number(item.system.quantity) || 0;
    const unitCost = ItemService.getUnitCost(item, currentQty);
    const unitWeight = ItemService.getUnitWeight(item, currentQty);
    const newQty = currentQty + addQty;
    await item.update({
      "system.quantity": newQty,
      "system.unitCost": unitCost,
      "system.unitWeight": unitWeight,
      "system.cost": Number((unitCost * newQty).toFixed(2)),
      "system.weight": Number((unitWeight * newQty).toFixed(2))
    });
  }

  /** Clone the drawn source document (world or compendium item) into the actor's stock. */
  static async _addNewStock(actor, sourceDoc, qty) {
    const sourceQty = Number(sourceDoc.system.quantity) || 1;
    const unitCost = ItemService.getUnitCost(sourceDoc, sourceQty);
    const unitWeight = ItemService.getUnitWeight(sourceDoc, sourceQty);

    const newItemData = foundry.utils.duplicate(sourceDoc.toObject());
    delete newItemData._id;
    // A merchant knows its own stock, even when it's freshly rolled from a table - but loot
    // (chests, corpses) keeps whatever identification the source document had, since finding
    // it is the whole point of needing to identify it.
    if (actor.type === "merchant") newItemData.system.identified = true;
    newItemData.system.quantity = qty;
    newItemData.system.unitCost = unitCost;
    newItemData.system.unitWeight = unitWeight;
    newItemData.system.cost = Number((unitCost * qty).toFixed(2));
    newItemData.system.weight = Number((unitWeight * qty).toFixed(2));
    if (newItemData.flags?.rmss?.containerId) delete newItemData.flags.rmss.containerId;

    await actor.createEmbeddedDocuments("Item", [newItemData]);
  }
}
