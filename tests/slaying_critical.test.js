/**
 * Tests for the pure helpers of Slaying criticals.
 */
import {
  needsSlayingExtraCritical,
  appendFollowUp,
  SLAYING_EXTRA_TABLE,
  SLAYING_EXTRA_COLUMN
} from '../module/combat/services/slaying_critical.js';

describe('needsSlayingExtraCritical', () => {
  test('a slaying weapon against a creature that is not large needs the second critical', () => {
    expect(needsSlayingExtraCritical(true, "-")).toBe(true);
    expect(needsSlayingExtraCritical(true, undefined)).toBe(true);
    expect(needsSlayingExtraCritical(true, null)).toBe(true);
    expect(needsSlayingExtraCritical(true, "")).toBe(true);
  });

  test('against a Large or Super Large creature the single critical is already the slaying one', () => {
    expect(needsSlayingExtraCritical(true, "la")).toBe(false);
    expect(needsSlayingExtraCritical(true, "sl")).toBe(false);
  });

  test('a weapon that does not slay the target never adds one', () => {
    expect(needsSlayingExtraCritical(false, "-")).toBe(false);
    expect(needsSlayingExtraCritical(false, "la")).toBe(false);
    expect(needsSlayingExtraCritical(undefined, "-")).toBe(false);
  });
});

describe('the extra critical is on the Slaying column of the Large Creature table', () => {
  test('constants', () => {
    expect(SLAYING_EXTRA_TABLE).toBe("large_melee");
    expect(SLAYING_EXTRA_COLUMN).toBe("E");
  });
});

describe('appendFollowUp', () => {
  test('the extra critical becomes the follow-up of a result that has none', () => {
    const primary = { text: "primary" };
    const extra = { text: "slaying" };
    expect(appendFollowUp(primary, extra)).toBe(primary);
    expect(primary._rmssEffectWeaponFollowUp).toBe(extra);
  });

  test('it goes at the end of the chain when a follow-up (Effect Weapon) is already there', () => {
    const third = { text: "third" };
    const second = { text: "second", _rmssEffectWeaponFollowUp: third };
    const primary = { text: "primary", _rmssEffectWeaponFollowUp: second };
    const extra = { text: "slaying" };
    appendFollowUp(primary, extra);
    expect(primary._rmssEffectWeaponFollowUp).toBe(second);
    expect(second._rmssEffectWeaponFollowUp).toBe(third);
    expect(third._rmssEffectWeaponFollowUp).toBe(extra);
  });
});
