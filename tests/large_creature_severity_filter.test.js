/**
 * RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures: a Large creature ignores the A criticals, a Super Large
 * one ignores A, B and C. What is left is resolved on the large creature critical table.
 */
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';

const result = (...severities) => ({
    damage: 10,
    criticals: severities.map((severity) => ({ severity, critType: 'K', damage: 10 }))
});

const enemy = (criticalTable) => ({ system: { attributes: { critical_codes: { critical_table: criticalTable } } } });

const kept = (criticalTable, ...severities) =>
    RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(result(...severities), enemy(criticalTable))
        .criticals.map((c) => c.severity);

describe('filterCriticalResultForLargeCreatures', () => {
    test('a Large creature ignores A and keeps B to E', () => {
        expect(kept('la', 'A', 'B', 'C', 'D', 'E')).toEqual(['B', 'C', 'D', 'E']);
    });

    test('a Super Large creature ignores A, B and C and keeps D and E', () => {
        expect(kept('sl', 'A', 'B', 'C', 'D', 'E')).toEqual(['D', 'E']);
    });

    test('a critical of an ignored severity leaves nothing to resolve', () => {
        expect(kept('sl', 'C')).toEqual([]);
        expect(kept('la', 'A')).toEqual([]);
    });

    test('what is kept is resolved on the large creature table of the target', () => {
        const large = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(result('D'), enemy('la'));
        const superLarge = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(result('D'), enemy('sl'));
        expect(large.criticals[0].critType).toBe('large_melee');
        expect(superLarge.criticals[0].critType).toBe('superlarge_melee');
    });

    test('any other creature keeps every critical untouched', () => {
        expect(kept('-', 'A', 'B', 'C')).toEqual(['A', 'B', 'C']);
        expect(kept(undefined, 'A')).toEqual(['A']);
    });

    test('a critical without severity is never filtered out', () => {
        const r = { damage: 5, criticals: [{ severity: null, critType: 'K' }] };
        const out = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(r, enemy('sl'));
        expect(out.criticals).toHaveLength(1);
    });
});
