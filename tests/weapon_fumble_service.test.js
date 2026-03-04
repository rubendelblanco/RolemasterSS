/**
 * Tests for WeaponFumbleService
 */
import WeaponFumbleService from '../module/combat/services/weapon_fumble_service.js';

describe('WeaponFumbleService', () => {

    describe('getEffectiveFumbleRange', () => {
        test('empty string returns 0', () => {
            expect(WeaponFumbleService.getEffectiveFumbleRange("")).toBe(0);
        });

        test('null and undefined return 0', () => {
            expect(WeaponFumbleService.getEffectiveFumbleRange(null)).toBe(0);
            expect(WeaponFumbleService.getEffectiveFumbleRange(undefined)).toBe(0);
        });

        test('valid numbers return parsed value', () => {
            expect(WeaponFumbleService.getEffectiveFumbleRange(5)).toBe(5);
            expect(WeaponFumbleService.getEffectiveFumbleRange("10")).toBe(10);
        });

        test('negative returns 0', () => {
            expect(WeaponFumbleService.getEffectiveFumbleRange(-1)).toBe(0);
            expect(WeaponFumbleService.getEffectiveFumbleRange("-5")).toBe(0);
        });

        test('NaN returns 0', () => {
            expect(WeaponFumbleService.getEffectiveFumbleRange("abc")).toBe(0);
        });
    });

    describe('isFumble', () => {
        test('returns false when fumble range is 0', () => {
            expect(WeaponFumbleService.isFumble(1, 0)).toBe(false);
            expect(WeaponFumbleService.isFumble(1, "")).toBe(false);
        });

        test('returns true when roll <= fumble range', () => {
            expect(WeaponFumbleService.isFumble(1, 5)).toBe(true);
            expect(WeaponFumbleService.isFumble(5, 5)).toBe(true);
        });

        test('returns false when roll > fumble range', () => {
            expect(WeaponFumbleService.isFumble(6, 5)).toBe(false);
            expect(WeaponFumbleService.isFumble(100, 5)).toBe(false);
        });
    });

    describe('getColumnForWeaponType', () => {
        test('1he and 1hc map to 1he', () => {
            expect(WeaponFumbleService.getColumnForWeaponType("1he")).toBe("1he");
            expect(WeaponFumbleService.getColumnForWeaponType("1hc")).toBe("1he");
        });

        test('2h, pa, th, mis, mounted map to themselves', () => {
            expect(WeaponFumbleService.getColumnForWeaponType("2h")).toBe("2h");
            expect(WeaponFumbleService.getColumnForWeaponType("pa")).toBe("pa");
            expect(WeaponFumbleService.getColumnForWeaponType("th")).toBe("th");
            expect(WeaponFumbleService.getColumnForWeaponType("mis")).toBe("mis");
            expect(WeaponFumbleService.getColumnForWeaponType("mounted")).toBe("mounted");
        });

        test('empty or unknown defaults to 1he', () => {
            expect(WeaponFumbleService.getColumnForWeaponType("")).toBe("1he");
            expect(WeaponFumbleService.getColumnForWeaponType(null)).toBe("1he");
            expect(WeaponFumbleService.getColumnForWeaponType("unknown")).toBe("1he");
        });
    });

    describe('_findResult', () => {
        const mockTable = {
            ranges: [
                { min: 1, max: 10, "1he": "Drop weapon", "2h": "Lose grip" },
                { min: 11, max: 25, "1he": "Stumble", "2h": "Stumble" },
                { min: 26, max: null, "1he": "Minor slip", "2h": "Minor slip" }
            ]
        };

        test('returns result for roll in range', () => {
            expect(WeaponFumbleService._findResult(mockTable, 5, "1he")).toBe("Drop weapon");
            expect(WeaponFumbleService._findResult(mockTable, 15, "2h")).toBe("Stumble");
        });

        test('returns result for open-ended max range', () => {
            expect(WeaponFumbleService._findResult(mockTable, 100, "1he")).toBe("Minor slip");
        });

        test('returns null for invalid table', () => {
            expect(WeaponFumbleService._findResult(null, 5, "1he")).toBeNull();
            expect(WeaponFumbleService._findResult({}, 5, "1he")).toBeNull();
        });

        test('returns first range column value when no ranges match (fallback)', () => {
            const emptyTable = { ranges: [] };
            expect(WeaponFumbleService._findResult(emptyTable, 5, "1he")).toBeNull();
        });
    });
});
