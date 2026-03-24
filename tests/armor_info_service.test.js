/**
 * Tests for ArmorInfoService pure/semi-pure functions.
 */
import ArmorInfoService from '../module/actors/services/armor_info_service.js';

function makeArmor({ slot = "body", equipped = true, at = 1, bonus = 0, isShield = false } = {}) {
  return {
    type: "armor",
    system: { equipped, armorSlot: slot, at, bonus, isShield }
  };
}

function makeActor(items = []) {
  return { items };
}

describe('ArmorInfoService.getEquippedArmorBySlot', () => {
  test('returns nulls when actor has no items', () => {
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([]));
    expect(result).toEqual({ body: null, helmet: null, shield: null });
  });

  test('returns nulls for null/undefined actor', () => {
    expect(ArmorInfoService.getEquippedArmorBySlot(null)).toEqual({ body: null, helmet: null, shield: null });
    expect(ArmorInfoService.getEquippedArmorBySlot(undefined)).toEqual({ body: null, helmet: null, shield: null });
  });

  test('picks equipped body armor', () => {
    const body = makeArmor({ slot: "body", at: 5, bonus: 10 });
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([body]));
    expect(result.body).toBe(body);
    expect(result.helmet).toBeNull();
    expect(result.shield).toBeNull();
  });

  test('picks equipped items in each slot', () => {
    const body = makeArmor({ slot: "body", at: 12 });
    const helmet = makeArmor({ slot: "helmet", bonus: 5 });
    const shield = makeArmor({ slot: "shield", bonus: 15 });
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([body, helmet, shield]));
    expect(result.body).toBe(body);
    expect(result.helmet).toBe(helmet);
    expect(result.shield).toBe(shield);
  });

  test('ignores unequipped armor', () => {
    const unequipped = makeArmor({ slot: "body", equipped: false });
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([unequipped]));
    expect(result.body).toBeNull();
  });

  test('ignores non-armor items', () => {
    const weapon = { type: "weapon", system: { equipped: true } };
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([weapon]));
    expect(result.body).toBeNull();
  });

  test('first equipped per slot wins', () => {
    const body1 = makeArmor({ slot: "body", at: 5 });
    const body2 = makeArmor({ slot: "body", at: 10 });
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([body1, body2]));
    expect(result.body).toBe(body1);
  });

  test('falls back to isShield flag when armorSlot is missing', () => {
    const shield = { type: "armor", system: { equipped: true, armorSlot: "", isShield: true, bonus: 5 } };
    const result = ArmorInfoService.getEquippedArmorBySlot(makeActor([shield]));
    expect(result.shield).toBe(shield);
  });
});

describe('ArmorInfoService.computeFromEquipment', () => {
  test('no armor: AT=1, shield=0, magic=0', () => {
    const result = ArmorInfoService.computeFromEquipment(makeActor([]));
    expect(result).toEqual({ armor_type: 1, shield_bonus: 0, magic: 0 });
  });

  test('body armor sets AT', () => {
    const body = makeArmor({ slot: "body", at: 12, bonus: 0 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body]));
    expect(result.armor_type).toBe(12);
  });

  test('shield sets shield_bonus', () => {
    const shield = makeArmor({ slot: "shield", bonus: 20 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([shield]));
    expect(result.shield_bonus).toBe(20);
    expect(result.armor_type).toBe(1); // no body armor
  });

  test('body + helmet bonuses combine into magic', () => {
    const body = makeArmor({ slot: "body", at: 8, bonus: 10 });
    const helmet = makeArmor({ slot: "helmet", bonus: 5 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body, helmet]));
    expect(result.magic).toBe(15);
  });

  test('shield bonus does NOT count as magic', () => {
    const shield = makeArmor({ slot: "shield", bonus: 25 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([shield]));
    expect(result.magic).toBe(0);
    expect(result.shield_bonus).toBe(25);
  });

  test('full setup: body + helmet + shield', () => {
    const body = makeArmor({ slot: "body", at: 16, bonus: 10 });
    const helmet = makeArmor({ slot: "helmet", bonus: 5 });
    const shield = makeArmor({ slot: "shield", bonus: 20 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body, helmet, shield]));
    expect(result.armor_type).toBe(16);
    expect(result.shield_bonus).toBe(20);
    expect(result.magic).toBe(15); // body 10 + helmet 5
  });
});
