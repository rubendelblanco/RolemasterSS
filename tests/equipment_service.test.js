/**
 * @jest-environment node
 */
import { jest } from "@jest/globals";
import EquipmentService from "../module/actors/services/equipment_service.js";
import ItemService from "../module/actors/services/item_service.js";
import ArmorInfoService from "../module/actors/services/armor_info_service.js";

describe("EquipmentService", () => {
  const mockWeapon1H = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false } };
  const mockWeapon2H = { type: "weapon", system: { equipped: true, type: "2h", isNaturalWeapon: false } };
  const mockNaturalWeapon = { type: "weapon", system: { equipped: false, hands: 1, isNaturalWeapon: true } };
  const mockCreatureAttack = { type: "creature_attack", system: {} };
  const mockShield = { type: "armor", _id: "s1", system: { equipped: true, armorSlot: "shield", isShield: true } };
  const mockArmor = { type: "armor", _id: "a1", system: { equipped: true, armorSlot: "body", isShield: false } };

  describe("getWeaponHands", () => {
    test("1H weapon returns 1", () => {
      expect(EquipmentService.getWeaponHands(mockWeapon1H)).toBe(1);
    });
    test("2H weapon returns 2", () => {
      expect(EquipmentService.getWeaponHands(mockWeapon2H)).toBe(2);
    });
    test("pole arm 1h (pa1h) returns 1", () => {
      const paWeapon = { type: "weapon", system: { type: "pa1h", isNaturalWeapon: false } };
      expect(EquipmentService.getWeaponHands(paWeapon)).toBe(1);
    });
    test("pole arm 2h (pa2h) returns 2", () => {
      const paWeapon = { type: "weapon", system: { type: "pa2h", isNaturalWeapon: false } };
      expect(EquipmentService.getWeaponHands(paWeapon)).toBe(2);
    });
    test("missile (mis) returns 2", () => {
      const misWeapon = { type: "weapon", system: { type: "mis", isNaturalWeapon: false } };
      expect(EquipmentService.getWeaponHands(misWeapon)).toBe(2);
    });
    test("natural weapon returns 0", () => {
      expect(EquipmentService.getWeaponHands(mockNaturalWeapon)).toBe(0);
    });
    test("creature_attack returns 0", () => {
      expect(EquipmentService.getWeaponHands(mockCreatureAttack)).toBe(0);
    });
  });

  describe("getArmorHands", () => {
    test("equipped shield returns 1", () => {
      expect(EquipmentService.getArmorHands(mockShield)).toBe(1);
    });
    test("non-shield armor returns 0", () => {
      expect(EquipmentService.getArmorHands(mockArmor)).toBe(0);
    });
  });

  describe("isWeaponEquipped", () => {
    test("equipped weapon returns true", () => {
      expect(EquipmentService.isWeaponEquipped(mockWeapon1H)).toBe(true);
    });
    test("natural weapon returns true", () => {
      expect(EquipmentService.isWeaponEquipped(mockNaturalWeapon)).toBe(true);
    });
    test("creature_attack returns true", () => {
      expect(EquipmentService.isWeaponEquipped(mockCreatureAttack)).toBe(true);
    });
    test("unequipped weapon returns false", () => {
      const unequipped = { type: "weapon", system: { equipped: false, isNaturalWeapon: false } };
      expect(EquipmentService.isWeaponEquipped(unequipped)).toBe(false);
    });
  });

  describe("getHandsOccupiedForCasting", () => {
    test("2H weapon (staff) counts as 1 hand when casting", () => {
      const actor = { items: [mockWeapon2H] };
      expect(EquipmentService.getHandsOccupiedForCasting(actor)).toBe(1);
    });
    test("1H weapon counts as 1 hand when casting", () => {
      const actor = { items: [mockWeapon1H] };
      expect(EquipmentService.getHandsOccupiedForCasting(actor)).toBe(1);
    });
    test("2H weapon + shield = 2 hands when casting", () => {
      const actor = { items: [mockWeapon2H, mockShield] };
      expect(EquipmentService.getHandsOccupiedForCasting(actor)).toBe(2);
    });
  });

  describe("getHandsOccupied", () => {
    test("actor with 1H weapon has 1 hand occupied", () => {
      const actor = { items: [mockWeapon1H] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(1);
    });
    test("actor with 2H weapon has 2 hands occupied", () => {
      const actor = { items: [mockWeapon2H] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(2);
    });
    test("actor with shield has 1 hand occupied", () => {
      const actor = { items: [mockShield] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(1);
    });
    test("actor with 1H weapon and shield has 2 hands occupied", () => {
      const actor = { items: [mockWeapon1H, mockShield] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(2);
    });
    test("natural weapon does not occupy hands", () => {
      const actor = { items: [mockNaturalWeapon] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(0);
    });
    test("unequipped weapon does not count", () => {
      const unequipped = { type: "weapon", system: { equipped: false, hands: 1, isNaturalWeapon: false } };
      const actor = { items: [unequipped] };
      expect(EquipmentService.getHandsOccupied(actor)).toBe(0);
    });
  });

  describe("canEquip", () => {
    test("can equip when under limit", () => {
      const actor = { items: [] };
      const weapon = { type: "weapon", system: { type: "1he", isNaturalWeapon: false } };
      const result = EquipmentService.canEquip(actor, weapon);
      expect(result.valid).toBe(true);
    });
    test("cannot equip when would exceed 2 hands", () => {
      const actor = { items: [mockWeapon1H, mockShield] };
      const newWeapon = { type: "weapon", system: { type: "1he", isNaturalWeapon: false } };
      const result = EquipmentService.canEquip(actor, newWeapon);
      expect(result.valid).toBe(false);
      expect(result.currentHands).toBe(2);
    });
    test("can equip 2 one-handed weapons with different skills", () => {
      const weapon1 = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" } };
      const actor = { items: [weapon1] };
      const weapon2 = { type: "weapon", system: { type: "1he", isNaturalWeapon: false, offensive_skill: "skill-shortsword" } };
      const result = EquipmentService.canEquip(actor, weapon2);
      expect(result.valid).toBe(true);
    });
    test("cannot equip 2 one-handed weapons with same skill", () => {
      const weapon1 = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" } };
      const actor = { items: [weapon1] };
      const weapon2 = { type: "weapon", system: { type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" } };
      const result = EquipmentService.canEquip(actor, weapon2);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("dual_wield_same_skill");
    });
  });

  describe("canEquipArmor", () => {
    test("can equip when slot is free", () => {
      const actor = { items: [] };
      const armor = { type: "armor", _id: "a1", system: { armorSlot: "body" } };
      expect(EquipmentService.canEquipArmor(actor, armor).valid).toBe(true);
    });
    test("cannot equip second body armor when one already equipped", () => {
      const body1 = { type: "armor", _id: "b1", system: { equipped: true, armorSlot: "body" } };
      const actor = { items: [body1] };
      const body2 = { type: "armor", _id: "b2", system: { armorSlot: "body" } };
      const result = EquipmentService.canEquipArmor(actor, body2);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("armor_slot_occupied");
    });
    test("can equip body + helmet + shield", () => {
      const body = { type: "armor", _id: "b1", system: { equipped: true, armorSlot: "body" } };
      const actor = { items: [body] };
      const helmet = { type: "armor", _id: "h1", system: { armorSlot: "helmet" } };
      expect(EquipmentService.canEquipArmor(actor, helmet).valid).toBe(true);
    });
    test("cannot equip shield while 2H weapon is equipped", () => {
      const weapon2H = { type: "weapon", system: { equipped: true, type: "2h", isNaturalWeapon: false } };
      const actor = { items: [weapon2H] };
      const shield = { type: "armor", _id: "s1", system: { armorSlot: "shield", isShield: true } };
      const result = EquipmentService.canEquipArmor(actor, shield);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("shield_with_two_handed_weapon");
    });
    test("cannot equip shield while pa2h weapon is equipped", () => {
      const pa2h = { type: "weapon", system: { equipped: true, type: "pa2h", isNaturalWeapon: false } };
      const actor = { items: [pa2h] };
      const shield = { type: "armor", _id: "s1", system: { armorSlot: "shield" } };
      expect(EquipmentService.canEquipArmor(actor, shield).reason).toBe("shield_with_two_handed_weapon");
    });
    test("can equip shield with only 1H weapon equipped", () => {
      const weapon1H = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false } };
      const actor = { items: [weapon1H] };
      const shield = { type: "armor", _id: "s1", system: { armorSlot: "shield", isShield: true } };
      expect(EquipmentService.canEquipArmor(actor, shield).valid).toBe(true);
    });
  });

  describe("toggleEquipped", () => {
    // Extracted verbatim from RMSSCharacterSheet's own ".equippable" click handler - these
    // tests pin the exact behavior (including the notification-only, non-blocking second-weapon
    // warning) so the Argon HUD equipment panel calling this stays faithful to what the sheet
    // already did inline.
    beforeEach(() => {
      global.ui = { notifications: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } };
      global.game.i18n.format = jest.fn((key, data) => `${key}::${JSON.stringify(data ?? {})}`);
      jest.spyOn(ArmorInfoService, "updateActorArmorInfo").mockResolvedValue(undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    test("plain item delegates to ItemService.toggleWorn", async () => {
      const item = { type: "item", system: { worn: false }, update: jest.fn().mockResolvedValue(undefined) };
      const actor = { items: [] };
      const changed = await EquipmentService.toggleEquipped(actor, item);
      expect(changed).toBe(true);
      expect(item.update).toHaveBeenCalledWith({ "system.worn": true });
    });

    test("herb_or_poison also delegates to ItemService.toggleWorn", async () => {
      const item = { type: "herb_or_poison", system: { worn: true }, update: jest.fn().mockResolvedValue(undefined) };
      const changed = await EquipmentService.toggleEquipped({ items: [] }, item);
      expect(changed).toBe(true);
      expect(item.update).toHaveBeenCalledWith({ "system.worn": false });
    });

    test("unequipping an equipped weapon just flips equipped off", async () => {
      const weapon = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false }, update: jest.fn().mockResolvedValue(undefined) };
      const changed = await EquipmentService.toggleEquipped({ items: [weapon] }, weapon);
      expect(changed).toBe(true);
      expect(weapon.update).toHaveBeenCalledWith({ system: { equipped: false } });
      expect(ArmorInfoService.updateActorArmorInfo).not.toHaveBeenCalled();
    });

    test("unequipping armor also refreshes armor_info", async () => {
      const armor = { type: "armor", _id: "a1", system: { equipped: true, armorSlot: "body" }, update: jest.fn().mockResolvedValue(undefined) };
      const actor = { items: [armor] };
      const changed = await EquipmentService.toggleEquipped(actor, armor);
      expect(changed).toBe(true);
      expect(armor.update).toHaveBeenCalledWith({ system: { equipped: false } });
      expect(ArmorInfoService.updateActorArmorInfo).toHaveBeenCalledWith(actor);
    });

    test("equipping a weapon under the hand limit sets equipped and worn", async () => {
      const weapon = { type: "weapon", system: { equipped: false, type: "1he", isNaturalWeapon: false }, update: jest.fn().mockResolvedValue(undefined) };
      const actor = { items: [] };
      const changed = await EquipmentService.toggleEquipped(actor, weapon);
      expect(changed).toBe(true);
      expect(weapon.update).toHaveBeenCalledWith({ system: { equipped: true, worn: true } });
    });

    test("equipping a weapon that would exceed 2 hands warns and does not update", async () => {
      const weapon1 = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false } };
      const shield = { type: "armor", _id: "s1", system: { equipped: true, armorSlot: "shield", isShield: true } };
      const weapon2 = { type: "weapon", system: { equipped: false, type: "2h", isNaturalWeapon: false }, update: jest.fn() };
      const actor = { items: [weapon1, shield] };
      const changed = await EquipmentService.toggleEquipped(actor, weapon2);
      expect(changed).toBe(false);
      expect(weapon2.update).not.toHaveBeenCalled();
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });

    test("dual-wielding a second weapon with the same offensive_skill warns and does not update", async () => {
      const weapon1 = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" } };
      const weapon2 = {
        type: "weapon",
        system: { equipped: false, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" },
        update: jest.fn()
      };
      const actor = { items: [weapon1] };
      const changed = await EquipmentService.toggleEquipped(actor, weapon2);
      expect(changed).toBe(false);
      expect(weapon2.update).not.toHaveBeenCalled();
    });

    test("dual-wielding a second one-handed weapon with a different skill still warns (informational) but does equip", async () => {
      const weapon1 = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-broadsword" } };
      const weapon2 = {
        type: "weapon",
        system: { equipped: false, type: "1he", isNaturalWeapon: false, offensive_skill: "skill-shortsword" },
        update: jest.fn().mockResolvedValue(undefined)
      };
      const actor = { items: [weapon1] };
      const changed = await EquipmentService.toggleEquipped(actor, weapon2);
      expect(changed).toBe(true);
      expect(weapon2.update).toHaveBeenCalledWith({ system: { equipped: true, worn: true } });
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });

    test("equipping armor into an occupied slot warns and does not update", async () => {
      const body1 = { type: "armor", _id: "b1", system: { equipped: true, armorSlot: "body" } };
      const body2 = { type: "armor", _id: "b2", system: { equipped: false, armorSlot: "body" }, update: jest.fn() };
      const actor = { items: [body1] };
      const changed = await EquipmentService.toggleEquipped(actor, body2);
      expect(changed).toBe(false);
      expect(body2.update).not.toHaveBeenCalled();
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });

    test("equipping armor also refreshes armor_info", async () => {
      const armor = { type: "armor", _id: "a1", system: { equipped: false, armorSlot: "body" }, update: jest.fn().mockResolvedValue(undefined) };
      const actor = { items: [armor] };
      const changed = await EquipmentService.toggleEquipped(actor, armor);
      expect(changed).toBe(true);
      expect(ArmorInfoService.updateActorArmorInfo).toHaveBeenCalledWith(actor);
    });

    test("no actor or no item returns false without throwing", async () => {
      expect(await EquipmentService.toggleEquipped(null, {})).toBe(false);
      expect(await EquipmentService.toggleEquipped({ items: [] }, null)).toBe(false);
    });
  });
});
