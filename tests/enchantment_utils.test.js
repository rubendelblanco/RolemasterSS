/**
 * Tests for enchantment_utils pure functions.
 */
import {
  normalizeEnchantments,
  getPowerModifierMode,
  buildEnchantmentList,
  getChargePool,
  advanceArtifactRecharge
} from '../module/sheets/items/enchantment_utils.js';

// buildEnchantmentList needs CONFIG.rmss and game.i18n
global.CONFIG = {
  rmss: {
    spell_list_type: { base: "Base", open: "Open", closed: "Closed" },
    spell_realm: { essence: "Essence", channeling: "Channeling", mentalism: "Mentalism" }
  }
};

describe('normalizeEnchantments', () => {
  test('returns empty array for null/undefined', () => {
    expect(normalizeEnchantments(null)).toEqual([]);
    expect(normalizeEnchantments(undefined)).toEqual([]);
  });

  test('returns array as-is', () => {
    const arr = [{ spell: "Fireball" }, { spell: "Shield" }];
    expect(normalizeEnchantments(arr)).toBe(arr);
  });

  test('converts object with numeric keys to sorted array', () => {
    const obj = { "2": { spell: "C" }, "0": { spell: "A" }, "1": { spell: "B" } };
    expect(normalizeEnchantments(obj)).toEqual([
      { spell: "A" }, { spell: "B" }, { spell: "C" }
    ]);
  });

  test('ignores non-numeric keys in object', () => {
    const obj = { "0": { spell: "A" }, "foo": { spell: "X" }, "1": { spell: "B" } };
    expect(normalizeEnchantments(obj)).toEqual([
      { spell: "A" }, { spell: "B" }
    ]);
  });

  test('returns empty array for empty object', () => {
    expect(normalizeEnchantments({})).toEqual([]);
  });
});

describe('getPowerModifierMode', () => {
  test('returns "" when no multiplier or adder', () => {
    expect(getPowerModifierMode({})).toBe("");
    expect(getPowerModifierMode({ pp_multiplier: 1, spell_adder: 0 })).toBe("");
    expect(getPowerModifierMode(null)).toBe("");
  });

  test('returns "multiplier" when pp_multiplier >= 2', () => {
    expect(getPowerModifierMode({ pp_multiplier: 2 })).toBe("multiplier");
    expect(getPowerModifierMode({ pp_multiplier: 5 })).toBe("multiplier");
  });

  test('returns "spell_adder" when spell_adder > 0 and no multiplier', () => {
    expect(getPowerModifierMode({ spell_adder: 3 })).toBe("spell_adder");
    expect(getPowerModifierMode({ pp_multiplier: 1, spell_adder: 10 })).toBe("spell_adder");
  });

  test('multiplier takes priority over spell_adder', () => {
    expect(getPowerModifierMode({ pp_multiplier: 3, spell_adder: 5 })).toBe("multiplier");
  });
});

