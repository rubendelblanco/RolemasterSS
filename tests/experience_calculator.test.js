/**
 * Tests for ExperiencePointsCalculator pure functions.
 */
import ExperiencePointsCalculator from '../module/sheets/experience/rmss_experience_manager.js';

describe('ExperiencePointsCalculator.calculateKillExpPoints', () => {
  test('opponent level 0 uses special formula', () => {
    // (50 - killerLevel*5) + 5
    expect(ExperiencePointsCalculator.calculateKillExpPoints(0, 1)).toBe(50);
    expect(ExperiencePointsCalculator.calculateKillExpPoints(0, 5)).toBe(30);
    expect(ExperiencePointsCalculator.calculateKillExpPoints(0, 10)).toBe(5);
  });

  test('equal levels gives 200 XP', () => {
    expect(ExperiencePointsCalculator.calculateKillExpPoints(5, 5)).toBe(200);
    expect(ExperiencePointsCalculator.calculateKillExpPoints(10, 10)).toBe(200);
  });

  test('opponent higher level gives bonus (+50 per level diff)', () => {
    expect(ExperiencePointsCalculator.calculateKillExpPoints(10, 5)).toBe(450);
    expect(ExperiencePointsCalculator.calculateKillExpPoints(8, 5)).toBe(350);
  });

  test('opponent 1 level lower gives 150', () => {
    expect(ExperiencePointsCalculator.calculateKillExpPoints(4, 5)).toBe(150);
  });

  test('opponent 2-3 levels lower uses -20 per level', () => {
    // diff=-2: 150 + (-2+1)*20 = 150 - 20 = 130
    expect(ExperiencePointsCalculator.calculateKillExpPoints(3, 5)).toBe(130);
    // diff=-3: 150 + (-3+1)*20 = 150 - 40 = 110
    expect(ExperiencePointsCalculator.calculateKillExpPoints(2, 5)).toBe(110);
  });

  test('opponent 4+ levels lower uses -10 per additional level', () => {
    // diff=-4: 110 + (-4+3)*10 = 110 - 10 = 100
    expect(ExperiencePointsCalculator.calculateKillExpPoints(1, 5)).toBe(100);
    // diff=-6: 110 + (-6+3)*10 = 110 - 30 = 80
    expect(ExperiencePointsCalculator.calculateKillExpPoints(4, 10)).toBe(80);
  });

  test('never returns negative', () => {
    expect(ExperiencePointsCalculator.calculateKillExpPoints(1, 50)).toBeGreaterThanOrEqual(0);
  });
});

describe('ExperiencePointsCalculator.calculateCriticalExpPoints', () => {
  test('A critical at level 10 = 1*5*10 = 50', () => {
    expect(ExperiencePointsCalculator.calculateCriticalExpPoints("A", 10)).toBe(50);
  });

  test('E critical at level 5 = 5*5*5 = 125', () => {
    expect(ExperiencePointsCalculator.calculateCriticalExpPoints("E", 5)).toBe(125);
  });

  test('C critical at level 1 = 3*5*1 = 15', () => {
    expect(ExperiencePointsCalculator.calculateCriticalExpPoints("C", 1)).toBe(15);
  });

  test('case insensitive', () => {
    expect(ExperiencePointsCalculator.calculateCriticalExpPoints("b", 10))
      .toBe(ExperiencePointsCalculator.calculateCriticalExpPoints("B", 10));
  });

  test('returns 0 for invalid critical level', () => {
    expect(ExperiencePointsCalculator.calculateCriticalExpPoints("Z", 10)).toBe(0);
  });
});

describe('ExperiencePointsCalculator.calculateSpellExpPoints', () => {
  test('same caster and spell level = 100 XP', () => {
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(5, 5)).toBe(100);
  });

  test('caster higher than spell → less XP', () => {
    // 100 - 10*(10-5) = 50
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(10, 5)).toBe(50);
  });

  test('spell higher than caster → more XP', () => {
    // 100 - 10*(5-10) = 150
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(5, 10)).toBe(150);
  });

  test('capped at 200', () => {
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(1, 20)).toBe(200);
  });

  test('floor at 0', () => {
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(30, 1)).toBe(0);
  });

  test('returns 0 for NaN inputs', () => {
    expect(ExperiencePointsCalculator.calculateSpellExpPoints("abc", 5)).toBe(0);
    expect(ExperiencePointsCalculator.calculateSpellExpPoints(5, "abc")).toBe(0);
  });
});

