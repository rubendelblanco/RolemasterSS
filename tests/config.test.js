/**
 * Tests for config constants (ballTables, boltTables)
 */
import { rmss } from '../module/config.js';

describe('Config - spell attack tables', () => {

    describe('ballTables', () => {
        test('contains expected ball tables', () => {
            expect(rmss.ballTables).toContain('fire_ball');
            expect(rmss.ballTables).toContain('ice_ball');
        });

        test('has no duplicate entries', () => {
            const unique = [...new Set(rmss.ballTables)];
            expect(rmss.ballTables).toEqual(unique);
        });

        test('all entries are non-empty strings', () => {
            rmss.ballTables.forEach(key => {
                expect(typeof key).toBe('string');
                expect(key.length).toBeGreaterThan(0);
            });
        });
    });

    describe('boltTables', () => {
        test('contains expected bolt tables', () => {
            expect(rmss.boltTables).toContain('fire_bolt');
            expect(rmss.boltTables).toContain('ice_bolt');
            expect(rmss.boltTables).toContain('lighting_bolt');
            expect(rmss.boltTables).toContain('shock_bolt');
            expect(rmss.boltTables).toContain('water_bolt');
        });

        test('has no duplicate entries', () => {
            const unique = [...new Set(rmss.boltTables)];
            expect(rmss.boltTables).toEqual(unique);
        });

        test('all entries are non-empty strings', () => {
            rmss.boltTables.forEach(key => {
                expect(typeof key).toBe('string');
                expect(key.length).toBeGreaterThan(0);
            });
        });
    });

    describe('BE attack tables (balls + bolts)', () => {
        test('combined list has balls first then bolts', () => {
            const balls = rmss.ballTables;
            const bolts = rmss.boltTables;
            const beTables = [...balls, ...bolts];
            expect(beTables[0]).toBe(balls[0]);
            expect(beTables[balls.length - 1]).toBe(balls[balls.length - 1]);
            expect(beTables[balls.length]).toBe(bolts[0]);
        });

        test('no overlap between ball and bolt tables', () => {
            const overlap = rmss.ballTables.filter(b => rmss.boltTables.includes(b));
            expect(overlap).toEqual([]);
        });

        test('DE uses only bolt tables (subset of BE)', () => {
            rmss.boltTables.forEach(bolt => {
                expect(rmss.ballTables).not.toContain(bolt);
            });
        });
    });
});
