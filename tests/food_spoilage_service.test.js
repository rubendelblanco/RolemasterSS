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

    test('both rules firing at once: the tag-removal clear wins, shelf_life_days seeding is skipped', () => {
        const current = { shelf_life_days: 3, days_until_spoiled: 1, tags: ['food'] };
        const changes = { tags: [], shelf_life_days: 5 };
        expect(FoodSpoilageService.computeItemUpdateGuards(current, changes)).toEqual({
            shelf_life_days: 0,
            days_until_spoiled: 0
        });
    });
});
