import { jest } from '@jest/globals';
import { itemHasConsumableTag, consumeItem, confirmAndConsumeItem } from '../module/sheets/items/consume_item.js';

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

describe('confirmAndConsumeItem', () => {
    function makeActor(id = 'owner-1') {
        return {
            name: 'Bilbo',
            img: 'actor.webp',
            testUserPermission: jest.fn((user) => user.id === id || user.isGM)
        };
    }

    beforeEach(() => {
        global.Dialog = { confirm: jest.fn() };
        global.game.i18n.format = jest.fn((key, data) => `${key}::${JSON.stringify(data ?? {})}`);
        global.game.users = [
            { id: 'owner-1', isGM: false },
            { id: 'gm-1', isGM: true },
            { id: 'other-1', isGM: false }
        ];
        global.ChatMessage.create.mockClear();
    });
    afterEach(() => jest.restoreAllMocks());

    test('confirmed: consumes the item and posts a chat card to owners + GMs', async () => {
        global.Dialog.confirm.mockResolvedValue(true);
        const actor = makeActor();
        const item = makeItem(["food", "consumable"], 3);
        item.name = 'Ration';
        item.img = 'ration.webp';

        const result = await confirmAndConsumeItem(actor, item);

        expect(result).toEqual({ applied: true });
        expect(item.update).toHaveBeenCalledWith({ "system.quantity": 2 });
        expect(global.ChatMessage.create).toHaveBeenCalledTimes(1);
        const call = global.ChatMessage.create.mock.calls[0][0];
        expect(call.whisper.sort()).toEqual(['gm-1', 'owner-1']);
        expect(call.content).toContain('Ration');
    });

    test('declined: does not consume and does not post a chat card', async () => {
        global.Dialog.confirm.mockResolvedValue(false);
        const actor = makeActor();
        const item = makeItem(["food", "consumable"], 3);

        const result = await confirmAndConsumeItem(actor, item);

        expect(result).toEqual({ applied: false });
        expect(item.update).not.toHaveBeenCalled();
        expect(item.delete).not.toHaveBeenCalled();
        expect(global.ChatMessage.create).not.toHaveBeenCalled();
    });

    test('no actor or no item returns false without throwing', async () => {
        expect(await confirmAndConsumeItem(null, makeItem(["consumable"]))).toEqual({ applied: false });
        expect(await confirmAndConsumeItem(makeActor(), null)).toEqual({ applied: false });
        expect(global.Dialog.confirm).not.toHaveBeenCalled();
    });
});
