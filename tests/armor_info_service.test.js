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

function makeNpcActor(armorInfo, items, sourceArmorInfo = armorInfo) {
  const updateCalls = [];
  const actor = {
    type: "npc",
    system: { armor_info: armorInfo },
    _source: { system: { armor_info: sourceArmorInfo } },
    items,
    async update(data) {
      updateCalls.push(data);
      // Merge into system so a follow-up sync call in the same test sees the new value,
      // mirroring how a real Foundry actor.update() applies immediately in-memory.
      for (const [path, value] of Object.entries(data)) {
        const key = path.replace("system.armor_info.", "");
        armorInfo[key] = value;
      }
    },
    getLastUpdatePayload() {
      return updateCalls[updateCalls.length - 1];
    },
    getUpdateCalls() {
      return updateCalls;
    }
  };
  return actor;
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

  // Regression: npc with a natural DB (e.g. 5) fell into the character-style formula, which
  // npc never populates quickness_bonus/adrenal_defense for, so equipping armor replaced the
  // natural DB with just the armor bonus instead of adding to it.
  test('npc with natural_db + equipped shield: total_db adds shield to the natural baseline', async () => {
    const shield = makeArmor({ slot: "shield", db: 5, bonus: 0 });
    const actor = makeNpcActor(
      { total_db: 5, magic: 0, shield_bonus: 0, armor_type: 1, natural_db: 5 },
      [shield]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.shield_bonus"]).toBe(5);
    expect(payload["system.armor_info.total_db"]).toBe(10);
  });

  test('npc + shield only: does not reset armor_type (no body piece equipped)', async () => {
    const shield = makeArmor({ slot: "shield", db: 5, bonus: 0 });
    const actor = makeNpcActor(
      { total_db: 5, magic: 0, shield_bonus: 0, armor_type: 8, natural_db: 5 },
      [shield]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload).not.toHaveProperty("system.armor_info.armor_type");
  });

  test('npc + body armor: sets armor_type and adds magic/AT bonus on top of natural_db', async () => {
    const body = makeArmor({ slot: "body", at: 14, bonus: 5 });
    const actor = makeNpcActor(
      { total_db: 5, magic: 0, shield_bonus: 0, armor_type: 1, natural_db: 5 },
      [body]
    );
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.armor_type"]).toBe(14);
    expect(payload["system.armor_info.magic"]).toBe(5);
    expect(payload["system.armor_info.total_db"]).toBe(10);
  });
});

describe('ArmorInfoService.syncNaturalDbFromTotal', () => {
  test('GM typing a new total_db with nothing equipped sets natural_db to match', async () => {
    const actor = makeNpcActor({ total_db: 5, magic: 0, shield_bonus: 0, natural_db: 0 }, []);
    await ArmorInfoService.syncNaturalDbFromTotal(actor);
    expect(actor.getLastUpdatePayload()).toEqual({ "system.armor_info.natural_db": 5 });
  });

  test('recomputing right after an armor-driven total_db write recovers the same natural_db (idempotent)', async () => {
    // natural_db(5) + magic(5) + shield(0) = 10, as updateActorArmorInfo would have just written.
    const actor = makeNpcActor({ total_db: 10, magic: 5, shield_bonus: 0, natural_db: 5 }, []);
    await ArmorInfoService.syncNaturalDbFromTotal(actor);
    expect(actor.getUpdateCalls().length).toBe(0); // no-op: already in sync
  });

  test('does nothing for non-npc actors', async () => {
    const actor = makeCreatureActor({ total_db: 5, magic: 0, shield_bonus: 0 }, []);
    await ArmorInfoService.syncNaturalDbFromTotal(actor);
    expect(actor.getLastUpdatePayload()).toBeUndefined();
  });
});

describe('ArmorInfoService.migrateNaturalDbIfMissing', () => {
  test('back-fills natural_db from total_db/magic/shield_bonus when the source lacks the key', async () => {
    const armorInfo = { total_db: 12, magic: 2, shield_bonus: 0 }; // pre-migration: no natural_db at all
    const actor = makeNpcActor(armorInfo, [], { total_db: 12, magic: 2, shield_bonus: 0 });
    await ArmorInfoService.migrateNaturalDbIfMissing(actor);
    expect(actor.getLastUpdatePayload()).toEqual({ "system.armor_info.natural_db": 10 });
  });

  test('does nothing when natural_db is already present in the source (even if 0)', async () => {
    const armorInfo = { total_db: 12, magic: 2, shield_bonus: 0, natural_db: 0 };
    const actor = makeNpcActor(armorInfo, [], { total_db: 12, magic: 2, shield_bonus: 0, natural_db: 0 });
    await ArmorInfoService.migrateNaturalDbIfMissing(actor);
    expect(actor.getLastUpdatePayload()).toBeUndefined();
  });
});

