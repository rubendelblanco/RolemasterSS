/**
 * Tests for RankCalculator pure functions.
 */
import RankCalculator from '../module/core/skills/rmss_rank_calculator.js';

describe('RankCalculator.isPayable', () => {
  test('returns cost when affordable', () => {
    expect(RankCalculator.isPayable(10, 1, "3/5/7")).toBe(3);
    expect(RankCalculator.isPayable(10, 2, "3/5/7")).toBe(5);
    expect(RankCalculator.isPayable(10, 3, "3/5/7")).toBe(7);
  });

  test('returns false when not enough DPs', () => {
    expect(RankCalculator.isPayable(2, 1, "3/5/7")).toBe(false);
    expect(RankCalculator.isPayable(4, 2, "3/5/7")).toBe(false);
  });

  test('returns exact cost when DPs equal cost', () => {
    expect(RankCalculator.isPayable(3, 1, "3/5/7")).toBe(3);
    expect(RankCalculator.isPayable(7, 3, "3/5/7")).toBe(7);
  });

  test('refunds (negative cost) when newRanks exceeds available ranks', () => {
    // 3 available ranks, buying rank 4 → refund = 0 - 3 - 5 - 7 = -15
    expect(RankCalculator.isPayable(0, 4, "3/5/7")).toBe(-15);
  });

  test('refund works regardless of DPs', () => {
    expect(RankCalculator.isPayable(100, 3, "2/4")).toBe(-6);
  });

  test('single rank cost string', () => {
    expect(RankCalculator.isPayable(5, 1, "5")).toBe(5);
    expect(RankCalculator.isPayable(5, 2, "5")).toBe(-5); // overflow → refund
  });
});

describe('RankCalculator.increaseRanks', () => {
  test('default linear increase', () => {
    expect(RankCalculator.increaseRanks(5, 1, "Normal")).toBe(6);
    expect(RankCalculator.increaseRanks(0, 3, "Normal")).toBe(3);
  });

  test('Occupational gives 3x delta', () => {
    expect(RankCalculator.increaseRanks(0, 1, "Occupational")).toBe(3);
    expect(RankCalculator.increaseRanks(5, 2, "Occupational")).toBe(11);
  });

  test('Everyman gives 2x delta', () => {
    expect(RankCalculator.increaseRanks(0, 1, "Everyman")).toBe(2);
    expect(RankCalculator.increaseRanks(10, 3, "Everyman")).toBe(16);
  });

  test('Restricted uses default linear', () => {
    expect(RankCalculator.increaseRanks(4, 1, "Restricted")).toBe(5);
  });

  test('handles string inputs gracefully', () => {
    expect(RankCalculator.increaseRanks("5", "2", "Normal")).toBe(7);
  });

  test('handles null/undefined as 0', () => {
    expect(RankCalculator.increaseRanks(null, 1, "Normal")).toBe(1);
    expect(RankCalculator.increaseRanks(5, undefined, "Normal")).toBe(5);
  });
});

