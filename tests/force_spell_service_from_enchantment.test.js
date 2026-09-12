/**
 * There is no casting maneuver to roll when a spell is triggered by an item (wand, potion,
 * artifact, etc.) - it just goes off. castForceSpell must skip StaticManeuverService entirely
 * (and therefore can never roll on the Spell Failure Table) when fromEnchantment is true, for
 * any spell type/target combination that would otherwise hit that maneuver check.
 */
import { jest } from '@jest/globals';
import ForceSpellService from '../module/spells/services/force_spell_service.js';
import CastingOptionsService from '../module/spells/services/casting_options_service.js';
import StaticManeuverService from '../module/spells/services/static_maneuver_service.js';
import SpellFailureService from '../module/spells/services/spell_failure_service.js';

function makeActor() {
    return {
        type: 'npc', // not "character": skips the spell-XP chat path, keeps the test focused on the maneuver bypass
        system: {
            attributes: { level: { value: 5 }, power_points: { current: 10 }, experience_points: { value: 0 } },
            fixed_info: {}
        },
        items: [],
        update: jest.fn().mockResolvedValue(undefined)
    };
}

describe("ForceSpellService.castForceSpell: fromEnchantment skips the casting maneuver", () => {
    let spell;

    beforeEach(() => {
        global.Roll = class Roll {
            constructor(formula) { this.formula = formula; this.total = 3; this.dice = [{ results: [{ result: 3 }] }]; }
            async evaluate() { return this; }
        };
        global.canvas = { scene: null };
        global.game.user.targets = new Set(); // no targets: E-type spell always hits the static maneuver branch
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
        // A very low roll (3) with no bonuses would normally fail the static maneuver.
        jest.spyOn(StaticManeuverService, 'getResult').mockResolvedValue({ code: 'failure', label: 'Failure' });
        jest.spyOn(SpellFailureService, 'isFailureResult').mockReturnValue(true);
        jest.spyOn(SpellFailureService, 'rollFailure').mockResolvedValue({ naturalRoll: 3, description: 'oops' });
        spell = { name: 'Detect', system: { type: 'E', level: 1, no_pp: true }, use: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
        global.game.user.targets = new Set();
        jest.restoreAllMocks();
    });

    test('without fromEnchantment, a bad roll hits the static maneuver and can fail', async () => {
        const actor = makeActor();
        await ForceSpellService.castForceSpell({ actor, spell, spellListName: 'Detect', spellListRealm: 'essence', consumePowerPoints: false });

        expect(StaticManeuverService.getResult).toHaveBeenCalled();
        expect(SpellFailureService.rollFailure).toHaveBeenCalled();
    });

    test('with fromEnchantment, the same bad roll never touches the maneuver or failure table', async () => {
        const actor = makeActor();
        await ForceSpellService.castForceSpell({
            actor, spell, spellListName: 'Detect', spellListRealm: 'essence',
            consumePowerPoints: false, fromEnchantment: true
        });

        expect(StaticManeuverService.getResult).not.toHaveBeenCalled();
        expect(SpellFailureService.rollFailure).not.toHaveBeenCalled();
    });
});
