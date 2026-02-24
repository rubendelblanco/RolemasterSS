/**
 * Tests for SpellFailureService
 */
import SpellFailureService from '../module/spells/services/spell_failure_service.js';

describe('SpellFailureService', () => {
    
    describe('getColumnForSpellType', () => {
        test('E type returns elemental', () => {
            expect(SpellFailureService.getColumnForSpellType('E')).toBe('elemental');
        });

        test('BE type returns elemental', () => {
            expect(SpellFailureService.getColumnForSpellType('BE')).toBe('elemental');
        });

        test('DE type returns elemental', () => {
            expect(SpellFailureService.getColumnForSpellType('DE')).toBe('elemental');
        });

        test('F type returns force', () => {
            expect(SpellFailureService.getColumnForSpellType('F')).toBe('force');
        });

        test('I type returns informational', () => {
            expect(SpellFailureService.getColumnForSpellType('I')).toBe('informational');
        });

        test('P type returns other', () => {
            expect(SpellFailureService.getColumnForSpellType('P')).toBe('other');
        });

        test('U type returns other', () => {
            expect(SpellFailureService.getColumnForSpellType('U')).toBe('other');
        });

        test('unknown type returns other', () => {
            expect(SpellFailureService.getColumnForSpellType('X')).toBe('other');
        });
    });

    describe('getModifierMultiplier', () => {
        test('spectacular_failure returns 3', () => {
            expect(SpellFailureService.getModifierMultiplier('spectacular_failure')).toBe(3);
        });

        test('absolute_failure returns 2', () => {
            expect(SpellFailureService.getModifierMultiplier('absolute_failure')).toBe(2);
        });

        test('failure returns 1', () => {
            expect(SpellFailureService.getModifierMultiplier('failure')).toBe(1);
        });

        test('unknown code returns 1 (default)', () => {
            expect(SpellFailureService.getModifierMultiplier('unknown')).toBe(1);
        });
    });

    describe('isFailureResult', () => {
        test('spectacular_failure is a failure', () => {
            expect(SpellFailureService.isFailureResult('spectacular_failure')).toBe(true);
        });

        test('absolute_failure is a failure', () => {
            expect(SpellFailureService.isFailureResult('absolute_failure')).toBe(true);
        });

        test('failure is a failure', () => {
            expect(SpellFailureService.isFailureResult('failure')).toBe(true);
        });

        test('success is not a failure', () => {
            expect(SpellFailureService.isFailureResult('success')).toBe(false);
        });

        test('partial_success is not a failure', () => {
            expect(SpellFailureService.isFailureResult('partial_success')).toBe(false);
        });
    });

    describe('_findResult', () => {
        const mockTable = {
            ranges: [
                { min: 1, max: 20, elemental: 'result_1_20', force: 'force_1_20' },
                { min: 21, max: 50, elemental: 'result_21_50', force: 'force_21_50' },
                { min: 51, max: 100, elemental: 'result_51_100', force: 'force_51_100' },
                { min: 101, max: null, elemental: 'result_101+', force: 'force_101+' }
            ]
        };

        test('finds correct range for value 15', () => {
            expect(SpellFailureService._findResult(mockTable, 15, 'elemental')).toBe('result_1_20');
        });

        test('finds correct range for value 35', () => {
            expect(SpellFailureService._findResult(mockTable, 35, 'elemental')).toBe('result_21_50');
        });

        test('finds correct range for value 75', () => {
            expect(SpellFailureService._findResult(mockTable, 75, 'force')).toBe('force_51_100');
        });

        test('finds correct range for value 150 (unbounded max)', () => {
            expect(SpellFailureService._findResult(mockTable, 150, 'elemental')).toBe('result_101+');
        });

        test('returns correct column', () => {
            expect(SpellFailureService._findResult(mockTable, 30, 'force')).toBe('force_21_50');
        });
    });
});