describe('RankCalculator.calculateBonus', () => {
  // Standard progression: "-15*2*1*0.5*0"
  // initialBonus=-15, m1=2, m2=1, m3=0.5, m4=0
  const stdProg = "-15*2*1*0.5*0";

  describe('standard designation', () => {
    test('0 ranks returns initial bonus', () => {
      expect(RankCalculator.calculateBonus(0, stdProg, "Normal")).toBe(-15);
    });

    test('ranks 1-10 use m1', () => {
      expect(RankCalculator.calculateBonus(1, stdProg, "Normal")).toBe(2);
      expect(RankCalculator.calculateBonus(5, stdProg, "Normal")).toBe(10);
      expect(RankCalculator.calculateBonus(10, stdProg, "Normal")).toBe(20);
    });

    test('ranks 11-20 use m1 for first 10 + m2 for rest', () => {
      // 10*2 + 1*1 = 21
      expect(RankCalculator.calculateBonus(11, stdProg, "Normal")).toBe(21);
      // 10*2 + 10*1 = 30
      expect(RankCalculator.calculateBonus(20, stdProg, "Normal")).toBe(30);
    });

    test('ranks 21-30 add m3 tier', () => {
      // 10*2 + 10*1 + 1*0.5 = 30.5
      expect(RankCalculator.calculateBonus(21, stdProg, "Normal")).toBe(30.5);
      // 10*2 + 10*1 + 10*0.5 = 35
      expect(RankCalculator.calculateBonus(30, stdProg, "Normal")).toBe(35);
    });

    test('ranks 31+ add m4 tier (0 in this progression = capped)', () => {
      // 10*2 + 10*1 + 10*0.5 + 5*0 = 35
      expect(RankCalculator.calculateBonus(35, stdProg, "Normal")).toBe(35);
      expect(RankCalculator.calculateBonus(50, stdProg, "Normal")).toBe(35);
    });
  });

  describe('Restricted designation (halved ranks)', () => {
    test('0 ranks returns initial bonus', () => {
      expect(RankCalculator.calculateBonus(0, stdProg, "Restricted")).toBe(-15);
    });

    test('uses floor(totalRanks/2) as effective ranks', () => {
      // 1 rank → restricted=0 → initialBonus
      expect(RankCalculator.calculateBonus(1, stdProg, "Restricted")).toBe(-15);
      // 2 ranks → restricted=1 → m1*1 = 2
      expect(RankCalculator.calculateBonus(2, stdProg, "Restricted")).toBe(2);
      // 10 ranks → restricted=5 → m1*5 = 10
      expect(RankCalculator.calculateBonus(10, stdProg, "Restricted")).toBe(10);
    });

    test('restricted tiers use 5-rank brackets instead of 10', () => {
      // 12 ranks → restricted=6 → 5*m1 + 1*m2 = 10+1 = 11
      expect(RankCalculator.calculateBonus(12, stdProg, "Restricted")).toBe(11);
      // 20 ranks → restricted=10 → 5*2 + 5*1 = 15
      expect(RankCalculator.calculateBonus(20, stdProg, "Restricted")).toBe(15);
      // 30 ranks → restricted=15 → 5*2 + 5*1 + 5*0.5 = 17.5
      expect(RankCalculator.calculateBonus(30, stdProg, "Restricted")).toBe(17.5);
    });
  });

  describe('different progression strings', () => {
    test('aggressive progression "0*3*2*1*0.5"', () => {
      const prog = "0*3*2*1*0.5";
      expect(RankCalculator.calculateBonus(0, prog, "Normal")).toBe(0);
      expect(RankCalculator.calculateBonus(10, prog, "Normal")).toBe(30);
      expect(RankCalculator.calculateBonus(20, prog, "Normal")).toBe(50);
    });

    test('flat progression "0*1*1*1*1"', () => {
      const prog = "0*1*1*1*1";
      expect(RankCalculator.calculateBonus(10, prog, "Normal")).toBe(10);
      expect(RankCalculator.calculateBonus(40, prog, "Normal")).toBe(40);
    });
  });
});

describe('RankCalculator.getCategoryProgression', () => {
  const config = {
    rmss: {
      skill_progression: {
        standard: { progression: "-15*2*1*0.5*0" },
        limited: { progression: "-15*1*0.5*0*0" }
      }
    }
  };

  test('returns progression from config lookup', () => {
    const cat = { system: { skill_progression: "standard" } };
    expect(RankCalculator.getCategoryProgression(cat, config)).toBe("-15*2*1*0.5*0");
  });

  test('returns special progression directly when it has asterisks', () => {
    const cat = { system: { skill_progression: "-20*3*2*1*0" } };
    expect(RankCalculator.getCategoryProgression(cat, config)).toBe("-20*3*2*1*0");
  });
});
