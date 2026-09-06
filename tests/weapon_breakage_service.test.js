/**
 * Tests for WeaponBreakageService.isBreakageTrigger (pure - the roll-dependent methods need
 * Foundry's Roll/ChatMessage globals and are exercised via the combat integration instead).
 */
import WeaponBreakageService from '../module/combat/services/weapon_breakage_service.js';

describe('WeaponBreakageService.isBreakageTrigger', () => {
    test('a natural double whose digit is inside the range triggers', () => {
        expect(WeaponBreakageService.isBreakageTrigger(11, "1-3")).toBe(true);
        expect(WeaponBreakageService.isBreakageTrigger(22, "1-3")).toBe(true);
        expect(WeaponBreakageService.isBreakageTrigger(33, "1-3")).toBe(true);
    });

    test('a natural double outside the range does not trigger', () => {
        expect(WeaponBreakageService.isBreakageTrigger(44, "1-3")).toBe(false);
        expect(WeaponBreakageService.isBreakageTrigger(99, "1-3")).toBe(false);
    });

    test('a non-double natural roll never triggers, even inside the numeric range', () => {
        expect(WeaponBreakageService.isBreakageTrigger(12, "1-3")).toBe(false);
        expect(WeaponBreakageService.isBreakageTrigger(23, "1-3")).toBe(false);
    });

    test('a reversed range (hi-lo) is normalized', () => {
        expect(WeaponBreakageService.isBreakageTrigger(22, "3-1")).toBe(true);
    });

    test('a single-digit range (no dash) is treated as lo === hi', () => {
        expect(WeaponBreakageService.isBreakageTrigger(22, "2")).toBe(true);
        expect(WeaponBreakageService.isBreakageTrigger(33, "2")).toBe(false);
    });

    test('empty/missing breakage_range never triggers', () => {
        expect(WeaponBreakageService.isBreakageTrigger(22, "")).toBe(false);
        expect(WeaponBreakageService.isBreakageTrigger(22, null)).toBe(false);
        expect(WeaponBreakageService.isBreakageTrigger(22, undefined)).toBe(false);
    });

    test('100 is never a double', () => {
        expect(WeaponBreakageService.isBreakageTrigger(100, "1-9")).toBe(false);
    });

    test('malformed range never triggers', () => {
        expect(WeaponBreakageService.isBreakageTrigger(22, "abc")).toBe(false);
    });
});

describe('WeaponBreakageService.hasBreakageData', () => {
    test('both strength and breakage_range set: has data', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { strength: 70, breakage_range: "1-3" } })).toBe(true);
    });

    test('strength 0 (e.g. martial arts strike): no data, cannot break', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { strength: 0, breakage_range: "1-3" } })).toBe(false);
    });

    test('missing strength: no data', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { breakage_range: "1-3" } })).toBe(false);
    });

    test('empty breakage_range: no data even with strength set', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { strength: 70, breakage_range: "" } })).toBe(false);
    });

    test('missing breakage_range: no data', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { strength: 70 } })).toBe(false);
    });

    test('negative strength: no data', () => {
        expect(WeaponBreakageService.hasBreakageData({ system: { strength: -5, breakage_range: "1-3" } })).toBe(false);
    });

    test('no system data at all: no data', () => {
        expect(WeaponBreakageService.hasBreakageData({})).toBe(false);
        expect(WeaponBreakageService.hasBreakageData(null)).toBe(false);
    });
});