describe('buildEnchantmentList', () => {
  test('returns empty array for null/undefined', () => {
    expect(buildEnchantmentList(null)).toEqual([]);
    expect(buildEnchantmentList(undefined)).toEqual([]);
  });

  test('maps basic enchantment fields', () => {
    const result = buildEnchantmentList([{ spell: "Fireball", level: "5", realm: "essence" }]);
    expect(result).toHaveLength(1);
    expect(result[0].spell).toBe("Fireball");
    expect(result[0].level).toBe("5");
    expect(result[0].realmLabel).toBe("Essence");
  });

  test('defaults missing fields', () => {
    const result = buildEnchantmentList([{}]);
    expect(result[0].spell).toBe("");
    expect(result[0].level).toBe("");
    expect(result[0].realmLabel).toBe("—");
    expect(result[0].listTypeLabel).toBe("—");
    expect(result[0].spellListName).toBe("—");
    expect(result[0].usage).toBe("passive");
    expect(result[0].canUse).toBe(false);
  });

  test('base list type with profession shows "(profession)"', () => {
    const result = buildEnchantmentList([{ listType: "base", profession: "Magician" }]);
    expect(result[0].listTypeLabel).toBe("Base (Magician)");
  });

  test('base list type without profession shows just label', () => {
    const result = buildEnchantmentList([{ listType: "base" }]);
    expect(result[0].listTypeLabel).toBe("Base");
  });

  test('own_base and other_base are treated as base variants', () => {
    const r1 = buildEnchantmentList([{ listType: "own_base", profession: "Ranger" }]);
    expect(r1[0].listTypeLabel).toBe("Base (Ranger)");

    const r2 = buildEnchantmentList([{ listType: "other_base", profession: "Cleric" }]);
    expect(r2[0].listTypeLabel).toBe("Base (Cleric)");
  });

  test('non-base list type uses direct label', () => {
    const result = buildEnchantmentList([{ listType: "open" }]);
    expect(result[0].listTypeLabel).toBe("Open");
  });

  test('canUse logic for daily usage', () => {
    const withUses = buildEnchantmentList([{ usage: "daily", usesPerDay: 3, usesRemaining: 2 }]);
    expect(withUses[0].canUse).toBe(true);

    const noUses = buildEnchantmentList([{ usage: "daily", usesPerDay: 3, usesRemaining: 0 }]);
    expect(noUses[0].canUse).toBe(false);
  });

  test('canUse logic for charged usage', () => {
    const charged = buildEnchantmentList([{ usage: "charged", chargesMax: 10, charges: 5 }]);
    expect(charged[0].canUse).toBe(true);

    const empty = buildEnchantmentList([{ usage: "charged", chargesMax: 10, charges: 0 }]);
    expect(empty[0].canUse).toBe(false);
  });

  test('canUse is always true for single usage', () => {
    const single = buildEnchantmentList([{ usage: "single" }]);
    expect(single[0].canUse).toBe(true);
  });

  test('canUse is false for passive', () => {
    const passive = buildEnchantmentList([{ usage: "passive" }]);
    expect(passive[0].canUse).toBe(false);
  });

  test('usageLabel for daily shows remaining/total', () => {
    const result = buildEnchantmentList([{ usage: "daily", usesPerDay: 3, usesRemaining: 1 }]);
    expect(result[0].usageLabel).toBe("1/3");
  });

  test('usageLabel for charged shows charges/max', () => {
    const result = buildEnchantmentList([{ usage: "charged", chargesMax: 10, charges: 7 }]);
    expect(result[0].usageLabel).toBe("7/10");
  });

  test('usageLabel for single shows localized label', () => {
    const result = buildEnchantmentList([{ usage: "single" }]);
    expect(result[0].usageLabel).toBe("rmss.item.enchantment_usage_single");
  });

  test('spellLinkUuid prefers spellUuid over spellListUuid', () => {
    const both = buildEnchantmentList([{ spellUuid: "spell-1", spellListUuid: "list-1" }]);
    expect(both[0].spellLinkUuid).toBe("spell-1");

    const onlyList = buildEnchantmentList([{ spellListUuid: "list-1" }]);
    expect(onlyList[0].spellLinkUuid).toBe("list-1");
  });

  describe('pooled usage (artifact shared charge pool)', () => {
    test('canUse is true when the pool has enough for this enchantment\'s cost', () => {
      const result = buildEnchantmentList([{ usage: "pooled", poolCost: 5 }], { current: 10, max: 40 });
      expect(result[0].canUse).toBe(true);
    });

    test('canUse is false when the pool does not have enough for the cost', () => {
      const result = buildEnchantmentList([{ usage: "pooled", poolCost: 5 }], { current: 3, max: 40 });
      expect(result[0].canUse).toBe(false);
    });

    test('canUse is true at the exact boundary (pool current === cost)', () => {
      const result = buildEnchantmentList([{ usage: "pooled", poolCost: 5 }], { current: 5, max: 40 });
      expect(result[0].canUse).toBe(true);
    });

    test('defaults to a chargePool of 0/0 (nothing usable) when not provided', () => {
      const result = buildEnchantmentList([{ usage: "pooled", poolCost: 1 }]);
      expect(result[0].canUse).toBe(false);
    });

    test('poolCost defaults to 1 and is floored at 1', () => {
      expect(buildEnchantmentList([{ usage: "pooled" }])[0].poolCost).toBe(1);
      expect(buildEnchantmentList([{ usage: "pooled", poolCost: 0 }])[0].poolCost).toBe(1);
      expect(buildEnchantmentList([{ usage: "pooled", poolCost: -3 }])[0].poolCost).toBe(1);
    });

    test('usageLabel shows the cost in points', () => {
      const result = buildEnchantmentList([{ usage: "pooled", poolCost: 5 }], { current: 10, max: 40 });
      expect(result[0].usageLabel).toBe("5 rmss.item.enchantments_pool_cost_unit");
    });
  });
});

