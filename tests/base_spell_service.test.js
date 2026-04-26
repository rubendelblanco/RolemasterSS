/**
 * Tests for BaseSpellService pure functions.
 */
import BaseSpellService from '../module/spells/services/base_spell_service.js';

describe('BaseSpellService.normalizeRealm', () => {
  test('arcane maps to essence', () => {
    expect(BaseSpellService.normalizeRealm("arcane")).toBe("essence");
    expect(BaseSpellService.normalizeRealm("Arcane")).toBe("essence");
    expect(BaseSpellService.normalizeRealm(" ARCANE ")).toBe("essence");
  });

  test('standard realms pass through lowercased', () => {
    expect(BaseSpellService.normalizeRealm("essence")).toBe("essence");
    expect(BaseSpellService.normalizeRealm("Channeling")).toBe("channeling");
    expect(BaseSpellService.normalizeRealm("MENTALISM")).toBe("mentalism");
  });

  test('null/empty defaults to essence', () => {
    expect(BaseSpellService.normalizeRealm(null)).toBe("essence");
    expect(BaseSpellService.normalizeRealm("")).toBe("essence");
    expect(BaseSpellService.normalizeRealm(undefined)).toBe("essence");
  });
});

describe('BaseSpellService.formatSubindexName', () => {
  test('camelCase to spaced title case', () => {
    expect(BaseSpellService.formatSubindexName("metalArmor")).toBe("Metal Armor");
    expect(BaseSpellService.formatSubindexName("leatherArmor")).toBe("Leather Armor");
  });

  test('single word gets capitalized', () => {
    expect(BaseSpellService.formatSubindexName("fire")).toBe("Fire");
  });

  test('already capitalized stays correct', () => {
    expect(BaseSpellService.formatSubindexName("Fire")).toBe("Fire");
  });

  test('multi-word camelCase', () => {
    expect(BaseSpellService.formatSubindexName("heavyPlateArmor")).toBe("Heavy Plate Armor");
  });
});

describe('BaseSpellService.compareSpellResults', () => {
  test('"F" always wins as worst result', () => {
    expect(BaseSpellService.compareSpellResults("F", 50)).toBe("F");
    expect(BaseSpellService.compareSpellResults(50, "F")).toBe("F");
    expect(BaseSpellService.compareSpellResults("F", "F")).toBe("F");
  });

  test('returns lower numeric value (worse for caster)', () => {
    expect(BaseSpellService.compareSpellResults(30, 50)).toBe(30);
    expect(BaseSpellService.compareSpellResults(80, 40)).toBe(40);
  });

  test('equal values return that value', () => {
    expect(BaseSpellService.compareSpellResults(50, 50)).toBe(50);
  });

  test('handles string numbers', () => {
    expect(BaseSpellService.compareSpellResults("30", "50")).toBe(30);
  });
});

describe('BaseSpellService.isUnmodifiedRoll', () => {
  test('1-2 are unmodified', () => {
    expect(BaseSpellService.isUnmodifiedRoll(1)).toBe(true);
    expect(BaseSpellService.isUnmodifiedRoll(2)).toBe(true);
  });

  test('96-100 are unmodified', () => {
    expect(BaseSpellService.isUnmodifiedRoll(96)).toBe(true);
    expect(BaseSpellService.isUnmodifiedRoll(100)).toBe(true);
  });

  test('3-95 are modified (tramos por defecto 01-02 y 96-100)', () => {
    expect(BaseSpellService.isUnmodifiedRoll(3)).toBe(false);
    expect(BaseSpellService.isUnmodifiedRoll(50)).toBe(false);
    expect(BaseSpellService.isUnmodifiedRoll(95)).toBe(false);
  });

  const FIREBALL_STYLE_UM = ['01-04', '96-97', '98-99', '100-100'];
  test('con tramos 01-04, natural 3 count como UM en ese esquema', () => {
    expect(BaseSpellService.isUnmodifiedRoll(3, FIREBALL_STYLE_UM)).toBe(true);
  });
});

describe('BaseSpellService.normalizeSpellRollResult', () => {
  test('unmodified rolls return natural value (ignores modifier)', () => {
    expect(BaseSpellService.normalizeSpellRollResult(1, +50)).toBe(1);
    expect(BaseSpellService.normalizeSpellRollResult(2, -30)).toBe(2);
    expect(BaseSpellService.normalizeSpellRollResult(96, -50)).toBe(96);
    expect(BaseSpellService.normalizeSpellRollResult(100, -100)).toBe(100);
  });

  test('modified rolls apply modifier', () => {
    expect(BaseSpellService.normalizeSpellRollResult(50, 10)).toBe(60);
    expect(BaseSpellService.normalizeSpellRollResult(50, -10)).toBe(40);
  });

  test('rama modificada: complemento de tramos `um` (por defecto 3-95, no entrar a UM vía mod.)', () => {
    expect(BaseSpellService.normalizeSpellRollResult(10, -50)).toBe(3);
    expect(BaseSpellService.normalizeSpellRollResult(90, +50)).toBe(95);
  });

  const FIREBALL_STYLE_UM = ['01-04', '96-97', '98-99', '100-100'];
  test('con `um` estilo fire_ball, (10) + (-10) no pisa 01-04: recorte a 5..95', () => {
    expect(BaseSpellService.normalizeSpellRollResult(10, -10, FIREBALL_STYLE_UM)).toBe(5);
  });

  test('zero modifier returns natural roll (within 3-95)', () => {
    expect(BaseSpellService.normalizeSpellRollResult(50, 0)).toBe(50);
  });

  test('boundary: roll 3 with negative modifier clamps to 3', () => {
    expect(BaseSpellService.normalizeSpellRollResult(3, -1)).toBe(3);
  });

  test('boundary: roll 95 with positive modifier clamps to 95', () => {
    expect(BaseSpellService.normalizeSpellRollResult(95, +1)).toBe(95);
  });
});

describe('BaseSpellService.findValueInSubindex', () => {
  const table = {
    "100": "F",
    "98-99": 20,
    "96-97": 15,
    "01-02": "F",
    "03-20": 0,
    "21-50": 5,
    "51-80": 10,
    "81-95": 15
  };

  test('exact match (100)', () => {
    expect(BaseSpellService.findValueInSubindex(table, 100)).toBe("F");
  });

  test('range match', () => {
    expect(BaseSpellService.findValueInSubindex(table, 98)).toBe(20);
    expect(BaseSpellService.findValueInSubindex(table, 99)).toBe(20);
    expect(BaseSpellService.findValueInSubindex(table, 50)).toBe(5);
    expect(BaseSpellService.findValueInSubindex(table, 51)).toBe(10);
  });

  test('low values with leading zeros (01-02)', () => {
    expect(BaseSpellService.findValueInSubindex(table, 1)).toBe("F");
    expect(BaseSpellService.findValueInSubindex(table, 2)).toBe("F");
  });

  test('boundary values', () => {
    expect(BaseSpellService.findValueInSubindex(table, 3)).toBe(0);
    expect(BaseSpellService.findValueInSubindex(table, 20)).toBe(0);
    expect(BaseSpellService.findValueInSubindex(table, 21)).toBe(5);
    expect(BaseSpellService.findValueInSubindex(table, 95)).toBe(15);
  });

  test('returns null for no match', () => {
    const smallTable = { "50-60": 10 };
    expect(BaseSpellService.findValueInSubindex(smallTable, 30)).toBe(null);
  });
});
