/**
 * @jest-environment node
 */
import EquipmentService from "../module/actors/services/equipment_service.js";

describe("EquipmentService", () => {
  const mockWeapon1H = { type: "weapon", system: { equipped: true, hands: 1, isNaturalWeapon: false } };
  const mockWeapon2H = { type: "weapon", system: { equipped: true, hands: 2, isNaturalWeapon: false } };
  const mockNaturalWeapon = { type: "weapon", system: { equipped: false, hands: 1, isNaturalWeapon: true } };
  const mockCreatureAttack = { type: "creature_attack", system: {} };
  const mockShield = { type: "armor", system: { equipped: true, isShield: true } };
  const mockArmor = { type: "armor", system: { equipped: true, isShield: false } };

  describe("getWeaponHands", () => {
    test("1H weapon returns 1", () => {
      expect(EquipmentService.getWeaponHands(mockWeapon1H)).toBe(1);
    });
    test("2H weapon returns 2", () => {
      expect(EquipmentService.getWeaponHands(mockWeapon2H)).toBe(2);
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
      const weapon = { type: "weapon", system: { hands: 1, isNaturalWeapon: false } };
      const result = EquipmentService.canEquip(actor, weapon);
      expect(result.valid).toBe(true);
    });
    test("cannot equip when would exceed 2 hands", () => {
      const actor = { items: [mockWeapon1H, mockShield] };
      const newWeapon = { type: "weapon", system: { hands: 1, isNaturalWeapon: false } };
      const result = EquipmentService.canEquip(actor, newWeapon);
      expect(result.valid).toBe(false);
      expect(result.currentHands).toBe(2);
    });
  });
});
