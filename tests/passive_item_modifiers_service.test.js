/**
 * Tests for PassiveItemModifiersService.buildChangesForModifier - the ActiveEffect change(s)
 * a passive modifier row produces. Any item type in ITEM_TYPES_WITH_PASSIVE (item, weapon,
 * armor, herb_or_poison, transport) can carry one, so these are actor-type/item-type agnostic
 * by design - a ring on a player and the same ring on an NPC must produce identical changes.
 */
import { buildChangesForModifier } from '../module/actors/services/passive_item_modifiers_service.js';

describe('buildChangesForModifier', () => {
    test('total_db: adds directly to system.armor_info.total_db', () => {
        const changes = buildChangesForModifier({ target: "total_db", action: "add", value: 5 });
        expect(changes).toEqual([{ key: "system.armor_info.total_db", mode: 2, value: 5 }]);
    });

    test('total_db: subtract negates the value', () => {
        const changes = buildChangesForModifier({ target: "total_db", action: "subtract", value: 5 });
        expect(changes).toEqual([{ key: "system.armor_info.total_db", mode: 2, value: -5 }]);
    });

    test('total_db: override uses the OVERRIDE mode', () => {
        const changes = buildChangesForModifier({ target: "total_db", action: "override", value: 20 });
        expect(changes).toEqual([{ key: "system.armor_info.total_db", mode: 5, value: 20 }]);
    });

    test('armor_magic still targets system.armor_info.magic (unchanged)', () => {
        const changes = buildChangesForModifier({ target: "armor_magic", action: "add", value: 10 });
        expect(changes).toEqual([{ key: "system.armor_info.magic", mode: 2, value: 10 }]);
    });

    test('unrecognized target yields no changes', () => {
        expect(buildChangesForModifier({ target: "not_a_real_target", action: "add", value: 5 })).toEqual([]);
    });

    test('non-finite value yields no changes', () => {
        expect(buildChangesForModifier({ target: "total_db", action: "add", value: "abc" })).toEqual([]);
    });
});
