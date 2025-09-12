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
        return actor.items.filter(i =>
            i.getFlag("rmss", "containerId") === this.item.id
        );
    }

    canAccept(item) {
        const acceptedTags = this.item.system.acceptedItemTags ?? [];
        const itemTags = item.system.tags ?? [];

        if (acceptedTags.length === 0) return true;
        return itemTags.some(tag => acceptedTags.includes(tag));
    }

    getTotalWeight() {
        return this.contents.reduce(
            (sum, i) => sum + (i.system.weight * (i.system.quantity || 1)),
            0
        );
    }

    getTotalCount() {
        return this.contents.reduce((sum, i) => sum + (i.system.quantity || 1), 0);
    }

    isOverCapacity() {
        const type = this.item.system.containerType;

        if (type === "weight") {
            return this.getTotalWeight() > (this.item.system.capacity || 0);
        }

        if (type === "count") {
            return this.getTotalCount() > (this.item.system.maxItems || 0);
        }

        return false;
    }
}
