/**
 * @jest-environment node
 */
import EquipmentService from "../module/actors/services/equipment_service.js";

describe("EquipmentService", () => {
  const mockWeapon1H = { type: "weapon", system: { equipped: true, type: "1he", isNaturalWeapon: false } };
  const mockWeapon2H = { type: "weapon", system: { equipped: true, type: "2h", isNaturalWeapon: false } };
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
});
