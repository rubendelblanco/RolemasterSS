import { ContainerHandler } from "../module/actors/utils/container_handler.js";

function mockContainer(allowedTags) {
    return {
        id: "bag1",
        system: {
            is_container: true,
            container: { allowedTags }
        }
    };
}

function mockItem(type, tags) {
    return {
        type,
        system: { tags }
    };
}

describe("ContainerHandler.canAccept", () => {
    test("empty allowedTags accepts any item", () => {
        const h = new ContainerHandler(mockContainer([]));
        expect(h.canAccept(mockItem("item", []))).toBe(true);
        expect(h.canAccept(mockItem("weapon", ["arrow"]))).toBe(true);
    });

    test("null/undefined allowedTags treated as empty — accepts any", () => {
        const h = new ContainerHandler(mockContainer(null));
        expect(h.canAccept(mockItem("item", []))).toBe(true);
    });

    test("requires overlap between container allowedTags and item.system.tags", () => {
        const h = new ContainerHandler(mockContainer(["arrow", "bolt"]));
        expect(h.canAccept(mockItem("item", ["arrow"]))).toBe(true);
        expect(h.canAccept(mockItem("item", ["bolt"]))).toBe(true);
        expect(h.canAccept(mockItem("item", ["potion"]))).toBe(false);
    });

    test("matching is case-insensitive", () => {
        const h = new ContainerHandler(mockContainer(["Arrow"]));
        expect(h.canAccept(mockItem("item", ["arrow"]))).toBe(true);
    });

    test("legacy: item type string matches allowed tag", () => {
        const h = new ContainerHandler(mockContainer(["spell"]));
        expect(h.canAccept(mockItem("spell", []))).toBe(true);
    });
});
