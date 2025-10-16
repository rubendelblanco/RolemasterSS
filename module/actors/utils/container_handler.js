// All comments in English as requested
export class ContainerHandler {
    constructor(item) {
        this.item = item;
    }

    static isContainer(item) {
        return item?.system?.is_container === true;
    }

    static for(item) {
        return this.isContainer(item) ? new ContainerHandler(item) : null;
    }

    get contents() {
        const actor = this.item.parent;
        if (!actor) return [];
        return actor.items.filter(i => i.getFlag("rmss", "containerId") === this.item.id);
    }

    canAccept(item) {
        const acceptedTags = this.item.system.acceptedItemTags ?? [];
        const itemTags = item.system.tags ?? [];
        if (acceptedTags.length === 0) return true;
        return itemTags.some(tag => acceptedTags.includes(tag));
    }

    getTotalWeight() {
        return this.contents.reduce(
            (sum, i) => sum + ((Number(i.system.weight) || 0)),
            0
        );
    }

    getTotalCount() {
        return this.contents.reduce(
            (sum, i) => sum + (Number(i.system.quantity) || 1),
            0
        );
    }

    // Normalize capacity type: support both "quantity" and legacy "count"
    get capacityType() {
        const t = this.item.system?.container?.capacityType ?? "weight";
        return t === "count" ? "quantity" : t;
    }

    // Max capacity numeric guard
    get maxCapacity() {
        return Number(this.item.system?.container?.maxCapacity) || 0;
    }

    /**
     * Used value in the appropriate unit:
     * - weight: total kg
     * - quantity: total items
     */
    get usedValue() {
        if (this.capacityType === "weight") return this.getTotalWeight();
        if (this.capacityType === "quantity") return this.getTotalCount();
        return 0;
    }

    /**
     * Used capacity as a percentage (0..100, rounded, clamped).
     */
    get usedPercent() {
        if (this.maxCapacity <= 0) return 0;
        const pct = (this.usedValue / this.maxCapacity) * 100;
        return Math.max(0, Math.min(100, Math.round(pct)));
    }

    isOverCapacity() {
        return this.usedValue > this.maxCapacity;
    }

    /**
     * Check if this container can fit an item without overflowing.
     * Returns true if it fits, false if not.
     */
    canFit(item) {
        let projectedUsed = this.usedValue;
        if (this.capacityType === "weight") {
            projectedUsed += (Number(item.system.weight) || 0);
        } else if (this.capacityType === "quantity") {
            projectedUsed += (Number(item.system.quantity) || 1);
        }
        return projectedUsed <= this.maxCapacity;
    }

    async recalc() {
        const used = this.usedValue;
        await this.item.update({ "system.container.usedCapacity": used });

        if (this.item.sheet.rendered) {
            this.item.sheet.render(false);
        }
    }

    /**
     * Ensure container is not over capacity.
     * If exceeded, eject the given item.
     */
    async enforceCapacity(item) {
        if (this.usedValue > this.maxCapacity) {
            await item.unsetFlag("rmss", "containerId");
            ui.notifications.error(
                `${item.name} no cabe en ${this.item.name} (excede la capacidad).`
            );
            await this.recalc();
            return false;
        }
        return true;
    }
}
