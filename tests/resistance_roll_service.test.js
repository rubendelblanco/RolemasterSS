/**
 * Tests for ResistanceRollService
 */
import ResistanceRollService from '../module/core/rolls/resistance_roll_service.js';

describe('ResistanceRollService', () => {

    describe('calculateBaseRR', () => {
        
        describe('basic calculations', () => {
            test('equal levels returns base RR of 50', () => {
                const rr = ResistanceRollService.calculateBaseRR(5, 5);
                expect(rr).toBe(50);
            });

            test('attacker 5 levels higher returns 65', () => {
                const rr = ResistanceRollService.calculateBaseRR(10, 5);
                expect(rr).toBe(65); // 50 + 5*3 = 65
            });

            test('defender 5 levels higher returns 35', () => {
                const rr = ResistanceRollService.calculateBaseRR(5, 10);
                expect(rr).toBe(35); // 50 - 5*3 = 35
            });

            test('attacker 10 levels higher returns 80', () => {
                const rr = ResistanceRollService.calculateBaseRR(15, 5);
                expect(rr).toBe(80); // 50 + 10*3 = 80
            });
        });

        describe('high-level adjustment (above level 15)', () => {
            test('both at level 15 equals base 50', () => {
                const rr = ResistanceRollService.calculateBaseRR(15, 15);
                expect(rr).toBe(50);
            });

            test('attacker 20, defender 15 uses reduced scaling', () => {
                const rr = ResistanceRollService.calculateBaseRR(20, 15);
                // baseDelta: 15-15 = 0, highDelta: 5-0 = 5
                expect(rr).toBe(55); // 50 + 0*3 + 5*1 = 55
            });

            test('attacker 20, defender 10 combines both deltas', () => {
                const rr = ResistanceRollService.calculateBaseRR(20, 10);
                // baseDelta: 15-10 = 5, highDelta: 5-0 = 5
                expect(rr).toBe(70); // 50 + 5*3 + 5*1 = 70
            });

            test('both at high levels', () => {
                const rr = ResistanceRollService.calculateBaseRR(25, 20);
                // baseDelta: 15-15 = 0, highDelta: 10-5 = 5
                expect(rr).toBe(55); // 50 + 0*3 + 5*1 = 55
            });
        });

        describe('clamping', () => {
            test('extremely high attacker level caps at 95', () => {
                const rr = ResistanceRollService.calculateBaseRR(50, 1);
                expect(rr).toBe(95);
            });

            test('extremely high defender level caps at 5', () => {
                const rr = ResistanceRollService.calculateBaseRR(1, 50);
                expect(rr).toBe(5);
            });
        });

        describe('edge cases', () => {
            test('level 1 vs level 1', () => {
                const rr = ResistanceRollService.calculateBaseRR(1, 1);
                expect(rr).toBe(50);
            });

            test('handles zero level', () => {
                const rr = ResistanceRollService.calculateBaseRR(5, 0);
                expect(rr).toBe(65); // 50 + 5*3 = 65
            });
        });
    });

    describe('getFinalRR', () => {
        
        describe('with positive modifier (easier for defender)', () => {
            test('reduces RR by modifier amount', () => {
                // Base RR for 10 vs 5 = 65
                const rr = ResistanceRollService.getFinalRR(10, 5, 20);
                expect(rr).toBe(45); // 65 - 20 = 45
            });

            test('large modifier can reduce RR to 0', () => {
                // Base RR for 5 vs 5 = 50
                const rr = ResistanceRollService.getFinalRR(5, 5, 100);
                expect(rr).toBe(0); // 50 - 100 = -50, clamped to 0
            });
        });

        describe('with negative modifier (harder for defender)', () => {
            test('increases RR by modifier amount', () => {
                // Base RR for 5 vs 10 = 35
                const rr = ResistanceRollService.getFinalRR(5, 10, -10);
                expect(rr).toBe(45); // 35 - (-10) = 45
            });
        });

        describe('with zero modifier', () => {
            test('returns base RR unchanged', () => {
                // Base RR for 10 vs 5 = 65
                const rr = ResistanceRollService.getFinalRR(10, 5, 0);
                expect(rr).toBe(65);
            });

            test('default modifier is 0', () => {
                const rr = ResistanceRollService.getFinalRR(10, 5);
                expect(rr).toBe(65);
            });
        });

        describe('use cases', () => {
            test('spell: caster 10, target 5, modifier +30', () => {
                const rr = ResistanceRollService.getFinalRR(10, 5, 30);
                expect(rr).toBe(35); // 65 - 30 = 35
            });

            test('poison: level 8 vs target level 3', () => {
                const rr = ResistanceRollService.getFinalRR(8, 3, 0);
                expect(rr).toBe(65); // 50 + 5*3 = 65
            });

            test('disease: level 5 vs target level 10, weak strain -15', () => {
                const rr = ResistanceRollService.getFinalRR(5, 10, -15);
                expect(rr).toBe(50); // 35 - (-15) = 50
            });

            test('trap: level 12 vs target level 6', () => {
                const rr = ResistanceRollService.getFinalRR(12, 6);
                expect(rr).toBe(68); // 50 + 6*3 = 68
            });
        });
    });
});

describe('ResistanceRollService.resolveTarget (explicit target from a spell)', () => {
    test('without an explicit target it is the level-based RR, minus the defender bonus', () => {
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4 })).toBe(53);
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, modifier: 10 })).toBe(43);
    });

    test('the Calming Song case: the spell card says 108 (53 from levels, -55 from the table); that is the figure used', () => {
        // Lvl 5 caster vs lvl 4 orc, spell table modifier -55 -> 108 on the cast card
        const finalRR = ResistanceRollService.getFinalRR(5, 4, -55);
        expect(finalRR).toBe(108);
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, explicitTarget: finalRR })).toBe(108);
    });

    test('the defender bonus is taken off the explicit target, and it never goes below zero', () => {
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, modifier: 20, explicitTarget: 108 })).toBe(88);
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, modifier: 50, explicitTarget: 30 })).toBe(0);
    });

    test('an explicit target of zero is respected (not mistaken for "none")', () => {
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, explicitTarget: 0 })).toBe(0);
    });

    test('a non-numeric explicit target falls back to the levels', () => {
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, explicitTarget: undefined })).toBe(53);
        expect(ResistanceRollService.resolveTarget({ attackerLevel: 5, defenderLevel: 4, explicitTarget: null })).toBe(53);
    });
});
