/**
 * The casting options dialog: every automatic bonus and penalty that goes into the cast roll is listed, in green when it
 * helps and red when it hurts, and the movement penalty counts the movement spent this round without the carried weight.
 */
import { jest } from '@jest/globals';
import CastingOptionsService from '../module/spells/services/casting_options_service.js';
import ManeuverPenaltiesService from '../module/core/maneuver_penalties_service.js';
import { MODIFIER_COLOR } from '../module/core/skills/modifier_tone.js';

const modifiers = {
    hands: {
        none: { essence: -40 },
        one: { essence: -10 },
        two: { essence: 0 }
    },
    voice: {
        none: { essence: -25 },
        whisper: { essence: -10 },
        normal: { essence: 0 },
        shout: { essence: 5 }
    },
    preparation: { "0": 0, "1": 10, "2": 20 }
};

beforeAll(() => { global.game.i18n.format = (key) => key; });

const build = (autoPenalties) =>
    CastingOptionsService._buildDialogContent("essence", "F", modifiers, autoPenalties, true, 0, false, false);

/** The line of the dialog that carries a label, as the html of that div (the i18n mock returns the key itself). */
const lineOf = (html, key) => {
    const m = html.match(new RegExp(`<div style="([^"]*)">${key}: ([^<]*)</div>`));
    return m ? { style: m[1], value: m[2] } : null;
};

describe('the automatic modifiers of the casting dialog', () => {
    const all = {
        hitsTaken: -10, bleeding: -5, stunned: -20, penaltyEffect: -15, activeBonus: 15,
        armor: -25, helmet: -10, armorRelief: 20, movement: -30
    };

    test('every one of them is listed with its sign', () => {
        const html = build(all);
        expect(lineOf(html, "rmss.combat.hits_taken").value).toBe("-10");
        expect(lineOf(html, "rmss.maneuvers.bleeding").value).toBe("-5");
        expect(lineOf(html, "rmss.maneuvers.stunned").value).toBe("-20");
        expect(lineOf(html, "rmss.combat.penalty").value).toBe("-15");
        expect(lineOf(html, "rmss.maneuvers.active_effect_bonus").value).toBe("+15");
        expect(lineOf(html, "rmss.spells.armor_casting_penalty").value).toBe("-25");
        expect(lineOf(html, "rmss.spells.helmet_casting_penalty").value).toBe("-10");
        expect(lineOf(html, "rmss.spells.transcend_armor_relief").value).toBe("+20");
        expect(lineOf(html, "rmss.spells.movement_penalty").value).toBe("-30");
    });

    test('penalties are red and bonuses are green', () => {
        const html = build(all);
        expect(lineOf(html, "rmss.spells.movement_penalty").style).toContain(MODIFIER_COLOR.NEGATIVE);
        expect(lineOf(html, "rmss.combat.hits_taken").style).toContain(MODIFIER_COLOR.NEGATIVE);
        expect(lineOf(html, "rmss.maneuvers.active_effect_bonus").style).toContain(MODIFIER_COLOR.POSITIVE);
        expect(lineOf(html, "rmss.spells.transcend_armor_relief").style).toContain(MODIFIER_COLOR.POSITIVE);
    });

    test('the movement line only appears when there is a movement penalty', () => {
        expect(lineOf(build({ ...all, movement: 0 }), "rmss.spells.movement_penalty")).toBeNull();
    });

    test('the hands, voice and preparation options are coloured by what they add', () => {
        const html = build({});
        const style = (value) => html.match(new RegExp(`<option value="${value}"[^>]*style="([^"]*)"`))[1];
        expect(style("none")).toContain(MODIFIER_COLOR.NEGATIVE);        // the first "none" is the hands one
        expect(html).toMatch(/<option value="shout"[^>]*style="[^"]*#1f7a1f/);
        expect(html).toMatch(/<option value="whisper"[^>]*style="[^"]*#cc0000/);
        expect(html).toMatch(/<option value="normal"[^>]*style="[^"]*#555/);
        expect(html).toMatch(/<option value="2"[^>]*style="[^"]*#1f7a1f/);
    });

    test('the total in the dialog adds the movement penalty and is coloured when it is recalculated', () => {
        const html = build({ movement: -30 });
        expect(html).toContain("const armorMod = 0 + 0 + 0 + -30;");
        expect(html).toContain(`'${MODIFIER_COLOR.NEGATIVE}'`);
        expect(html).toContain(`'${MODIFIER_COLOR.POSITIVE}'`);
    });
});

describe('getTotalAutoPenalty with the movement penalty', () => {
    test('it is part of the total that goes into the roll', () => {
        const base = { hitsTaken: -10, bleeding: 0, stunned: 0, penaltyEffect: 0 };
        expect(ManeuverPenaltiesService.getTotalAutoPenalty({ ...base, movement: -30 })).toBe(-40);
        expect(ManeuverPenaltiesService.getTotalAutoPenalty(base)).toBe(-10);
    });
});

describe('_castingMovementPenalty', () => {
    const rate = { value: 50, effective_value: 34, current: 34 };
    const actor = { system: { attributes: { movement_rate: rate } } };

    afterEach(() => { global.game.combat = null; });

    test('outside combat there is no movement penalty', () => {
        global.game.combat = null;
        expect(CastingOptionsService._castingMovementPenalty({ system: { attributes: { movement_rate: { ...rate, current: 10 } } } }, "F")).toBe(0);
    });

    test('a character carrying weight who has not moved takes no penalty', () => {
        global.game.combat = { started: true };
        expect(CastingOptionsService._castingMovementPenalty(actor, "F")).toBe(0);
    });

    test('the movement spent counts against the unencumbered rate', () => {
        global.game.combat = { started: true };
        const moved = { system: { attributes: { movement_rate: { ...rate, current: 17 } } } };   // spent 17 of 50
        expect(CastingOptionsService._castingMovementPenalty(moved, "F")).toBe(-34);
    });

    test('bolts, balls and instant spells do not take it here', () => {
        global.game.combat = { started: true };
        const moved = { system: { attributes: { movement_rate: { ...rate, current: 17 } } } };
        for (const t of ["BE", "DE", "I", "be"]) expect(CastingOptionsService._castingMovementPenalty(moved, t)).toBe(0);
    });
});

describe('the warning for a negative total', () => {
    test('the dialog carries a warning badge, hidden until the total is negative', () => {
        const html = build({});
        expect(html).toContain('class="encumbrance-penalty-badge" id="casting-negative-warning"');
        expect(html).toContain('rmss.spells.casting_negative_warning');
        expect(html).toMatch(/id="casting-negative-warning-row" style="display:none;/);
    });

    test('recalculating the total shows the warning when it is below zero and hides it otherwise', () => {
        const html = build({});
        expect(html).toContain("getElementById('casting-negative-warning-row').style.display = total < 0 ? 'flex' : 'none';");
    });
});
