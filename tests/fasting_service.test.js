/**
 * Tests for fasting_service.js (Ayuno Total: -15/day cumulative penalty from day 2 without
 * eating a "food"-tagged item, +5/day recovered by eating again).
 */
import { jest } from '@jest/globals';
import FastingService from '../module/actors/services/fasting_service.js';

describe('itemIsFood', () => {
    test('true for the "food" tag', () => {
        expect(FastingService.itemIsFood({ system: { tags: ['food'] } })).toBe(true);
    });

    test('case-insensitive', () => {
        expect(FastingService.itemIsFood({ system: { tags: ['Food'] } })).toBe(true);
    });

    test('comma-separated tags string is accepted', () => {
        expect(FastingService.itemIsFood({ system: { tags: 'food, ration' } })).toBe(true);
    });

    test('false for other tags (e.g. "consumable" alone)', () => {
        expect(FastingService.itemIsFood({ system: { tags: ['consumable'] } })).toBe(false);
    });

    test('false when tags missing entirely', () => {
        expect(FastingService.itemIsFood({ system: {} })).toBe(false);
    });
});

describe('computeNextFastingState', () => {
    test('day 1 without eating: streak 1, no penalty yet, just a reminder message', () => {
        expect(FastingService.computeNextFastingState(false, 0, 0)).toEqual({
            streak: 1, penalty: 0, message: 'missed_meal'
        });
    });

    test('day 2 without eating: -15', () => {
        expect(FastingService.computeNextFastingState(false, 1, 0)).toEqual({
            streak: 2, penalty: -15, message: 'penalty'
        });
    });

    test('day 3 without eating: -30', () => {
        expect(FastingService.computeNextFastingState(false, 2, -15)).toEqual({
            streak: 3, penalty: -30, message: 'penalty'
        });
    });

    test('day 4 without eating: -45', () => {
        expect(FastingService.computeNextFastingState(false, 3, -30)).toEqual({
            streak: 4, penalty: -45, message: 'penalty'
        });
    });

    test('eating resets the streak and recovers +5 toward 0', () => {
        expect(FastingService.computeNextFastingState(true, 3, -30)).toEqual({
            streak: 0, penalty: -25, message: 'recovering'
        });
    });

    test('eating that fully clears an existing debt reports "recovered"', () => {
        expect(FastingService.computeNextFastingState(true, 0, -5)).toEqual({
            streak: 0, penalty: 0, message: 'recovered'
        });
    });

    test('eating while already at 0 penalty: no change, no message', () => {
        expect(FastingService.computeNextFastingState(true, 0, 0)).toEqual({
            streak: 0, penalty: 0, message: 'none'
        });
    });

    test('takes 3 consecutive days of eating to fully shed 1 day worth of fasting (-15)', () => {
        let state = { streak: 0, penalty: -15 };
        state = FastingService.computeNextFastingState(true, state.streak, state.penalty);
        expect(state.penalty).toBe(-10);
        state = FastingService.computeNextFastingState(true, state.streak, state.penalty);
        expect(state.penalty).toBe(-5);
        state = FastingService.computeNextFastingState(true, state.streak, state.penalty);
        expect(state.penalty).toBe(0);
        expect(state.message).toBe('recovered');
    });
});

describe('markAteFoodToday', () => {
    test('sets ateFoodToday when the item is tagged "food"', async () => {
        const actor = { setFlag: jest.fn().mockResolvedValue(undefined) };
        const bread = { system: { tags: ['food'] } };
        await FastingService.markAteFoodToday(actor, bread);
        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'ateFoodToday', true);
    });

    test('no-op when the item is not tagged "food"', async () => {
        const actor = { setFlag: jest.fn().mockResolvedValue(undefined) };
        const torch = { system: { tags: ['consumable', 'light'] } };
        await FastingService.markAteFoodToday(actor, torch);
        expect(actor.setFlag).not.toHaveBeenCalled();
    });

    test('no actor: no-op without throwing', async () => {
        await expect(FastingService.markAteFoodToday(null, { system: { tags: ['food'] } })).resolves.toBeUndefined();
    });
});

