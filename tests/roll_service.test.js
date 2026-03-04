/**
 * Tests for RollService
 */
import RollService from '../module/combat/services/roll_service.js';

describe('RollService', () => {

    describe('formatRollResult', () => {
        test('positive diff adds and formats with plus sign', () => {
            const rollData = { total: 50, details: "50" };
            const result = RollService.formatRollResult(rollData, 20);
            expect(result.base).toBe(50);
            expect(result.total).toBe(70);
            expect(result.text).toContain("+20");
            expect(result.text).toContain("<b>70</b>");
        });

        test('zero diff', () => {
            const rollData = { total: 45, details: "45" };
            const result = RollService.formatRollResult(rollData, 0);
            expect(result.base).toBe(45);
            expect(result.total).toBe(45);
            expect(result.text).toContain("+0");
        });

        test('negative diff formats without plus', () => {
            const rollData = { total: 60, details: "60" };
            const result = RollService.formatRollResult(rollData, -15);
            expect(result.base).toBe(60);
            expect(result.total).toBe(45);
            expect(result.text).toContain("-15");
            expect(result.text).toContain("<b>45</b>");
        });

        test('default diff is 0', () => {
            const rollData = { total: 30, details: "30" };
            const result = RollService.formatRollResult(rollData);
            expect(result.total).toBe(30);
        });
    });
});
