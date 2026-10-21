/**
 * RMSSWeaponCriticalManager.updateActorHits (the GM side of a normal critical): a Slaying weapon against a creature that is
 * not large adds a second critical, on the Slaying column of the Large Creature table, with the same d100 as the first.
 */
import { jest } from '@jest/globals';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';
import RMSSTableManager from '../module/combat/rmss_table_manager.js';
import { RMSSEffectApplier } from '../module/combat/rmss_effect_applier.js';

function setUp() {
    const target = { system: { attributes: { hits: { current: 100 } } }, update: jest.fn(async () => {}) };
    global.canvas = { scene: { tokens: { get: () => ({ actor: target }) } } };
    global.game.combat = null;
    RMSSEffectApplier.applyDeathIfBroughtToZero = jest.fn(async () => {});
    RMSSTableManager.getCriticalTableResult = jest.fn(async (result, _enemy, severity, critType) => ({
        text: `${critType}/${severity}`,
        usedRoll: result
    }));
    return target;
}

const hit = (extra = {}) => ({ severity: 'C', critType: 'K', modifier: 0, attackerId: 'a1', ...extra });

describe('updateActorHits with a slaying weapon', () => {
    test('normal creature: the normal critical plus a second one on the Slaying column of the Large table', async () => {
        const target = setUp();
        const result = await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit({ slayingExtra: true }));

        expect(RMSSTableManager.getCriticalTableResult).toHaveBeenCalledTimes(2);
        const [first, second] = RMSSTableManager.getCriticalTableResult.mock.calls;
        expect(first.slice(1, 4)).toEqual([target, 'C', 'K']);
        expect(second.slice(1, 4)).toEqual([target, 'E', 'large_melee']);
        expect(result.text).toBe('K/C');
        expect(result._rmssEffectWeaponFollowUp.text).toBe('large_melee/E');
    });

    test('both criticals use the same d100 result, with the dialog modifier on both', async () => {
        setUp();
        await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit({ slayingExtra: true, modifier: 10 }));
        const [first, second] = RMSSTableManager.getCriticalTableResult.mock.calls;
        expect(first[0]).toBe(60);    // the mocked d100 is 50
        expect(second[0]).toBe(60);
        expect(second[4]).toBe(first[4]);    // the very same Roll
    });

    test('the extra critical is announced as an extra one and keeps the context of the first', async () => {
        setUp();
        const result = await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit({ slayingExtra: true, weaponItemId: 'w1' }));
        const second = RMSSTableManager.getCriticalTableResult.mock.calls[1];
        expect(second[6]).toEqual({ isEffectWeaponExtra: true });
        expect(result._rmssEffectWeaponFollowUp._rmssContext.weaponItemId).toBe('w1');
    });

    test('without slayingExtra there is only the normal critical', async () => {
        setUp();
        const result = await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit());
        expect(RMSSTableManager.getCriticalTableResult).toHaveBeenCalledTimes(1);
        expect(result._rmssEffectWeaponFollowUp).toBeUndefined();
    });

    test('a hit that produces no critical adds no slaying critical', async () => {
        const target = setUp();
        const result = await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit({ severity: 'null', slayingExtra: true }));
        expect(result).toBeUndefined();
        expect(RMSSTableManager.getCriticalTableResult).not.toHaveBeenCalled();
        expect(target.update).toHaveBeenCalledTimes(1);    // the damage is still taken
    });

    test('a failed first critical lookup adds no slaying critical', async () => {
        setUp();
        RMSSTableManager.getCriticalTableResult = jest.fn(async () => null);
        const result = await RMSSWeaponCriticalManager.updateActorHits('t1', true, 20, hit({ slayingExtra: true }));
        expect(result).toBeNull();
        expect(RMSSTableManager.getCriticalTableResult).toHaveBeenCalledTimes(1);
    });
});
