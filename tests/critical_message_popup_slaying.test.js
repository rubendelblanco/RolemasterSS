/**
 * Integration tests for RMSSWeaponCriticalManager.criticalMessagePopup: a matching Slaying
 * weapon must force the Superlarge melee critical table (and the Slaying subtype) even when
 * the target's own "Critical Table" setting is Normal — RMSS Slaying overrides that setting,
 * it doesn't depend on it.
 */
import { jest } from '@jest/globals';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';
import Utils from '../module/utils.js';
import EquipmentService from '../module/actors/services/equipment_service.js';

function captureRenderContext() {
    global.CONFIG = {
        rmss: {
            criticalDictionary: { K: 'Krush', large_melee: 'Large melee', superlarge_melee: 'Superlarge melee' },
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

function creatureEnemy({ criticalTable, creatureTags }) {
    return {
        type: 'creature',
        system: {
            creature_tags: creatureTags,
            attributes: {
                critical_codes: {
                    critical_table: criticalTable,
                    critical_procedure: 'none'
                }
            }
        }
    };
}

async function popupContext(enemy, critType = 'K') {
    RMSSWeaponCriticalManager.criticalMessagePopup(enemy, 50, 'E', critType, 'actor1', 'w1');
    await new Promise((r) => setTimeout(r, 10));
    return global.__capturedCtx;
}

describe('criticalMessagePopup: Slaying overrides the target critical table', () => {
    beforeEach(() => {
        captureRenderContext();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('slaying match forces superlarge_melee/slaying even when the target table is Normal ("-")', async () => {
        mockAttackerWithWeapon({ slaying: ['orc'] });
        const enemy = creatureEnemy({ criticalTable: '-', creatureTags: ['orc'] });
        const ctx = await popupContext(enemy);
        expect(ctx.critType).toBe('superlarge_melee');
        expect(ctx.defaultSubtype).toBe('slaying');
        expect(ctx.severity).toBe('slaying');
        expect(ctx.useLargeCreatureSeverityLabels).toBe(true);
    });

    test('no slaying match and target table Normal: critType is left as the raw melee code', async () => {
        mockAttackerWithWeapon({ slaying: ['dragon'] });
        const enemy = creatureEnemy({ criticalTable: '-', creatureTags: ['orc'] });
        const ctx = await popupContext(enemy);
        expect(ctx.critType).toBe('K');
        expect(ctx.useLargeCreatureSeverityLabels).toBe(false);
    });

    test('target already set to Large, weapon not slaying: uses large_melee but not the slaying subtype', async () => {
        mockAttackerWithWeapon({ slaying: ['dragon'], magical: true });
        const enemy = creatureEnemy({ criticalTable: 'la', creatureTags: ['orc'] });
        const ctx = await popupContext(enemy);
        expect(ctx.critType).toBe('large_melee');
        expect(ctx.defaultSubtype).toBe('magic');
    });

    test('slaying match on a target already set to Large still forces superlarge (not large)', async () => {
        mockAttackerWithWeapon({ slaying: ['orc'] });
        const enemy = creatureEnemy({ criticalTable: 'la', creatureTags: ['orc'] });
        const ctx = await popupContext(enemy);
        expect(ctx.critType).toBe('superlarge_melee');
        expect(ctx.defaultSubtype).toBe('slaying');
    });

    test('a non-melee critical type is not affected by slaying (spell crits have no slaying column)', async () => {
        mockAttackerWithWeapon({ slaying: ['orc'] });
        const enemy = creatureEnemy({ criticalTable: '-', creatureTags: ['orc'] });
        const ctx = await popupContext(enemy, 'heat');
        expect(ctx.critType).toBe('heat');
        expect(ctx.useLargeCreatureSeverityLabels).toBe(false);
    });
});
