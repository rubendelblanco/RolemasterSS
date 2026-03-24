/**
 * Tests for ItemService pure functions.
 */
import ItemService from '../module/actors/services/item_service.js';

describe('ItemService.normalizeItemFormData', () => {
  test('calculates totalWeight and totalCost from unit values', () => {
    const formData = {
      "system.quantity": 5,
      "system.unitWeight": 2.5,
      "system.unitCost": 10
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.weight"]).toBe(12.5);
    expect(result["system.cost"]).toBe(50);
  });

  test('quantity minimum is 1', () => {
    const formData = {
      "system.quantity": 0,
      "system.unitWeight": 1,
      "system.unitCost": 1
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.quantity"]).toBe(1);
    expect(result["system.weight"]).toBe(1);
    expect(result["system.cost"]).toBe(1);
  });

  test('negative quantity becomes 1', () => {
    const formData = {
      "system.quantity": -3,
      "system.unitWeight": 2,
      "system.unitCost": 5
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.quantity"]).toBe(1);
  });

  test('handles null unitWeight/unitCost as 0', () => {
    const formData = {
      "system.quantity": 3,
      "system.unitWeight": null,
      "system.unitCost": null
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.unitWeight"]).toBe(0);
    expect(result["system.unitCost"]).toBe(0);
    expect(result["system.weight"]).toBe(0);
    expect(result["system.cost"]).toBe(0);
  });

  test('parses container allowedTags from comma-separated string', () => {
    const formData = {
      "system.quantity": 1,
      "system.unitWeight": 0,
      "system.unitCost": 0,
      "system.container.allowedTags": "potion, scroll, gem"
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.container.allowedTags"]).toEqual(["potion", "scroll", "gem"]);
  });

  test('allowedTags: empty strings are filtered out', () => {
    const formData = {
      "system.quantity": 1,
      "system.unitWeight": 0,
      "system.unitCost": 0,
      "system.container.allowedTags": "potion,,, scroll,"
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.container.allowedTags"]).toEqual(["potion", "scroll"]);
  });

  test('allowedTags: already an array passes through', () => {
    const formData = {
      "system.quantity": 1,
      "system.unitWeight": 0,
      "system.unitCost": 0,
      "system.container.allowedTags": ["a", "b"]
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.container.allowedTags"]).toEqual(["a", "b"]);
  });

  test('rounds unit values to 2 decimals', () => {
    const formData = {
      "system.quantity": 3,
      "system.unitWeight": 1.456,
      "system.unitCost": 2.789
    };
    const result = ItemService.normalizeItemFormData({}, formData);
    expect(result["system.unitWeight"]).toBe(1.46);
    expect(result["system.unitCost"]).toBe(2.79);
  });
});

describe('ItemService.equals', () => {
  test('same name, same img → equal', () => {
    expect(ItemService.equals({ name: "Sword", img: "a.png" }, { name: "Sword", img: "a.png" })).toBe(true);
  });

  test('different name → not equal', () => {
    expect(ItemService.equals({ name: "Sword", img: "a.png" }, { name: "Axe", img: "a.png" })).toBe(false);
  });

  test('same name, different img → not equal', () => {
    expect(ItemService.equals({ name: "Sword", img: "a.png" }, { name: "Sword", img: "b.png" })).toBe(false);
  });

  test('same name, both no img → equal', () => {
    expect(ItemService.equals({ name: "Potion" }, { name: "Potion" })).toBe(true);
    expect(ItemService.equals({ name: "Potion", img: "" }, { name: "Potion", img: null })).toBe(true);
  });

  test('one has img, other does not → not equal', () => {
    expect(ItemService.equals({ name: "Potion", img: "a.png" }, { name: "Potion" })).toBe(false);
  });
});

describe('ItemService._getSpellListMaxLevel', () => {
  test('uses skill ranks when skill exists', () => {
    const skill = { system: { ranks: 15 } };
    expect(ItemService._getSpellListMaxLevel(skill, {}, false, 10)).toBe(15);
  });

  test('creature/NPC uses stored listLevel flag', () => {
    const list = { flags: { rmss: { listLevel: 8 } } };
    expect(ItemService._getSpellListMaxLevel(null, list, true, 20)).toBe(8);
  });

  test('creature/NPC without stored flag falls back to creature level', () => {
    expect(ItemService._getSpellListMaxLevel(null, { flags: {} }, true, 12)).toBe(12);
    expect(ItemService._getSpellListMaxLevel(null, {}, true, 12)).toBe(12);
  });

  test('no skill, not creature → returns 0', () => {
    expect(ItemService._getSpellListMaxLevel(null, {}, false, 10)).toBe(0);
  });
});

describe('ItemService._getSpellManeuverModifier', () => {
  test('returns null when skill exists (characters use skill bonus)', () => {
    expect(ItemService._getSpellManeuverModifier({ system: {} }, {}, false, 10)).toBeNull();
  });

  test('creature/NPC uses stored spellManeuverModifier flag', () => {
    const list = { flags: { rmss: { spellManeuverModifier: 30 } } };
    expect(ItemService._getSpellManeuverModifier(null, list, true, 20)).toBe(30);
  });

  test('creature/NPC without stored flag falls back to creature level', () => {
    expect(ItemService._getSpellManeuverModifier(null, {}, true, 15)).toBe(15);
  });

  test('non-creature without skill returns creature level param', () => {
    expect(ItemService._getSpellManeuverModifier(null, {}, false, 10)).toBe(10);
  });
});
