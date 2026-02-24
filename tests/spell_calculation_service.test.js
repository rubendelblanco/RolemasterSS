/**
 * Tests for SpellCalculationService
 */
import SpellCalculationService from '../module/spells/services/spell_calculation_service.js';

describe('SpellCalculationService', () => {

    describe('calculateResistanceRoll', () => {
        
        describe('basic calculations', () => {
            test('equal levels returns base RR of 50', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 5,
                    targetLevel: 5
                });
                expect(rr).toBe(50);
            });

            test('caster 5 levels higher returns 65', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 10,
                    targetLevel: 5
                });
                expect(rr).toBe(65); // 50 + 5*3 = 65
            });

            test('target 5 levels higher returns 35', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 5,
                    targetLevel: 10
                });
                expect(rr).toBe(35); // 50 - 5*3 = 35
            });

            test('caster 10 levels higher returns 80', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 15,
                    targetLevel: 5
                });
                expect(rr).toBe(80); // 50 + 10*3 = 80
            });
        });

        describe('high-level adjustment (above level 15)', () => {
            test('both at level 15 equals base 50', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 15,
                    targetLevel: 15
                });
                expect(rr).toBe(50);
            });

            test('caster 20, target 15 uses reduced scaling', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 20,
                    targetLevel: 15
                });
                // baseDelta: 15-15 = 0, highDelta: 5-0 = 5
                expect(rr).toBe(55); // 50 + 0*3 + 5*1 = 55
            });

            test('caster 20, target 10 combines both deltas', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 20,
                    targetLevel: 10
                });
                // baseDelta: 15-10 = 5, highDelta: 5-0 = 5
                expect(rr).toBe(70); // 50 + 5*3 + 5*1 = 70
            });

            test('both at high levels', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 25,
                    targetLevel: 20
                });
                // baseDelta: 15-15 = 0, highDelta: 10-5 = 5
                expect(rr).toBe(55); // 50 + 0*3 + 5*1 = 55
            });
        });

        describe('clamping', () => {
            test('extremely high caster level caps at 95', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 50,
                    targetLevel: 1
                });
                expect(rr).toBe(95);
            });

            test('extremely high target level caps at 5', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 1,
                    targetLevel: 50
                });
                expect(rr).toBe(5);
            });
        });

        describe('edge cases', () => {
            test('level 1 vs level 1', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 1,
                    targetLevel: 1
                });
                expect(rr).toBe(50);
            });

            test('handles zero level (should treat as 0)', () => {
                const rr = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: 5,
                    targetLevel: 0
                });
                expect(rr).toBe(65); // 50 + 5*3 = 65
            });
        });
    });
});
