// Centralized logic for stackable items without adding fields to system.
// Uses flags rmss.unitWeight / rmss.unitCost to remember unit values.

export class StackableItemHandler {
    constructor(item) {
        this.item = item;
    }

    /** Get per-unit weight, preferring flag; fallback: total/qty */
    getUnitWeight(item = this.item) {
        const flagged = item.getFlag("rmss", "unitWeight");
        if (typeof flagged === "number") return flagged;
        const qty = Math.max(1, item.system.quantity || 1);
        const unit = (Number(item.system.weight) || 0) / qty;
        // Persist once to avoid drift
        item.setFlag("rmss", "unitWeight", unit).catch(() => {});
        return unit;
    }

    /** Get per-unit cost, preferring flag; fallback: total/qty */
    getUnitCost(item = this.item) {
        const flagged = item.getFlag("rmss", "unitCost");
        if (typeof flagged === "number") return flagged;
        const qty = Math.max(1, item.system.quantity || 1);
        const unit = (Number(item.system.cost) || 0) / qty;
        item.setFlag("rmss", "unitCost", unit).catch(() => {});
        return unit;
    }

    /** Whether both items are allowed to stack and match by identity */
    canStackWith(other) {
        if (!other) return false;

        // Respect the is_stackable toggle (default true if undefined)
        const aStack = this.item.system.is_stackable ?? true;
        const bStack = other.system.is_stackable ?? true;
        if (!aStack || !bStack) return false;

        // Name + description must match
        const sameName = this.item.name === other.name;
        const sameDesc = (this.item.system.description || "") === (other.system.description || "");
        if (!sameName || !sameDesc) return false;

        // Compare per-unit weight/cost with small tolerance
        const eps = 1e-6;
        const wA = this.getUnitWeight(this.item);
        const wB = this.getUnitWeight(other);
        const cA = this.getUnitCost(this.item);
        const cB = this.getUnitCost(other);

        return Math.abs(wA - wB) < eps && Math.abs(cA - cB) < eps;
    }

    /** Recalculate totals from unit flags and current quantity */
    async recalcTotals() {
        const qty = Math.max(1, Number(this.item.system.quantity) || 1);
        const totalWeight = this.getUnitWeight() * qty;
        const totalCost = this.getUnitCost() * qty;
        await this.item.update({
            "system.weight": totalWeight,
            "system.cost": totalCost
        });
    }

    /** Stack source into target (same actor), then delete source */
    static async stackItems(targetItem, sourceItem) {
        const handler = new StackableItemHandler(targetItem);
        if (!handler.canStackWith(sourceItem)) return false;

        // Ensure unit flags are set from a reliable source
        const unitWeight = handler.getUnitWeight(sourceItem);
        const unitCost = handler.getUnitCost(sourceItem);
        await targetItem.setFlag("rmss", "unitWeight", unitWeight);
        await targetItem.setFlag("rmss", "unitCost", unitCost);

        const addQty = Math.max(1, Number(sourceItem.system.quantity) || 1);
        const oldQty = Math.max(1, Number(targetItem.system.quantity) || 1);
        const newQty = oldQty + addQty;

        await targetItem.update({
            "system.quantity": newQty,
            "system.weight": unitWeight * newQty,
            "system.cost": unitCost * newQty
        });

        await sourceItem.delete();
        return true;
    }
}
