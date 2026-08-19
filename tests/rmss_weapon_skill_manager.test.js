/**
 * Tests for RMSSWeaponSkillManager._getOffensiveBonusFromWeapon (plain weapon/skill OB, no
 * target-dependent logic) and _getSlayingBonusDelta, which computes the "+10, +25 vs Orcs"
 * conditional bonus (system.slaying_bonus) as a delta meant to be added to the confirm-attack
 * "misc" modifier, not mixed into the weapon's own OB. It reuses the weapon's Slaying tags
 * (system.slaying) instead of a second tag list — a weapon that's both a Slayer of and has a
 * special bonus against a creature type targets the same tags either way. A match REPLACES
 * the weapon's normal magic bonus rather than adding to it, so the delta already accounts for
 * removing the weapon's own system.bonus.
 */
import { RMSSWeaponSkillManager } from '../module/combat/rmss_weapon_skill_manager.js';

function makeActorWithSkill(skillId, totalBonus) {
    const skillItem = { id: skillId, system: { total_bonus: totalBonus } };
    return { items: { get: (id) => (id === skillId ? skillItem : undefined) } };
}

describe('RMSSWeaponSkillManager._getOffensiveBonusFromWeapon', () => {
    test('creature_attack: returns weapon.system.bonus directly', () => {
        const weapon = { type: 'creature_attack', system: { bonus: 15 } };
        expect(RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, {})).toBe(15);
    });

    test('weapon with no offensive_skill: returns 0', () => {
        const weapon = { type: 'weapon', system: { bonus: 10 } };
        expect(RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, { items: {} })).toBe(0);
    });

    test('normal weapon: returns the skill total_bonus as-is, regardless of slaying/slaying_bonus', () => {
        const actor = makeActorWithSkill('skill1', 42);
        const weapon = { type: 'weapon', system: { bonus: 10, offensive_skill: 'skill1', slaying: ['orc'], slaying_bonus: 25 } };
        expect(RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, actor)).toBe(42);
    });
});

describe('RMSSWeaponSkillManager._getSlayingBonusDelta', () => {
    test('no slaying tags configured: delta is 0', () => {
        const weapon = { system: { bonus: 10, slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(0);
    });

    test('slaying_bonus unset/0: delta is 0 even with a matching tag', () => {
        const weapon = { system: { bonus: 10, slaying: ['orc'] } };
        const enemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(0);
    });

    test('no enemy candidates with matching tags: delta is 0', () => {
        const weapon = { system: { bonus: 10, slaying: ['orc'], slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['dragon'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(0);
    });

    test('matching tag: delta REPLACES the weapon\'s own bonus rather than adding to it (+10 base, +25 vs orcs -> delta +15)', () => {
        const weapon = { system: { bonus: 10, slaying: ['orc'], slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(15);
    });

    test('matching is case-insensitive', () => {
        const weapon = { system: { bonus: 10, slaying: ['Orc'], slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['ORC'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(15);
    });

    test('a weapon can slay/bonus against multiple tags, any one matching applies the single slaying_bonus delta', () => {
        const weapon = { system: { bonus: 10, slaying: ['orc', 'troll'], slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['troll'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(15);
    });

    test('independent of isSlaying: applies on tag match even when isSlaying is false/unset', () => {
        const weapon = { system: { bonus: 0, slaying: ['orc'], slaying_bonus: 25, isSlaying: false } };
        const enemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, enemy)).toBe(25);
    });

    test('combines tags across multiple enemy candidates (e.g. a socket-resolved actor and the raw token actor)', () => {
        const weapon = { system: { bonus: 0, slaying: ['orc'], slaying_bonus: 25 } };
        const staleResolvedEnemy = { system: { creature_tags: [] } };
        const liveTokenEnemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, staleResolvedEnemy, liveTokenEnemy)).toBe(25);
    });

    test('ignores candidates without a .system (null/undefined enemy)', () => {
        const weapon = { system: { bonus: 0, slaying: ['orc'], slaying_bonus: 25 } };
        const enemy = { system: { creature_tags: ['orc'] } };
        expect(RMSSWeaponSkillManager._getSlayingBonusDelta(weapon, null, undefined, enemy)).toBe(25);
    });
});