describe('advanceFastingDay', () => {
    function makeActor({ ateFoodToday = false, missedMealStreak = 0, fastingPenalty = 0, effects = [] } = {}) {
        const flags = { ateFoodToday, missedMealStreak, fastingPenalty };
        return {
            name: 'Bilbo',
            img: 'actor.webp',
            uuid: 'Actor.abc',
            getFlag: jest.fn((scope, key) => flags[key]),
            setFlag: jest.fn(async (scope, key, value) => { flags[key] = value; }),
            effects,
            createEmbeddedDocuments: jest.fn().mockResolvedValue([])
        };
    }

    beforeEach(() => {
        global.CONFIG = { rmss: { paths: { icons_folder: 'systems/rmss/assets/default/' } } };
        global.game.i18n.format = jest.fn((key, data) => `${key}::${JSON.stringify(data ?? {})}`);
        global.game.users = [{ id: 'owner-1', isGM: false }, { id: 'gm-1', isGM: true }];
        global.ChatMessage.create.mockClear();
    });
    afterEach(() => jest.restoreAllMocks());

    test('day 1 without eating: no effect created, reminder chat only', async () => {
        const actor = makeActor({ ateFoodToday: false, missedMealStreak: 0, fastingPenalty: 0 });
        actor.testUserPermission = jest.fn(() => true);

        await FastingService.advanceFastingDay(actor);

        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'missedMealStreak', 1);
        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'fastingPenalty', 0);
        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'ateFoodToday', false);
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(global.ChatMessage.create).toHaveBeenCalledTimes(1);
    });

    test('day 2 without eating: creates the Penalty effect at -15', async () => {
        const actor = makeActor({ ateFoodToday: false, missedMealStreak: 1, fastingPenalty: 0 });
        actor.testUserPermission = jest.fn(() => true);

        await FastingService.advanceFastingDay(actor);

        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'fastingPenalty', -15);
        expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [
            expect.objectContaining({
                name: 'Penalty',
                flags: { rmss: { value: -15, permanentPenalty: true, fastingPenalty: true } }
            })
        ]);
    });

    test('another day without eating updates the existing fasting Penalty effect in place', async () => {
        const existingEffect = {
            name: 'Penalty',
            flags: { rmss: { value: -15, permanentPenalty: true, fastingPenalty: true } },
            update: jest.fn().mockResolvedValue(undefined)
        };
        const actor = makeActor({ ateFoodToday: false, missedMealStreak: 2, fastingPenalty: -15, effects: [existingEffect] });
        actor.testUserPermission = jest.fn(() => true);

        await FastingService.advanceFastingDay(actor);

        expect(existingEffect.update).toHaveBeenCalledWith({ 'flags.rmss.value': -30 });
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test('eating deletes the fasting Penalty effect once the debt reaches 0', async () => {
        const existingEffect = {
            name: 'Penalty',
            flags: { rmss: { value: -5, permanentPenalty: true, fastingPenalty: true } },
            delete: jest.fn().mockResolvedValue(undefined)
        };
        const actor = makeActor({ ateFoodToday: true, missedMealStreak: 0, fastingPenalty: -5, effects: [existingEffect] });
        actor.testUserPermission = jest.fn(() => true);

        await FastingService.advanceFastingDay(actor);

        expect(existingEffect.delete).toHaveBeenCalled();
        expect(actor.setFlag).toHaveBeenCalledWith('rmss', 'fastingPenalty', 0);
    });

    test('eating with no penalty at all posts no chat message', async () => {
        const actor = makeActor({ ateFoodToday: true, missedMealStreak: 0, fastingPenalty: 0 });
        actor.testUserPermission = jest.fn(() => true);

        await FastingService.advanceFastingDay(actor);

        expect(global.ChatMessage.create).not.toHaveBeenCalled();
    });

    test('no actor: no-op without throwing', async () => {
        await expect(FastingService.advanceFastingDay(null)).resolves.toBeUndefined();
    });
});
