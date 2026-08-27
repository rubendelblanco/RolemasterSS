/**
 * Tests for ForceSpellService.castForceSpell's casterLevelOverride (artifact "fixed cast
 * level" — e.g. a "30th level effect" item): it must replace the actor's real level only in
 * the RR calculation the target has to beat, not the actor's XP award.
 */
import { jest } from '@jest/globals';
import ForceSpellService from '../module/spells/services/force_spell_service.js';
import CastingOptionsService from '../module/spells/services/casting_options_service.js';
import BaseSpellService from '../module/spells/services/base_spell_service.js';
import ResistanceRollService from '../module/core/rolls/resistance_roll_service.js';

function makeActor(level) {
    return {
        type: 'npc', // not "character": skips XP award, keeps the test focused on the RR calc
        system: { attributes: { level: { value: level }, power_points: { current: 10 } }, fixed_info: {} },
        items: [],
        update: jest.fn().mockResolvedValue(undefined)
    };
}

function makeTargetToken(level) {
    const actor = { type: 'npc', system: { attributes: { level: { value: level } } }, effects: [] };
    return { name: 'Goblin', id: 'tok1', uuid: 'Token.tok1', document: { uuid: 'Token.tok1' }, actor };
}

describe("ForceSpellService.castForceSpell: artifact casterLevelOverride", () => {
    let spell;

    beforeEach(() => {
        // The shared Roll stub (tests/setup.js) has no .dice — castForceSpell reads
        // roll.dice[0].results[0].result for the natural roll. Fixed mid-range (50): a
        // "modified" roll, avoids the 01-02/96-100 unmodified special cases.
        global.Roll = class Roll {
            constructor(formula) { this.formula = formula; this.total = 50; this.dice = [{ results: [{ result: 50 }] }]; }
            async evaluate() { return this; }
        };
        global.canvas = { scene: null }; // getActorToken() short-circuits on !canvas?.scene
        global.game.user.targets = new Set([makeTargetToken(5)]);
        CastingOptionsService.showCastingOptionsDialog = jest.fn().mockResolvedValue({
            totalModifier: 0,
            castingModifier: 0,
            hitsTaken: 0,
            bleeding: 0,
            stunned: 0,
            penaltyEffect: 0,
            publicRollToPlayers: true,
            useSpellAdder: false
        });
        BaseSpellService.getBaseSpellResult = jest.fn().mockResolvedValue({ result: 10, subindices: {} });
        ResistanceRollService.getFinalRR = jest.fn().mockReturnValue(50);
        spell = { name: 'Ache', system: { type: 'F', level: 1 }, use: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
        global.game.user.targets = new Set();
        jest.restoreAllMocks();
    });

    test('without an override, the RR calc uses the caster\'s real level', async () => {
        const actor = makeActor(5);
        await ForceSpellService.castForceSpell({ actor, spell, spellListName: 'Robe', spellListRealm: 'essence', consumePowerPoints: false });

        expect(ResistanceRollService.getFinalRR).toHaveBeenCalledWith(5, 5, expect.any(Number));
    });

    test('with casterLevelOverride, the RR calc uses the override instead of the caster\'s real level', async () => {
        const actor = makeActor(5);
        await ForceSpellService.castForceSpell({
            actor, spell, spellListName: 'Robe', spellListRealm: 'essence',
            consumePowerPoints: false, casterLevelOverride: 30
        });

        expect(ResistanceRollService.getFinalRR).toHaveBeenCalledWith(30, 5, expect.any(Number));
    });

    test('casterLevelOverride of 0 (no artifact / not tagged) leaves the real level in effect', async () => {
        const actor = makeActor(5);
        await ForceSpellService.castForceSpell({
            actor, spell, spellListName: 'Robe', spellListRealm: 'essence',
            consumePowerPoints: false, casterLevelOverride: 0
        });

        expect(ResistanceRollService.getFinalRR).toHaveBeenCalledWith(5, 5, expect.any(Number));
    });
});
