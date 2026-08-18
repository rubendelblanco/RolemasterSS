/**
 * Tests for creature_tags_ui.js (Actor#system.creature_tags on npc/creature actors)
 */
import { getCreatureTagsArray, getCreatureTagListId } from '../module/sheets/actors/creature_tags_ui.js';

describe('getCreatureTagsArray', () => {
    test('returns an empty array when creature_tags is unset', () => {
        expect(getCreatureTagsArray({})).toEqual([]);
        expect(getCreatureTagsArray(undefined)).toEqual([]);
    });

    test('returns a trimmed array as-is', () => {
        expect(getCreatureTagsArray({ creature_tags: [" dragon ", "undead"] })).toEqual(["dragon", "undead"]);
    });

    test('accepts a comma-separated string', () => {
        expect(getCreatureTagsArray({ creature_tags: "dragon, undead" })).toEqual(["dragon", "undead"]);
    });
});

describe('getCreatureTagListId', () => {
    test('is stable and derived from the actor id', () => {
        expect(getCreatureTagListId({ id: "abc123" })).toBe("abc123");
    });

    test('falls back to a placeholder for a new unsaved actor', () => {
        expect(getCreatureTagListId({})).toBe("rmss-creature-new");
    });
});
