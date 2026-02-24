/**
 * Tests for StaticManeuverService
 */
import { jest } from '@jest/globals';
import StaticManeuverService from '../module/spells/services/static_maneuver_service.js';

describe('StaticManeuverService', () => {

    describe('getResultClass', () => {
        test('spectacular_failure returns result-critical-failure', () => {
            expect(StaticManeuverService.getResultClass('spectacular_failure')).toBe('result-critical-failure');
        });

        test('absolute_failure returns result-failure', () => {
            expect(StaticManeuverService.getResultClass('absolute_failure')).toBe('result-failure');
        });

        test('failure returns result-failure', () => {
            expect(StaticManeuverService.getResultClass('failure')).toBe('result-failure');
        });

        test('partial_success returns result-partial', () => {
            expect(StaticManeuverService.getResultClass('partial_success')).toBe('result-partial');
        });

        test('near_success returns result-partial', () => {
            expect(StaticManeuverService.getResultClass('near_success')).toBe('result-partial');
        });

        test('success returns result-success', () => {
            expect(StaticManeuverService.getResultClass('success')).toBe('result-success');
        });

        test('absolute_success returns result-critical-success', () => {
            expect(StaticManeuverService.getResultClass('absolute_success')).toBe('result-critical-success');
        });

        test('unusual_event returns result-unusual', () => {
            expect(StaticManeuverService.getResultClass('unusual_event')).toBe('result-unusual');
        });

        test('unusual_success returns result-critical-success', () => {
            expect(StaticManeuverService.getResultClass('unusual_success')).toBe('result-critical-success');
        });

        test('unknown code returns empty string', () => {
            expect(StaticManeuverService.getResultClass('unknown')).toBe('');
        });
    });

    describe('getResult', () => {
        const mockTable = {
            ranges: [
                { min: null, max: -76, code: 'spectacular_failure', name: 'Spectacular Failure', description: 'Very bad' },
                { min: -75, max: 1, code: 'absolute_failure', name: 'Absolute Failure', description: 'Bad' },
                { min: 2, max: 25, code: 'failure', name: 'Failure', description: 'Failed' },
                { min: 26, max: 40, code: 'partial_success', name: 'Partial Success', description: 'Partial' },
                { min: 41, max: 60, code: 'near_success', name: 'Near Success', description: 'Almost' },
                { min: 61, max: 125, code: 'success', name: 'Success', description: 'Success' },
                { min: 126, max: null, code: 'absolute_success', name: 'Absolute Success', description: 'Great!' }
            ],
            special: {
                um_66: { code: 'unusual_event', name: 'Unusual Event', description: 'Something weird' },
                um_100: { code: 'unusual_success', name: 'Unusual Success', description: 'Lucky!' }
            }
        };

        beforeEach(() => {
            // Reset cache and mock fetch
            StaticManeuverService._tableCache = {};
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockTable)
            });
        });

        test('returns spectacular_failure for total -100', async () => {
            const result = await StaticManeuverService.getResult(-100, 10);
            expect(result.code).toBe('spectacular_failure');
        });

        test('returns failure for total 15', async () => {
            const result = await StaticManeuverService.getResult(15, 15);
            expect(result.code).toBe('failure');
        });

        test('returns success for total 80', async () => {
            const result = await StaticManeuverService.getResult(80, 50);
            expect(result.code).toBe('success');
        });

        test('returns absolute_success for total 150', async () => {
            const result = await StaticManeuverService.getResult(150, 90);
            expect(result.code).toBe('absolute_success');
        });

        test('natural roll 66 triggers unusual_event regardless of total', async () => {
            const result = await StaticManeuverService.getResult(100, 66);
            expect(result.code).toBe('unusual_event');
            expect(result.isSpecial).toBe(true);
        });

        test('natural roll 100 triggers unusual_success regardless of total', async () => {
            const result = await StaticManeuverService.getResult(50, 100);
            expect(result.code).toBe('unusual_success');
            expect(result.isSpecial).toBe(true);
        });
    });
});
