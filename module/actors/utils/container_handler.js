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
        const raw = this.item.system?.container?.allowedTags;
        const acceptedTags = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(",").map(s => s.trim()).filter(Boolean) : []);
        if (acceptedTags.length === 0) return true;
        const itemTags = item.system?.tags ?? [];
        const itemType = item.type ?? "";
        return acceptedTags.some(tag => itemType === tag || (Array.isArray(itemTags) && itemTags.includes(tag)));
    }

    getTotalWeight() {
        const total = this.contents.reduce(
            (sum, i) => sum + ((Number(i.system.weight) || 0)),
            0
        );
        return Number(total.toFixed(2));
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

    /**
     * Eject items until container is under capacity.
     * Used when maxCapacity is reduced or to fix existing over-capacity state.
     * Ejects heaviest items first (weight) or by count (quantity).
     */
    async enforceCapacityByEjectingUntilUnder() {
        while (this.usedValue > this.maxCapacity && this.contents.length > 0) {
            let toEject;
            if (this.capacityType === "weight") {
                toEject = this.contents.reduce((heaviest, i) => {
                    const w = Number(i.system?.weight) || 0;
                    return w > (Number(heaviest?.system?.weight) || 0) ? i : heaviest;
                });
            } else {
                toEject = this.contents[0];
            }
            await toEject.unsetFlag("rmss", "containerId");
            ui.notifications.warn(
                game.i18n.format("rmss.container.ejected_over_capacity", {
                    item: toEject.name,
                    container: this.item.name
                })
            );
        }
        await this.recalc();
    }
}
