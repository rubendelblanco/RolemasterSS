/**
 * Tests for weapon_slaying_ui.js (Item#system.slaying)
 */
import { getWeaponSlayingArray, getWeaponSlayingListId } from '../module/sheets/items/weapon_slaying_ui.js';

describe('getWeaponSlayingArray', () => {
    test('returns an empty array when slaying is unset', () => {
        expect(getWeaponSlayingArray({})).toEqual([]);
        expect(getWeaponSlayingArray(undefined)).toEqual([]);
    });

    test('returns a trimmed array as-is', () => {
        expect(getWeaponSlayingArray({ slaying: [" dragon ", "orc"] })).toEqual(["dragon", "orc"]);
    });

    test('accepts a legacy comma-separated string', () => {
        expect(getWeaponSlayingArray({ slaying: "dragon, orc" })).toEqual(["dragon", "orc"]);
    });
});

describe('getWeaponSlayingListId', () => {
    test('is stable and derived from the item id', () => {
        expect(getWeaponSlayingListId({ id: "abc123" })).toBe("abc123-slaying");
    });

    test('falls back to a placeholder for a new unsaved item', () => {
        expect(getWeaponSlayingListId({})).toBe("rmss-item-new-slaying");
    });
});
