/**
 * Tests for RMSSWeaponCriticalManager.criticalMessagePopup: a weapon with a fixed damage
 * multiplier (system.weapon_effects.damage_multiplier) pre-selects that multiplier in the
 * confirm-critical dialog and pre-applies it to the initial displayed damage, instead of
 * always defaulting to x1 and leaving the GM to remember to change it.
 */
import { jest } from '@jest/globals';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';
import Utils from '../module/utils.js';
import EquipmentService from '../module/actors/services/equipment_service.js';

function captureRenderContext() {
    global.CONFIG = {
        rmss: {
            criticalDictionary: { K: 'Krush', heat: 'Heat' },
            criticalSubtypes: {}
        }
    };
    global.renderTemplate = jest.fn(async (_path, ctx) => { global.__capturedCtx = ctx; return '<div></div>'; });
    global.Dialog = class Dialog {
        constructor() {}
        render() { /* never resolves; we only need the render context */ }
    };
}

function mockAttackerWithWeapon(weaponSystem) {
    const actor = { items: [{}] };
    Utils.getActor = jest.fn().mockReturnValue(actor);
    EquipmentService.getEquippedWeapons = jest.fn().mockReturnValue([{ id: 'w1', system: weaponSystem }]);
}

function creatureEnemy() {
    return {
        type: 'creature',
        system: {
            creature_tags: [],
            attributes: { critical_codes: { critical_table: '-', critical_procedure: 'none' } }
        }
    };
}

async function popupContext(enemy, critType, damage = 50) {
    RMSSWeaponCriticalManager.criticalMessagePopup(enemy, damage, 'E', critType, 'actor1', 'w1');
    await new Promise((r) => setTimeout(r, 10));
    return global.__capturedCtx;
}

describe('criticalMessagePopup: weapon damage multiplier', () => {
    beforeEach(() => {
        captureRenderContext();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('no weapon_effects configured: defaults to x1, damage unchanged', async () => {
        mockAttackerWithWeapon({});
        const ctx = await popupContext(creatureEnemy(), 'K');
        expect(ctx.damageMultiplier).toBe(1);
        expect(ctx.initialDamage).toBe(50);
    });

    test('weapon with damage_multiplier x3: preselected and damage pre-multiplied', async () => {
        mockAttackerWithWeapon({ weapon_effects: { damage_multiplier: 3 } });
        const ctx = await popupContext(creatureEnemy(), 'K', 50);
        expect(ctx.damageMultiplier).toBe(3);
        expect(ctx.initialDamage).toBe(150);
        // The raw (unmultiplied) damage must still be preserved separately, so the existing
        // "recompute on dropdown change" handler in the dialog keeps working correctly.
        expect(ctx.damage).toBe(50);
    });

    test('does not apply to spell criticals — no physical weapon involved', async () => {
        mockAttackerWithWeapon({ weapon_effects: { damage_multiplier: 5 } });
        const ctx = await popupContext(creatureEnemy(), 'heat', 50);
        expect(ctx.damageMultiplier).toBe(1);
        expect(ctx.initialDamage).toBe(50);
    });

    test('clamps out-of-range multipliers to [1, 10]', async () => {
        mockAttackerWithWeapon({ weapon_effects: { damage_multiplier: 25 } });
        const ctx = await popupContext(creatureEnemy(), 'K', 10);
        expect(ctx.damageMultiplier).toBe(10);
        expect(ctx.initialDamage).toBe(100);
    });

    test('a multiplier of 0/invalid falls back to x1', async () => {
        mockAttackerWithWeapon({ weapon_effects: { damage_multiplier: 0 } });
        const ctx = await popupContext(creatureEnemy(), 'K', 20);
        expect(ctx.damageMultiplier).toBe(1);
        expect(ctx.initialDamage).toBe(20);
    });
});
