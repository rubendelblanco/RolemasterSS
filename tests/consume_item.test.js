import { jest } from '@jest/globals';
import { itemHasConsumableTag, consumeItem } from '../module/sheets/items/consume_item.js';

function makeItem(tags, quantity = 1) {
    return {
        system: { tags, quantity },
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
    };
}

describe('itemHasConsumableTag', () => {
    test('true when tags array includes "consumable"', () => {
        expect(itemHasConsumableTag(makeItem(["food", "consumable"]))).toBe(true);
    });

    test('true when tags is a comma-separated string', () => {
        expect(itemHasConsumableTag(makeItem("food, Consumable"))).toBe(true);
    });

    test('case-insensitive', () => {
        expect(itemHasConsumableTag(makeItem(["CONSUMABLE"]))).toBe(true);
    });

    test('false when tag absent', () => {
        expect(itemHasConsumableTag(makeItem(["food"]))).toBe(false);
    });

    test('false when tags missing entirely', () => {
        expect(itemHasConsumableTag({ system: {} })).toBe(false);
    });

    test('accepts a bare system object too', () => {
        expect(itemHasConsumableTag({ tags: ["consumable"] })).toBe(true);
    });
});

describe('consumeItem', () => {
    test('quantity 1: deletes the item', async () => {
        const item = makeItem(["food", "consumable"], 1);

        const result = await consumeItem(item);

        expect(result).toEqual({ itemDeleted: true, applied: true });
        expect(item.delete).toHaveBeenCalled();
        expect(item.update).not.toHaveBeenCalled();
    });

    test('quantity > 1: decrements quantity instead of deleting', async () => {
        const item = makeItem(["food", "consumable"], 5);

        const result = await consumeItem(item);

        expect(result).toEqual({ applied: true });
        expect(item.update).toHaveBeenCalledWith({ "system.quantity": 4 });
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('missing quantity defaults to 1 (deletes)', async () => {
        const item = { system: { tags: ["consumable"] }, update: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };

        const result = await consumeItem(item);

        expect(result).toEqual({ itemDeleted: true, applied: true });
        expect(item.delete).toHaveBeenCalled();
    });
});
