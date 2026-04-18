/**
 * Tests for ArmorInfoService pure/semi-pure functions.
 */
import ArmorInfoService from '../module/actors/services/armor_info_service.js';

function makeArmor({ slot = "body", equipped = true, at = 1, db = 0, bonus = 0, isShield = false } = {}) {
  return {
    type: "armor",
    system: { equipped, armorSlot: slot, at, db, bonus, isShield }
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
    const shield = makeArmor({ slot: "shield", db: 15, bonus: 0 });
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
    const shield = { type: "armor", system: { equipped: true, armorSlot: "", isShield: true, db: 5, bonus: 0 } };
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

  test('shield sets shield_bonus from db', () => {
    const shield = makeArmor({ slot: "shield", db: 20, bonus: 0 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([shield]));
    expect(result.shield_bonus).toBe(20);
    expect(result.armor_type).toBe(1);
  });

  test('shield material bonus counts toward magic, not shield_bonus', () => {
    const shield = makeArmor({ slot: "shield", db: 20, bonus: 10 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([shield]));
    expect(result.shield_bonus).toBe(20);
    expect(result.magic).toBe(10);
  });

  test('body + helmet bonuses combine into magic', () => {
    const body = makeArmor({ slot: "body", at: 8, bonus: 10 });
    const helmet = makeArmor({ slot: "helmet", bonus: 5 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body, helmet]));
    expect(result.magic).toBe(15);
  });

  test('helmet with bonus 0 does not add to magic', () => {
    const body = makeArmor({ slot: "body", at: 8, bonus: 10 });
    const helmet = makeArmor({ slot: "helmet", bonus: 0 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body, helmet]));
    expect(result.magic).toBe(10);
  });

  test('full setup: body + helmet + shield with db and material on shield', () => {
    const body = makeArmor({ slot: "body", at: 16, bonus: 10 });
    const helmet = makeArmor({ slot: "helmet", bonus: 5 });
    const shield = makeArmor({ slot: "shield", db: 20, bonus: 7 });
    const result = ArmorInfoService.computeFromEquipment(makeActor([body, helmet, shield]));
    expect(result.armor_type).toBe(16);
    expect(result.shield_bonus).toBe(20);
    expect(result.magic).toBe(22);
  });

  test('uses item source db/bonus (toObject(true)), not prepared system', () => {
    const shield = {
      type: "armor",
      system: { equipped: true, armorSlot: "shield", db: 25, bonus: 12 },
      toObject(source) {
        if (source) return { system: { equipped: true, armorSlot: "shield", db: 10, bonus: 5 } };
        return { system: this.system };
      }
    };
    const result = ArmorInfoService.computeFromEquipment(makeActor([shield]));
    expect(result.shield_bonus).toBe(10);
    expect(result.magic).toBe(5);
  });
});

function makeCreatureActor(armorInfo, items) {
  const updateCalls = [];
  return {
    type: "creature",
    system: { armor_info: armorInfo },
    items,
    async update(data) {
      updateCalls.push(data);
    },
    getLastUpdatePayload() {
      return updateCalls[updateCalls.length - 1];
    }
  };
}

describe('ArmorInfoService.updateActorArmorInfo', () => {
  test('creature + shield only: does not set armor_type; total_db adds shield to intrinsic base', async () => {
    const shield = makeArmor({ slot: "shield", db: 20, bonus: 0 });
    const actor = makeCreatureActor(
      { total_db: 50, magic: 0, shield_bonus: 0, armor_type: 8 },
      [shield]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload).not.toHaveProperty("system.armor_info.armor_type");
    expect(payload["system.armor_info.shield_bonus"]).toBe(20);
    expect(payload["system.armor_info.magic"]).toBe(0);
    expect(payload["system.armor_info.total_db"]).toBe(70);
  });

  test('creature + shield with material bonus: total_db includes intrinsic + magic + shield', async () => {
    const shield = makeArmor({ slot: "shield", db: 20, bonus: 10 });
    const actor = makeCreatureActor(
      { total_db: 50, magic: 0, shield_bonus: 0, armor_type: 1 },
      [shield]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.shield_bonus"]).toBe(20);
    expect(payload["system.armor_info.magic"]).toBe(10);
    expect(payload["system.armor_info.total_db"]).toBe(80);
  });

  test('creature + body armor: sets armor_type from body item', async () => {
    const body = makeArmor({ slot: "body", at: 12, bonus: 0 });
    const actor = makeCreatureActor(
      { total_db: 0, magic: 0, shield_bonus: 0, armor_type: 1 },
      [body]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.armor_type"]).toBe(12);
  });
});
