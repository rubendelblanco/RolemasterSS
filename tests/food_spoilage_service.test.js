/**
 * Tests for food_spoilage_service.js (Item#system.shelf_life_days / days_until_spoiled)
 */
import FoodSpoilageService from '../module/actors/services/food_spoilage_service.js';

describe('isTrackedFoodItem', () => {
    test('false for non-"item" types even with the food tag and a shelf life', () => {
        const weapon = { type: 'weapon', system: { shelf_life_days: 3, tags: ['food'] } };
        expect(FoodSpoilageService.isTrackedFoodItem(weapon)).toBe(false);
    });

    test('false when shelf_life_days is 0 or unset (tracking opt-in)', () => {
        expect(FoodSpoilageService.isTrackedFoodItem({ type: 'item', system: { tags: ['food'] } })).toBe(false);
        expect(FoodSpoilageService.isTrackedFoodItem({ type: 'item', system: { shelf_life_days: 0, tags: ['food'] } })).toBe(false);
    });

    test('false when the item has no "food" tag', () => {
        const rope = { type: 'item', system: { shelf_life_days: 30, tags: ['tool'] } };
        expect(FoodSpoilageService.isTrackedFoodItem(rope)).toBe(false);
    });

    test('true for a type "item" with the food tag and a positive shelf life', () => {
        const bread = { type: 'item', system: { shelf_life_days: 3, tags: ['food'] } };
        expect(FoodSpoilageService.isTrackedFoodItem(bread)).toBe(true);
    });

    test('tag matching is case-insensitive', () => {
        const bread = { type: 'item', system: { shelf_life_days: 3, tags: ['Food'] } };
        expect(FoodSpoilageService.isTrackedFoodItem(bread)).toBe(true);
    });

    test('legacy comma-separated tags string is accepted', () => {
        const bread = { type: 'item', system: { shelf_life_days: 3, tags: 'food, ration' } };
        expect(FoodSpoilageService.isTrackedFoodItem(bread)).toBe(true);
    });
});

describe('computeNextSpoilageState', () => {
    test('lazy-init: daysUntilSpoiled at 0 starts counting down from shelfLifeDays', () => {
        expect(FoodSpoilageService.computeNextSpoilageState(3, 0)).toEqual({ spoiled: false, remaining: 2 });
    });

    test('decrements an already-tracked item normally', () => {
        expect(FoodSpoilageService.computeNextSpoilageState(3, 2)).toEqual({ spoiled: false, remaining: 1 });
    });

    test('spoils when the last day passes', () => {
        expect(FoodSpoilageService.computeNextSpoilageState(3, 1)).toEqual({ spoiled: true, remaining: 0 });
    });

    test('a 1-day shelf life spoils on the very next rest', () => {
        expect(FoodSpoilageService.computeNextSpoilageState(1, 0)).toEqual({ spoiled: true, remaining: 0 });
    });

    test('never returns a negative remaining count', () => {
        expect(FoodSpoilageService.computeNextSpoilageState(0, 5).remaining).toBeGreaterThanOrEqual(0);
        expect(FoodSpoilageService.computeNextSpoilageState(3, 1).remaining).toBeGreaterThanOrEqual(0);
    });
});

describe('computeItemUpdateGuards', () => {
    test('no-op when changes touch neither tags nor shelf_life_days', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { quantity: 2 })).toEqual({});
    });

    test('removing the "food" tag from a tracked item clears both fields', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        const changes = { tags: [] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, changes)).toEqual({
            shelf_life_days: 0,
            days_until_spoiled: 0
        });
    });

    test('changing tags but keeping "food" (or an untracked item losing it) does nothing', () => {
        const trackedKeepsFood = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(trackedKeepsFood, { tags: ['food', 'ration'] })).toEqual({});

        const untracked = { shelf_life_days: 0, days_until_spoiled: 0, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(untracked, { tags: [] })).toEqual({});
    });

    test('shelf_life_days set from 0 to positive seeds days_until_spoiled to match', () => {
        const current = { shelf_life_days: 0, days_until_spoiled: 0, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 5 })).toEqual({
            days_until_spoiled: 5
        });
    });

    test('editing an already-positive shelf_life_days does not reset the countdown', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 5 })).toEqual({});
    });

    test('setting shelf_life_days back to 0 is not treated as "seeding" (only 0 -> positive is)', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 0 })).toEqual({});
    });

    test('lowering shelf_life_days below the current remaining days clamps days_until_spoiled to match', () => {
        const current = { shelf_life_days: 5, days_until_spoiled: 4, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 3 })).toEqual({
            days_until_spoiled: 3
        });
    });

    test('lowering shelf_life_days while still above the current remaining days does nothing', () => {
        const current = { shelf_life_days: 5, days_until_spoiled: 2, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 3 })).toEqual({});
    });

    test('raising shelf_life_days never needs to clamp (remaining days already fit under the old, lower ceiling)', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 3, tags: ['food'] };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, { shelf_life_days: 5 })).toEqual({});
    });

    test('both rules firing at once: the tag-removal clear wins, shelf_life_days seeding is skipped', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        const changes = { tags: [], shelf_life_days: 5 };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, changes)).toEqual({
            shelf_life_days: 0,
            days_until_spoiled: 0
        });
    });
});

describe('canMergeFreshness', () => {
    test('two untracked items (no shelf life on either side) are always compatible', () => {
        expect(FoodSpoilageService.canMergeFreshness({}, {})).toBe(true);
        expect(FoodSpoilageService.canMergeFreshness(
            { shelf_life_days: 0 },
            { shelf_life_days: 0, days_until_spoiled: 0 }
        )).toBe(true);
    });

    test('two tracked items with the same shelf life and same remaining days merge', () => {
        const a = { shelf_life_days: 5, days_until_spoiled: 2 };
        const b = { shelf_life_days: 5, days_until_spoiled: 2 };
        expect(FoodSpoilageService.canMergeFreshness(a, b)).toBe(true);
    });

    test('same shelf life but different remaining days does not merge (the reported bug)', () => {
        // 1 loaf bought with 5-day shelf life, 3 days pass (2 remaining), then a second
        // fresh 5-day loaf is bought (still at its full 5 remaining) - must not merge.
        const existing = { shelf_life_days: 5, days_until_spoiled: 2 };
        const incoming = { shelf_life_days: 5, days_until_spoiled: 5 };
        expect(FoodSpoilageService.canMergeFreshness(existing, incoming)).toBe(false);
    });

    test('different shelf_life_days values never merge, regardless of remaining days', () => {
        const existing = { shelf_life_days: 5, days_until_spoiled: 5 };
        const incoming = { shelf_life_days: 3, days_until_spoiled: 5 };
        expect(FoodSpoilageService.canMergeFreshness(existing, incoming)).toBe(false);
    });

    test('a tracked item never merges with an untracked one', () => {
        const tracked = { shelf_life_days: 5, days_until_spoiled: 5 };
        const untracked = { shelf_life_days: 0, days_until_spoiled: 0 };
        expect(FoodSpoilageService.canMergeFreshness(tracked, untracked)).toBe(false);
        expect(FoodSpoilageService.canMergeFreshness(untracked, tracked)).toBe(false);
    });
});
