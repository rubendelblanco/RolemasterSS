/**
 * Tests for RMSSWeaponCriticalManager.getDefaultCriticalSubtype (weapon Slaying property).
 * Slaying requires BOTH isSlaying === true AND a matching tag — a weapon can carry tags (and
 * even a slaying_bonus, see rmss_weapon_skill_manager.test.js) purely for the OB bonus without
 * isSlaying forcing the Slaying critical column.
 */
import { jest } from '@jest/globals';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';
import Utils from '../module/utils.js';
import EquipmentService from '../module/actors/services/equipment_service.js';

function mockActorWithWeapon(weaponSystem) {
    const actor = { items: [{}] };
    Utils.getActor = jest.fn().mockReturnValue(actor);
    EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([{ system: weaponSystem }]);
    return actor;
}

describe('RMSSWeaponCriticalManager.getDefaultCriticalSubtype', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns "normal" when the critical type has no large-creature subtypes', () => {
        mockActorWithWeapon({ slaying: ["dragon"], isSlaying: true });
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "not_a_large_type", { system: { creature_tags: ["dragon"] } })).toBe("normal");
    });

    test('returns "slaying" when isSlaying is true and the tag matches an enemy creature tag', () => {
        mockActorWithWeapon({ slaying: ["dragon"], isSlaying: true });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("slaying");
    });

    test('a tag match with isSlaying false/unset does NOT trigger Slaying — just an OB-bonus-only weapon', () => {
        mockActorWithWeapon({ slaying: ["dragon"] });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("normal");

        mockActorWithWeapon({ slaying: ["dragon"], isSlaying: false });
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("normal");
    });

    test('matching is case-insensitive', () => {
        mockActorWithWeapon({ slaying: ["Dragon"], isSlaying: true });
        const enemy = { system: { creature_tags: ["DRAGON"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("slaying");
    });

    test('slaying takes priority over holy/mithril/magic when both match', () => {
        mockActorWithWeapon({ slaying: ["undead"], isSlaying: true, holy: true, material: "mithril_alloy", magical: true });
        const enemy = { system: { creature_tags: ["undead"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("slaying");
    });

    test('falls back to holy when slaying tags do not match the enemy', () => {
        mockActorWithWeapon({ slaying: ["undead"], isSlaying: true, holy: true });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("holy");
    });

    test('falls back to mithril when there is no slaying match and weapon is mithril', () => {
        mockActorWithWeapon({ material: "mithril_alloy" });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("mithril");
    });

    test('falls back to magic when there is no slaying match and weapon is magical', () => {
        mockActorWithWeapon({ magical: true });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("magic");
    });

    test('returns "normal" when weapon has no slaying tags and no enemy is provided', () => {
        mockActorWithWeapon({ isSlaying: true });
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", undefined)).toBe("normal");
    });

    test('returns "normal" when enemy has no matching creature tags at all', () => {
        mockActorWithWeapon({ slaying: ["orc", "troll"], isSlaying: true });
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("normal");
    });

    test('a weapon can slay multiple creature types (any match wins)', () => {
        mockActorWithWeapon({ slaying: ["orc", "troll"], isSlaying: true });
        const enemy = { system: { creature_tags: ["troll"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("slaying");
    });

    test('with several weapons equipped, picks the one matching weaponItemId instead of the first', () => {
        const actor = { items: [{}] };
        Utils.getActor = jest.fn().mockReturnValue(actor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([
            { id: "w1", system: { slaying: [], isSlaying: true } },
            { id: "w2", system: { slaying: ["dragon"], isSlaying: true } }
        ]);
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy, "w2")).toBe("slaying");
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy, "w1")).toBe("normal");
    });

    test('without weaponItemId, falls back to the first equipped weapon', () => {
        const actor = { items: [{}] };
        Utils.getActor = jest.fn().mockReturnValue(actor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([
            { id: "w1", system: { slaying: ["dragon"], isSlaying: true } },
            { id: "w2", system: { slaying: [] } }
        ]);
        const enemy = { system: { creature_tags: ["dragon"] } };
        expect(RMSSWeaponCriticalManager.getDefaultCriticalSubtype("actor1", "large_melee", enemy)).toBe("slaying");
    });
});