describe('ExperiencePointsCalculator.calculateBonusExpPoints', () => {
  test('level 1 uses first table row', () => {
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(1, "a")).toBe(50);
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(2, "e")).toBe(400);
  });

  test('level 3-4 uses second table row', () => {
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(3, "a")).toBe(40);
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(4, "b")).toBe(60);
  });

  test('higher levels decrease by increment per 2-level bracket', () => {
    // Level 5-6 (row 3): table[1].a - (3-2)*inc.a = 40 - 10 = 30
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(5, "a")).toBe(30);
    // Level 7-8 (row 4): 40 - (4-2)*10 = 40 - 20 = 20
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(7, "a")).toBe(20);
  });

  test('never returns negative', () => {
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(100, "a")).toBeGreaterThanOrEqual(0);
  });

  test('invalid code returns 0', () => {
    expect(ExperiencePointsCalculator.calculateBonusExpPoints(1, "z")).toBe(0);
  });
});

describe('ExperiencePointsCalculator.getCharacterLevel', () => {
  test('below 10000 XP is level 1', () => {
    expect(ExperiencePointsCalculator.getCharacterLevel(0)).toBe(1);
    expect(ExperiencePointsCalculator.getCharacterLevel(9999)).toBe(1);
  });

  test('exact level thresholds', () => {
    const result = ExperiencePointsCalculator.getCharacterLevel(10000);
    expect(result.level).toBe(1);

    const r5 = ExperiencePointsCalculator.getCharacterLevel(50000);
    expect(r5.level).toBe(5);

    const r10 = ExperiencePointsCalculator.getCharacterLevel(150000);
    expect(r10.level).toBe(10);

    const r20 = ExperiencePointsCalculator.getCharacterLevel(500000);
    expect(r20).toBe(20);
  });

  test('between levels returns lower level', () => {
    const result = ExperiencePointsCalculator.getCharacterLevel(25000);
    expect(result.level).toBe(2);
  });

  test('above 500000 calculates extra levels (+50000 each)', () => {
    expect(ExperiencePointsCalculator.getCharacterLevel(550000)).toBe(21);
    expect(ExperiencePointsCalculator.getCharacterLevel(600000)).toBe(22);
    expect(ExperiencePointsCalculator.getCharacterLevel(749999)).toBe(24);
  });
});

describe('ExperiencePointsCalculator.getExperienceProgress', () => {
  test('0 XP is 0%', () => {
    expect(ExperiencePointsCalculator.getExperienceProgress(0)).toBe(0);
  });

  test('below level 1 calculates progress towards level 2 threshold', () => {
    // NOTE: when XP < 10000 the loop ends with nextLevelExp=20000 (level 2)
    // so 5000/20000 = 25%. This is a quirk of the iteration order.
    expect(ExperiencePointsCalculator.getExperienceProgress(5000)).toBe(25);
  });

  test('at exact level boundary = 0% towards next', () => {
    expect(ExperiencePointsCalculator.getExperienceProgress(10000)).toBe(0);
  });

  test('returns value between 0 and 100', () => {
    const progress = ExperiencePointsCalculator.getExperienceProgress(35000);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });

  test('above level 20 uses 50000 increments', () => {
    // At 500000 exactly → 0% towards level 21
    expect(ExperiencePointsCalculator.getExperienceProgress(500000)).toBe(0);
    // At 525000 → 50% towards level 21
    expect(ExperiencePointsCalculator.getExperienceProgress(525000)).toBe(50);
  });
});

describe('ExperiencePointsCalculator.data', () => {
  test('maneuver XP table has expected entries', () => {
    expect(ExperiencePointsCalculator.data.maneuverExpPoints.routine).toBe(0);
    expect(ExperiencePointsCalculator.data.maneuverExpPoints.absurd).toBe(500);
    expect(ExperiencePointsCalculator.data.maneuverExpPoints.medium).toBe(50);
  });

  test('critical XP multipliers A-E', () => {
    expect(ExperiencePointsCalculator.data.criticalExpPoints.a).toBe(1);
    expect(ExperiencePointsCalculator.data.criticalExpPoints.e).toBe(5);
  });
});