describe('getChargePool', () => {
  test('reads current/max from system.magic.chargePool', () => {
    expect(getChargePool({ magic: { chargePool: { current: 15, max: 40 } } })).toEqual({ current: 15, max: 40 });
  });

  test('defaults to 0/0 when missing', () => {
    expect(getChargePool({})).toEqual({ current: 0, max: 0 });
    expect(getChargePool(null)).toEqual({ current: 0, max: 0 });
    expect(getChargePool({ magic: {} })).toEqual({ current: 0, max: 0 });
  });

  test('clamps current to max (never above) and to 0 (never negative)', () => {
    expect(getChargePool({ magic: { chargePool: { current: 999, max: 40 } } })).toEqual({ current: 40, max: 40 });
    expect(getChargePool({ magic: { chargePool: { current: -5, max: 40 } } })).toEqual({ current: 0, max: 40 });
  });
});

describe('advanceArtifactRecharge', () => {
  test('returns null when rechargeDays is not set (no periodic recharge configured)', () => {
    expect(advanceArtifactRecharge({ chargePool: { current: 10, max: 40 }, rechargeDays: 0, daysUntilRecharge: 0 })).toBeNull();
    expect(advanceArtifactRecharge({ chargePool: { current: 10, max: 40 } })).toBeNull();
    expect(advanceArtifactRecharge(null)).toBeNull();
  });

  test('just decrements daysUntilRecharge when still above 1, pool untouched', () => {
    const result = advanceArtifactRecharge({ chargePool: { current: 10, max: 40 }, rechargeDays: 7, daysUntilRecharge: 5 });
    expect(result).toEqual({ current: 10, daysUntilRecharge: 4 });
  });

  test('refills the pool to max and resets the counter to rechargeDays when it reaches 0', () => {
    const result = advanceArtifactRecharge({ chargePool: { current: 3, max: 40 }, rechargeDays: 7, daysUntilRecharge: 1 });
    expect(result).toEqual({ current: 40, daysUntilRecharge: 7 });
  });

  test('a stale/already-0 counter refills on the very next rest instead of going negative', () => {
    const result = advanceArtifactRecharge({ chargePool: { current: 0, max: 40 }, rechargeDays: 7, daysUntilRecharge: 0 });
    expect(result).toEqual({ current: 40, daysUntilRecharge: 7 });
  });

  test('a fresh item with rechargeDays set but daysUntilRecharge unset starts a cycle on the first rest', () => {
    const result = advanceArtifactRecharge({ chargePool: { current: 40, max: 40 }, rechargeDays: 7, daysUntilRecharge: 0 });
    expect(result).toEqual({ current: 40, daysUntilRecharge: 7 });
  });

  test('supports any period, not just weekly (e.g. 1 day, 30 days)', () => {
    expect(advanceArtifactRecharge({ chargePool: { current: 2, max: 10 }, rechargeDays: 1, daysUntilRecharge: 1 }))
      .toEqual({ current: 10, daysUntilRecharge: 1 });
    expect(advanceArtifactRecharge({ chargePool: { current: 2, max: 10 }, rechargeDays: 30, daysUntilRecharge: 15 }))
      .toEqual({ current: 2, daysUntilRecharge: 14 });
  });
});
