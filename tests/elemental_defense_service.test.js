/**
 * Tests for the elemental defense carried by effects (counts only against elemental spell attacks).
 */
import { getElementalDefenseBonus, ELEMENTAL_DEFENSE_FLAG } from '../module/combat/services/elemental_defense_service.js';
import { getAreaDefenseDb } from '../module/combat/services/area_spell_resolution_service.js';

const fx = (bonus, extra = {}) => ({ flags: { rmss: { [ELEMENTAL_DEFENSE_FLAG]: bonus } }, ...extra });

describe('getElementalDefenseBonus', () => {
  test('an actor without effects has none', () => {
    expect(getElementalDefenseBonus({ effects: [] })).toBe(0);
    expect(getElementalDefenseBonus(null)).toBe(0);
    expect(getElementalDefenseBonus(undefined)).toBe(0);
  });

  test('sums the bonus of every effect that carries one', () => {
    expect(getElementalDefenseBonus({ effects: [fx(5), fx(3), { flags: {} }] })).toBe(8);
  });

  test('disabled and expired (suppressed) effects do not count', () => {
    const actor = { effects: [fx(5), fx(5, { disabled: true }), fx(5, { isSuppressed: true })] };
    expect(getElementalDefenseBonus(actor)).toBe(5);
  });

  test('a value that is not a number counts as 0', () => {
    expect(getElementalDefenseBonus({ effects: [fx("mucho"), fx(undefined), fx(4)] })).toBe(4);
  });
});

describe('getAreaDefenseDb', () => {
  const actor = (info, effects = []) => ({ system: { armor_info: info }, effects });

  test('without elemental defense it is unchanged: total minus shield', () => {
    expect(getAreaDefenseDb(actor({ total_db: 30, shield_bonus: 10 }))).toBe(20);
    expect(getAreaDefenseDb(actor({ total_db: 30 }))).toBe(30);
  });

  test('adds the elemental defense on top of the DB without the shield', () => {
    expect(getAreaDefenseDb(actor({ total_db: 30, shield_bonus: 10 }, [fx(5)]))).toBe(25);
    expect(getAreaDefenseDb(actor({ total_db: 30 }, [fx(5)]))).toBe(35);
  });

  test('an actor with no armor info has no DB even with the bonus', () => {
    expect(getAreaDefenseDb({ system: {}, effects: [fx(5)] })).toBe(0);
  });
});
