/**
 * Tests for FacingService
 */
import FacingService from '../module/combat/services/facing_service.js';

describe('FacingService', () => {

    describe('FACING constants', () => {
        test('has expected facing values', () => {
            expect(FacingService.FACING.FRONT).toBe("");
            expect(FacingService.FACING.FLANK).toBe("15");
            expect(FacingService.FACING.REAR_FLANK).toBe("25");
            expect(FacingService.FACING.REAR).toBe("35");
        });
    });

    describe('_getTokenCenter', () => {
        test('uses center when available', () => {
            const token = { center: { x: 100, y: 50 } };
            expect(FacingService._getTokenCenter(token)).toEqual({ x: 100, y: 50 });
        });

        test('computes center from x, y, width, height', () => {
            const token = { x: 0, y: 0, width: 2, height: 2 };
            expect(FacingService._getTokenCenter(token)).toEqual({ x: 1, y: 1 });
        });

        test('uses document when available', () => {
            const token = { document: { x: 10, y: 20, width: 2, height: 2 } };
            expect(FacingService._getTokenCenter(token)).toEqual({ x: 11, y: 21 });
        });
    });

    describe('calculateFacing', () => {
        test('null tokens return FRONT', () => {
            expect(FacingService.calculateFacing(null, {})).toBe(FacingService.FACING.FRONT);
            expect(FacingService.calculateFacing({}, null)).toBe(FacingService.FACING.FRONT);
        });

        test('attacker directly in front (south of defender) returns FRONT', () => {
            // Defender at origin, facing south (rotation 0). Attacker south = in front.
            const defender = { center: { x: 100, y: 100 }, document: { rotation: 0 } };
            const attacker = { center: { x: 100, y: 150 } }; // below defender = south
            expect(FacingService.calculateFacing(attacker, defender)).toBe(FacingService.FACING.FRONT);
        });

        test('attacker directly behind returns REAR', () => {
            const defender = { center: { x: 100, y: 100 }, document: { rotation: 0 } };
            const attacker = { center: { x: 100, y: 50 } }; // above defender = north = behind
            expect(FacingService.calculateFacing(attacker, defender)).toBe(FacingService.FACING.REAR);
        });
    });

    describe('getRotationToFaceTarget', () => {
        test('null tokens return null', () => {
            expect(FacingService.getRotationToFaceTarget(null, {})).toBeNull();
            expect(FacingService.getRotationToFaceTarget({}, null)).toBeNull();
        });

        test('returns rotation to face target', () => {
            const attacker = { center: { x: 0, y: 0 } };
            const defender = { center: { x: 100, y: 0 } }; // east of attacker
            const rot = FacingService.getRotationToFaceTarget(attacker, defender);
            expect(typeof rot).toBe("number");
            expect(rot).toBeGreaterThanOrEqual(0);
            expect(rot).toBeLessThan(360);
        });
    });
});
