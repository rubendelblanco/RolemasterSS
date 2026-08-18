/**
 * Tests for EffectsPopupService.showPopup — the Resistance Roll tab's modifier field is a
 * select of the target's actual resistance_rolls totals (plus a "custom" free-entry option),
 * so the GM doesn't have to remember/retype numbers already on the character sheet.
 */
import { jest } from '@jest/globals';
import EffectsPopupService from '../module/core/rolls/effects_popup_service.js';

function makeToken(resistanceRolls) {
    const actor = {
        img: 'img.png',
        system: {
            attributes: { level: { value: 5 } },
            resistance_rolls: resistanceRolls
        }
    };
    return { actor, document: {} };
}

describe('EffectsPopupService.showPopup: resistance modifier options', () => {
    beforeEach(() => {
        global.CONFIG = { rmss: { criticalDictionary: {}, criticalSubtypes: {} } };
        global.renderTemplate = jest.fn(async (_path, ctx) => { global.__capturedCtx = ctx; return '<div></div>'; });
        global.Dialog = class Dialog {
            constructor() {}
            render() { /* never resolves; we only need the render context */ }
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('builds one option per resistance_rolls category with its actual total', async () => {
        const resistanceRolls = {
            channeling: { total: 10 }, essence: { total: 20 }, mentalism: { total: 30 },
            chann_ess: { total: 15 }, chann_ment: { total: 20 }, ess_ment: { total: 25 },
            arcane: { total: 30 }, poison: { total: 45 }, disease: { total: 12 }, fear: { total: 8 }
        };
        EffectsPopupService.showPopup(makeToken(resistanceRolls));
        await new Promise((r) => setTimeout(r, 10));

        const options = global.__capturedCtx.resistanceOptions;
        expect(options).toHaveLength(10);
        expect(options.find((o) => o.key === 'poison').total).toBe(45);
        expect(options.find((o) => o.key === 'chann_ess').total).toBe(15);
        expect(options.map((o) => o.key)).toEqual([
            'channeling', 'essence', 'mentalism', 'chann_ess', 'chann_ment',
            'ess_ment', 'arcane', 'poison', 'disease', 'fear'
        ]);
    });

    test('defaults every category to 0 when the actor has no resistance_rolls (npc/creature)', async () => {
        EffectsPopupService.showPopup(makeToken(undefined));
        await new Promise((r) => setTimeout(r, 10));

        const options = global.__capturedCtx.resistanceOptions;
        expect(options.every((o) => o.total === 0)).toBe(true);
    });
});