describe('ArmorInfoService.updateActorArmorInfo: a character\'s armor penalties', () => {
  function makeCharacterActor(armorInfo, items) {
    const updateCalls = [];
    return {
      type: "character",
      system: { armor_info: armorInfo },
      items,
      async update(data) { updateCalls.push(data); },
      getLastUpdatePayload() { return updateCalls[updateCalls.length - 1]; }
    };
  }

  test('body armor on: Quickness and missile penalties come from its penalty AT, and the Quickness one lowers total_db', async () => {
    const body = makeArmor({ slot: "body", at: 18 });
    const actor = makeCharacterActor({ quickness_bonus: 30, adrenal_defense: 0, quickness_penalty: 0, missile_penalty: 0 }, [body]);
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.armor_type"]).toBe(18);
    expect(payload["system.armor_info.quickness_penalty"]).toBe(20);
    expect(payload["system.armor_info.missile_penalty"]).toBe(10);
    expect(payload["system.armor_info.total_db"]).toBe(10);
  });

  test('the armor\'s own penalty AT and values win: protects as 18, penalizes as 9 with its own missile penalty', async () => {
    const body = makeArmor({ slot: "body", at: 18 });
    body.system.at_penalty = 9;
    body.system.missile_penalty = 3;
    const actor = makeCharacterActor({ quickness_bonus: 30 }, [body]);
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload["system.armor_info.armor_type"]).toBe(18);
    expect(payload["system.armor_info.quickness_penalty"]).toBe(0);
    expect(payload["system.armor_info.missile_penalty"]).toBe(3);
    expect(payload["system.armor_info.total_db"]).toBe(30);
  });

  test('no body armor: what is typed on the sheet stays untouched', async () => {
    const actor = makeCharacterActor({ quickness_bonus: 30, quickness_penalty: 5, missile_penalty: 7 }, []);
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.getLastUpdatePayload();
    expect(payload).not.toHaveProperty("system.armor_info.quickness_penalty");
    expect(payload).not.toHaveProperty("system.armor_info.missile_penalty");
    expect(payload["system.armor_info.total_db"]).toBe(25);
  });
});

describe('ArmorInfoService.computeCharacterTotalDb', () => {
  test('without a penalty it is the plain sum', () => {
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: 30, adrenalDefense: 5, magic: 10, shieldBonus: 20 })).toBe(65);
  });

  test('the Quickness penalty takes off the Quickness bonus', () => {
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: 30, quicknessPenalty: 20 })).toBe(10);
  });

  test('the Quickness bonus never goes below 0: a bigger penalty does not eat into the rest of the DB', () => {
    const total = ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: 9, quicknessPenalty: 40, adrenalDefense: 5, magic: 10, shieldBonus: 20 });
    expect(total).toBe(35);
  });

  test('a penalty equal to the bonus cancels it exactly', () => {
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: 15, quicknessPenalty: 15, shieldBonus: 20 })).toBe(20);
  });

  test('a negative Quickness bonus is floored too, and the total is never negative', () => {
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: -9, quicknessPenalty: 10 })).toBe(0);
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: 0, adrenalDefense: -5 })).toBe(0);
  });

  test('copes with missing or non-numeric parts', () => {
    expect(ArmorInfoService.computeCharacterTotalDb()).toBe(0);
    expect(ArmorInfoService.computeCharacterTotalDb({ quicknessBonus: "12", quicknessPenalty: "x", shieldBonus: undefined })).toBe(12);
  });
});

describe('a character in heavy armor with a shield keeps the shield and magic bonuses', () => {
  test('updateActorArmorInfo: penalty 40 against Quickness 9 leaves shield and magic whole', async () => {
    const body = makeArmor({ slot: "body", at: 20 });
    const shield = makeArmor({ slot: "shield", db: 25, bonus: 0 });
    const actor = {
      type: "character",
      system: { armor_info: { quickness_bonus: 9, adrenal_defense: 0 } },
      items: [body, shield],
      updates: [],
      async update(d) { this.updates.push(d); }
    };
    await ArmorInfoService.updateActorArmorInfo(actor);
    const payload = actor.updates.at(-1);
    expect(payload["system.armor_info.quickness_penalty"]).toBe(40);
    expect(payload["system.armor_info.total_db"]).toBe(25);
  });
});
