/**
 * Tests for TrapAttackService.trigger — fires a trap's attack (via a hidden actor with an
 * equipped weapon) at whichever token triggered it, reusing the normal weapon-attack pipeline.
 */
import { jest } from '@jest/globals';
import TrapAttackService from '../module/combat/services/trap_attack_service.js';
import EquipmentService from '../module/actors/services/equipment_service.js';
import { RMSSWeaponSkillManager } from '../module/combat/rmss_weapon_skill_manager.js';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';

describe('TrapAttackService.trigger', () => {
    let targetActor, targetToken;

    beforeEach(() => {
        targetActor = { id: 'target1', system: { attributes: { hits: { current: 10 } } } };
        targetToken = { id: 'tok1', actor: targetActor };
        global.game.actors = { get: jest.fn() };
        global.ui = { notifications: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } };
        global.canvas = { tokens: { get: jest.fn() }, scene: { tokens: { get: jest.fn() } } };
        RMSSWeaponSkillManager.handleAttack = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('resolves the trap actor, its first equipped weapon, and the target token, then calls handleAttack', async () => {
        const trapWeapon = { id: 'w1', system: { equipped: true } };
        const trapActor = { id: 'trap1', name: 'Trap: Spear +50', items: [trapWeapon] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([trapWeapon]);

        await TrapAttackService.trigger('trap1', targetToken);

        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenCalledWith(trapActor, targetActor, trapWeapon, null, targetToken);
    });

    test('resolves the target by token id string via canvas.tokens', async () => {
        const trapWeapon = { id: 'w1', system: { equipped: true } };
        const trapActor = { id: 'trap1', name: 'Trap', items: [trapWeapon] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([trapWeapon]);
        global.canvas.tokens.get.mockReturnValue(targetToken);

        await TrapAttackService.trigger('trap1', 'tok1');

        expect(global.canvas.tokens.get).toHaveBeenCalledWith('tok1');
        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenCalledWith(trapActor, targetActor, trapWeapon, null, targetToken);
    });

    test('picks the weapon matching weaponItemId when the trap has several equipped', async () => {
        const spear = { id: 'w1', system: { equipped: true } };
        const dart = { id: 'w2', system: { equipped: true } };
        const trapActor = { id: 'trap1', name: 'Trap', items: [spear, dart] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([spear, dart]);

        await TrapAttackService.trigger('trap1', targetToken, 'w2');

        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenCalledWith(trapActor, targetActor, dart, null, targetToken);
    });

    test('errors out (no attack) when the trap actor does not exist', async () => {
        global.game.actors.get.mockReturnValue(undefined);

        await TrapAttackService.trigger('missing', targetToken);

        expect(global.ui.notifications.error).toHaveBeenCalled();
        expect(RMSSWeaponSkillManager.handleAttack).not.toHaveBeenCalled();
    });

    test('errors out when the trap actor has no equipped weapon nor creature attack', async () => {
        const trapActor = { id: 'trap1', name: 'Empty trap', items: [] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([]);

        await TrapAttackService.trigger('trap1', targetToken);

        expect(global.ui.notifications.error).toHaveBeenCalled();
        expect(RMSSWeaponSkillManager.handleAttack).not.toHaveBeenCalled();
    });

    test('a creature-type trap with no equipped weapon uses its natural creature_attack instead', async () => {
        const spikes = { id: 'ca1', type: 'creature_attack', system: { order: 1 } };
        const trapActor = { id: 'trap1', name: 'Trampa de pinchos', items: [spikes] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([]);

        await TrapAttackService.trigger('trap1', targetToken);

        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenCalledWith(trapActor, targetActor, spikes, null, targetToken);
    });

    test('with several natural attacks, picks the one matching weaponItemId, ordered by system.order otherwise', async () => {
        const bite = { id: 'ca1', type: 'creature_attack', system: { order: 2 } };
        const claws = { id: 'ca2', type: 'creature_attack', system: { order: 1 } };
        const trapActor = { id: 'trap1', name: 'Bicho', items: [bite, claws] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([]);

        await TrapAttackService.trigger('trap1', targetToken);
        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenLastCalledWith(trapActor, targetActor, claws, null, targetToken);

        await TrapAttackService.trigger('trap1', targetToken, 'ca1');
        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenLastCalledWith(trapActor, targetActor, bite, null, targetToken);
    });

    test('prefers an equipped weapon over a natural creature_attack when both are present', async () => {
        const weapon = { id: 'w1', system: { equipped: true } };
        const claws = { id: 'ca1', type: 'creature_attack', system: { order: 1 } };
        const trapActor = { id: 'trap1', name: 'Hybrid trap', items: [weapon, claws] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([weapon]);

        await TrapAttackService.trigger('trap1', targetToken);

        expect(RMSSWeaponSkillManager.handleAttack).toHaveBeenCalledWith(trapActor, targetActor, weapon, null, targetToken);
    });

    test('errors out when the target token/actor cannot be resolved', async () => {
        const trapWeapon = { id: 'w1', system: { equipped: true } };
        const trapActor = { id: 'trap1', name: 'Trap', items: [trapWeapon] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([trapWeapon]);

        await TrapAttackService.trigger('trap1', null);

        expect(global.ui.notifications.error).toHaveBeenCalled();
        expect(RMSSWeaponSkillManager.handleAttack).not.toHaveBeenCalled();
    });

    test('does nothing when the target is already defeated (0 hits)', async () => {
        const trapWeapon = { id: 'w1', system: { equipped: true } };
        const trapActor = { id: 'trap1', name: 'Trap', items: [trapWeapon] };
        global.game.actors.get.mockReturnValue(trapActor);
        EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([trapWeapon]);
        targetActor.system.attributes.hits.current = 0;

        await TrapAttackService.trigger('trap1', targetToken);

        expect(RMSSWeaponSkillManager.handleAttack).not.toHaveBeenCalled();
    });
});

describe('TrapAttackService.triggerCritical', () => {
    let targetActor, targetToken;

    beforeEach(() => {
        targetActor = { id: 'target1', system: { attributes: { hits: { current: 10 } } } };
        targetToken = { id: 'tok1', actor: targetActor };
        global.ui = { notifications: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } };
        global.canvas = { tokens: { get: jest.fn() }, scene: { tokens: { get: jest.fn() } } };
        RMSSWeaponCriticalManager.updateActorHits = jest.fn().mockResolvedValue({ text: 'a puncture wound' });
        RMSSWeaponCriticalManager.applyCriticalTo = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('rolls the critical table directly (no attack roll) and applies it', async () => {
        await TrapAttackService.triggerCritical(targetToken, { severity: 'C', critType: 'P', damage: 15, modifier: 5, trapActorId: 'trap1' });

        expect(RMSSWeaponCriticalManager.updateActorHits).toHaveBeenCalledWith(
            'tok1', true, 15, { severity: 'C', critType: 'P', modifier: 5, attackerId: 'trap1' }
        );
        expect(RMSSWeaponCriticalManager.applyCriticalTo).toHaveBeenCalledWith(
            { text: 'a puncture wound' }, targetActor, 'trap1'
        );
    });

    test('resolves the target by token id string via canvas.tokens', async () => {
        global.canvas.tokens.get.mockReturnValue(targetToken);

        await TrapAttackService.triggerCritical('tok1', { severity: 'A', critType: 'K' });

        expect(global.canvas.tokens.get).toHaveBeenCalledWith('tok1');
        expect(RMSSWeaponCriticalManager.updateActorHits).toHaveBeenCalled();
    });

    test('defaults damage/modifier to 0 and trapActorId to null when omitted', async () => {
        await TrapAttackService.triggerCritical(targetToken, { severity: 'A', critType: 'K' });

        expect(RMSSWeaponCriticalManager.updateActorHits).toHaveBeenCalledWith(
            'tok1', true, 0, { severity: 'A', critType: 'K', modifier: 0, attackerId: null }
        );
        expect(RMSSWeaponCriticalManager.applyCriticalTo).toHaveBeenCalledWith(
            { text: 'a puncture wound' }, targetActor, null
        );
    });

    test('errors out when severity or critType is missing', async () => {
        await TrapAttackService.triggerCritical(targetToken, { critType: 'K' });
        expect(global.ui.notifications.error).toHaveBeenCalled();
        expect(RMSSWeaponCriticalManager.updateActorHits).not.toHaveBeenCalled();
    });

    test('errors out when the target token/actor cannot be resolved', async () => {
        await TrapAttackService.triggerCritical(null, { severity: 'A', critType: 'K' });
        expect(global.ui.notifications.error).toHaveBeenCalled();
        expect(RMSSWeaponCriticalManager.updateActorHits).not.toHaveBeenCalled();
    });

    test('does nothing when the target is already defeated (0 hits)', async () => {
        targetActor.system.attributes.hits.current = 0;

        await TrapAttackService.triggerCritical(targetToken, { severity: 'A', critType: 'K' });

        expect(RMSSWeaponCriticalManager.updateActorHits).not.toHaveBeenCalled();
    });

    test('does not apply the critical when updateActorHits resolves to nothing (e.g. severity "null")', async () => {
        RMSSWeaponCriticalManager.updateActorHits = jest.fn().mockResolvedValue(undefined);

        await TrapAttackService.triggerCritical(targetToken, { severity: 'A', critType: 'K' });

        expect(RMSSWeaponCriticalManager.applyCriticalTo).not.toHaveBeenCalled();
    });
});
