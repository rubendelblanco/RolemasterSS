/**
 * Tests for ManeuverPenaltiesService
 */
import { jest } from '@jest/globals';

// Mock RMSSWeaponSkillManager (used when spellType is not BE/DE)
jest.mock('../module/combat/rmss_weapon_skill_manager.js', () => ({
    RMSSWeaponSkillManager: {
        _getHitsPenalty: jest.fn().mockReturnValue(-15)
    }
}));

import ManeuverPenaltiesService from '../module/core/maneuver_penalties_service.js';

describe('ManeuverPenaltiesService', () => {

    const createActor = (hitsCurrent, hitsMax = 100, effects = []) => ({
        effects,
        type: 'character',
        system: {
            attributes: {
                hits: { current: hitsCurrent, max: hitsMax }
            },
            stats: {
                self_discipline: { stat_bonus: 0 }
            }
        }
    });

    describe('getManeuverPenalties - BE and DE spell types', () => {
        test('BE and DE use same hits penalty for same actor', () => {
            const actor = createActor(40, 100); // 60% hits taken -> -10 (51-75% range)
            const bePenalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'BE' });
            const dePenalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'DE' });
            expect(bePenalties.hitsTaken).toBe(dePenalties.hitsTaken);
            expect(bePenalties.hitsTaken).toBe(-10);
        });

        test('BE: 26-50% hits taken returns -5', () => {
            const actor = createActor(60, 100); // 40% taken
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'BE' });
            expect(penalties.hitsTaken).toBe(-5);
        });

        test('BE: 51-75% hits taken returns -10', () => {
            const actor = createActor(40, 100); // 60% taken
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'BE' });
            expect(penalties.hitsTaken).toBe(-10);
        });

        test('BE: 76%+ hits taken returns -20', () => {
            const actor = createActor(10, 100); // 90% taken
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'BE' });
            expect(penalties.hitsTaken).toBe(-20);
        });

        test('DE: 76%+ hits taken returns -20 (same as BE)', () => {
            const actor = createActor(10, 100);
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'DE' });
            expect(penalties.hitsTaken).toBe(-20);
        });

        test('BE: full hits returns 0 penalty', () => {
            const actor = createActor(100, 100); // 0% taken
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: 'BE' });
            expect(penalties.hitsTaken).toBe(0);
        });
    });

    describe('getManeuverPenalties - null/undefined actor', () => {
        test('null actor returns zeros', () => {
            const penalties = ManeuverPenaltiesService.getManeuverPenalties(null);
            expect(penalties).toEqual({ hitsTaken: 0, bleeding: 0, stunned: 0, penaltyEffect: 0 });
        });
    });

    describe('getTotalAutoPenalty', () => {
        test('sums all penalties with penaltyEffect clamped to min 0', () => {
            const penalties = { hitsTaken: -10, bleeding: -5, stunned: 0, penaltyEffect: -20 };
            const total = ManeuverPenaltiesService.getTotalAutoPenalty(penalties);
            expect(total).toBe(-10 + -5 + 0 + -20);
        });

        test('positive penaltyEffect is treated as 0', () => {
            const penalties = { hitsTaken: -10, bleeding: 0, stunned: 0, penaltyEffect: 5 };
            const total = ManeuverPenaltiesService.getTotalAutoPenalty(penalties);
            expect(total).toBe(-10 + 0 + 0 + 0); // Math.min(0, 5) = 0
        });
    });
});
