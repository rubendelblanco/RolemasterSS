/**
 * Tests for StatService
 */
import StatService from '../module/actors/services/stat_service.js';

describe('StatService', () => {

    describe('getRollFormulaForPotential', () => {

        describe('fixed ranges', () => {
            test('20-24 returns 20+8d10', () => {
                expect(StatService.getRollFormulaForPotential(20)).toBe("20+8d10");
                expect(StatService.getRollFormulaForPotential(22)).toBe("20+8d10");
                expect(StatService.getRollFormulaForPotential(24)).toBe("20+8d10");
            });

            test('25-34 returns 30+7d10', () => {
                expect(StatService.getRollFormulaForPotential(25)).toBe("30+7d10");
                expect(StatService.getRollFormulaForPotential(30)).toBe("30+7d10");
                expect(StatService.getRollFormulaForPotential(34)).toBe("30+7d10");
            });

            test('35-44 returns 40+6d10', () => {
                expect(StatService.getRollFormulaForPotential(35)).toBe("40+6d10");
                expect(StatService.getRollFormulaForPotential(40)).toBe("40+6d10");
                expect(StatService.getRollFormulaForPotential(44)).toBe("40+6d10");
            });

            test('45-54 returns 50+5d10', () => {
                expect(StatService.getRollFormulaForPotential(45)).toBe("50+5d10");
                expect(StatService.getRollFormulaForPotential(50)).toBe("50+5d10");
                expect(StatService.getRollFormulaForPotential(54)).toBe("50+5d10");
            });

            test('55-64 returns 60+4d10', () => {
                expect(StatService.getRollFormulaForPotential(55)).toBe("60+4d10");
                expect(StatService.getRollFormulaForPotential(60)).toBe("60+4d10");
                expect(StatService.getRollFormulaForPotential(64)).toBe("60+4d10");
            });

            test('65-74 returns 70+3d10', () => {
                expect(StatService.getRollFormulaForPotential(65)).toBe("70+3d10");
                expect(StatService.getRollFormulaForPotential(70)).toBe("70+3d10");
                expect(StatService.getRollFormulaForPotential(74)).toBe("70+3d10");
            });

            test('75-84 returns 80+2d10', () => {
                expect(StatService.getRollFormulaForPotential(75)).toBe("80+2d10");
                expect(StatService.getRollFormulaForPotential(80)).toBe("80+2d10");
                expect(StatService.getRollFormulaForPotential(84)).toBe("80+2d10");
            });

            test('85-91 returns 90+1d10', () => {
                expect(StatService.getRollFormulaForPotential(85)).toBe("90+1d10");
                expect(StatService.getRollFormulaForPotential(88)).toBe("90+1d10");
                expect(StatService.getRollFormulaForPotential(91)).toBe("90+1d10");
            });
        });

        describe('variable roll (92-99)', () => {
            test('92 returns 92+1d9', () => {
                expect(StatService.getRollFormulaForPotential(92)).toBe("92+1d9");
            });

            test('95 returns 95+1d6', () => {
                expect(StatService.getRollFormulaForPotential(95)).toBe("95+1d6");
            });

            test('99 returns 99+1d2', () => {
                expect(StatService.getRollFormulaForPotential(99)).toBe("99+1d2");
            });
        });

        describe('100', () => {
            test('100 returns 99+1d10', () => {
                expect(StatService.getRollFormulaForPotential(100)).toBe("99+1d10");
            });
        });

        describe('invalid values return null', () => {
            test('values below 20 return null', () => {
                expect(StatService.getRollFormulaForPotential(0)).toBeNull();
                expect(StatService.getRollFormulaForPotential(19)).toBeNull();
            });

            test('values between 91 and 92 return null (boundary)', () => {
                expect(StatService.getRollFormulaForPotential(91.5)).toBeNull();
            });

            test('values above 100 return null', () => {
                expect(StatService.getRollFormulaForPotential(101)).toBeNull();
                expect(StatService.getRollFormulaForPotential(150)).toBeNull();
            });

            test('NaN and invalid types return null', () => {
                expect(StatService.getRollFormulaForPotential(NaN)).toBeNull();
                expect(StatService.getRollFormulaForPotential(undefined)).toBeNull();
                expect(StatService.getRollFormulaForPotential(null)).toBeNull();
            });
        });
    });
});
