/**
 * Tests for CastingOptionsService
 */
import { jest } from '@jest/globals';
import CastingOptionsService from '../module/spells/services/casting_options_service.js';

const mockModifiers = {
    subtlety: {
        E: { channeling: -40, essence: -60, mentalism: -30 },
        F: { channeling: -25, essence: -50, mentalism: -20 }
    },
    hands: {
        none: { essence: -40, channeling: -20, mentalism: 0 },
        one: { essence: -10, channeling: 0, mentalism: 0 },
        two: { essence: 0, channeling: 5, mentalism: 0 }
    },
    voice: {
        none: { essence: -25, channeling: -15, mentalism: 0 },
        whisper: { essence: -10, channeling: -5, mentalism: 0 },
        normal: { essence: 0, channeling: 0, mentalism: 0 },
        shout: { essence: 5, channeling: 10, mentalism: 0 }
    },
    preparation: { "0": 0, "1": 10, "2": 20 }
};

describe('CastingOptionsService', () => {

    describe('_normalizeRealm', () => {
        test('arcane maps to essence', () => {
            expect(CastingOptionsService._normalizeRealm("arcane")).toBe("essence");
            expect(CastingOptionsService._normalizeRealm("Arcane")).toBe("essence");
        });

        test('essence, channeling, mentalism pass through', () => {
            expect(CastingOptionsService._normalizeRealm("essence")).toBe("essence");
            expect(CastingOptionsService._normalizeRealm("channeling")).toBe("channeling");
            expect(CastingOptionsService._normalizeRealm("mentalism")).toBe("mentalism");
        });

        test('empty or null returns essence', () => {
            expect(CastingOptionsService._normalizeRealm("")).toBe("essence");
            expect(CastingOptionsService._normalizeRealm(null)).toBe("essence");
        });
    });

    describe('_formatModifier', () => {
        test('positive numbers get plus prefix', () => {
            expect(CastingOptionsService._formatModifier(5)).toBe("+5");
            expect(CastingOptionsService._formatModifier(0)).toBe("+0");
        });

        test('negative numbers have no plus', () => {
            expect(CastingOptionsService._formatModifier(-10)).toBe("-10");
        });
    });

    describe('_getSubtletyPenalty', () => {
        test('returns penalty for known spell type and realm', () => {
            expect(CastingOptionsService._getSubtletyPenalty("essence", "E", mockModifiers)).toBe(-60);
            expect(CastingOptionsService._getSubtletyPenalty("channeling", "E", mockModifiers)).toBe(-40);
            expect(CastingOptionsService._getSubtletyPenalty("mentalism", "F", mockModifiers)).toBe(-20);
        });

        test('unknown spell type returns 0', () => {
            expect(CastingOptionsService._getSubtletyPenalty("essence", "X", mockModifiers)).toBe(0);
        });

        test('unknown realm falls back to essence', () => {
            const mods = { subtlety: { E: { essence: -60 } } };
            expect(CastingOptionsService._getSubtletyPenalty("unknown", "E", mods)).toBe(-60);
        });
    });

    describe('_getHandsModifiers', () => {
        test('returns modifiers for each hand option', () => {
            const hands = CastingOptionsService._getHandsModifiers("essence", mockModifiers);
            expect(hands.none).toBe(-40);
            expect(hands.one).toBe(-10);
            expect(hands.two).toBe(0);
        });

        test('channeling realm returns different values', () => {
            const hands = CastingOptionsService._getHandsModifiers("channeling", mockModifiers);
            expect(hands.two).toBe(5);
        });
    });

    describe('_getVoiceModifiers', () => {
        test('returns modifiers for each voice option', () => {
            const voice = CastingOptionsService._getVoiceModifiers("essence", mockModifiers);
            expect(voice.none).toBe(-25);
            expect(voice.normal).toBe(0);
            expect(voice.shout).toBe(5);
        });
    });

    describe('showCastingOptionsDialog with fromEnchantment', () => {
        // An item cast (potion/rune/staff/artifact) has no caster subtlety/hands/voice/prep
        // to choose and no hits-taken/bleeding/stunned penalty - it just goes off. This must
        // never show the dialog (no Dialog render, no modifiers table fetch) and instead
        // resolve immediately with a neutral, zero-modifier result.
        beforeEach(() => {
            global.fetch = jest.fn();
            global.Dialog = jest.fn(() => { throw new Error('Dialog should not be constructed for an item cast'); });
        });

        test('resolves with a neutral result without fetching modifiers or showing a dialog', async () => {
            const result = await CastingOptionsService.showCastingOptionsDialog({
                realm: 'essence', spellType: 'F', spellName: 'Fireball', fromEnchantment: true
            });

            expect(global.fetch).not.toHaveBeenCalled();
            expect(global.Dialog).not.toHaveBeenCalled();
            expect(result).toEqual({
                totalModifier: 0,
                castingModifier: 0,
                publicRollToPlayers: true,
                hitsTaken: 0,
                bleeding: 0,
                stunned: 0,
                penaltyEffect: 0,
                activeBonus: 0,
                options: { subtlety: "normal", hands: "two", voice: "normal", preparation: 0, otherMods: 0 }
            });
        });

        test('without fromEnchantment, the same call still tries to load modifiers (would show the dialog)', async () => {
            await CastingOptionsService.showCastingOptionsDialog({
                realm: 'essence', spellType: 'F', spellName: 'Fireball'
            }).catch(() => {});

            expect(global.fetch).toHaveBeenCalled();
        });
    });
});
