/**
 * Tests for profession_txt_parser pure functions and data integrity.
 */
import {
  parseProfessionTxt,
  SPANISH_TO_SLUG,
  PROFESSION_COSTS,
  PROFESSION_DEFINITIONS,
  getAvailableProfessions,
  getProfessionCosts
} from '../module/tools/profession_txt_parser.js';

describe('parseProfessionTxt', () => {
  test('parses tab-separated lines correctly', () => {
    const txt = "Armadura·Ligera\t2/2/2\nArmadura·Media\t10";
    const { costs, unmapped } = parseProfessionTxt(txt);
    expect(costs["armor-light"]).toBe("2/2/2");
    expect(costs["armor-medium"]).toBe("10");
    expect(unmapped).toHaveLength(0);
  });

  test('reports unmapped lines', () => {
    const txt = "Armadura·Ligera\t2/2/2\nNoExiste\t99";
    const { costs, unmapped } = parseProfessionTxt(txt);
    expect(costs["armor-light"]).toBe("2/2/2");
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain("NoExiste");
  });

  test('skips empty lines', () => {
    const txt = "\n\nArmadura·Ligera\t1\n\n";
    const { costs, unmapped } = parseProfessionTxt(txt);
    expect(Object.keys(costs)).toHaveLength(1);
    expect(unmapped).toHaveLength(0);
  });

  test('handles double-space separator', () => {
    const txt = "Armadura·Ligera  3/3/3";
    const { costs } = parseProfessionTxt(txt);
    expect(costs["armor-light"]).toBe("3/3/3");
  });

  test('handles Windows line endings (\\r\\n)', () => {
    const txt = "Armadura·Ligera\t1\r\nArmadura·Media\t2";
    const { costs } = parseProfessionTxt(txt);
    expect(costs["armor-light"]).toBe("1");
    expect(costs["armor-medium"]).toBe("2");
  });
});

describe('SPANISH_TO_SLUG mapping', () => {
  test('has expected number of entries (no accidental deletions)', () => {
    const count = Object.keys(SPANISH_TO_SLUG).length;
    expect(count).toBeGreaterThanOrEqual(40);
  });

  test('all slugs are lowercase kebab-case', () => {
    for (const [name, slug] of Object.entries(SPANISH_TO_SLUG)) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test('no duplicate slugs (multiple names can map to same slug is OK, but verify key ones)', () => {
    expect(SPANISH_TO_SLUG["Armadura·Ligera"]).toBe("armor-light");
    expect(SPANISH_TO_SLUG["Desarrollo Físico"]).toBe("body-development");
    expect(SPANISH_TO_SLUG["Hechizos Dirigidos"]).toBe("directed-spells");
  });

  test('alternate spellings map to same slug', () => {
    expect(SPANISH_TO_SLUG["Comunicación"]).toBe(SPANISH_TO_SLUG["Comunicaciones"]);
    expect(SPANISH_TO_SLUG["Urbana"]).toBe(SPANISH_TO_SLUG["Urbano"]);
    expect(SPANISH_TO_SLUG["Exteriores·Animales"]).toBe(SPANISH_TO_SLUG["Exterior·Animales"]);
  });
});

describe('PROFESSION_COSTS data integrity', () => {
  const professions = Object.keys(PROFESSION_COSTS);

  test('has at least 6 professions', () => {
    expect(professions.length).toBeGreaterThanOrEqual(6);
  });

  test.each(professions)('%s parses without unmapped lines', (key) => {
    const { costs, unmapped } = parseProfessionTxt(PROFESSION_COSTS[key]);
    expect(unmapped).toHaveLength(0);
    expect(Object.keys(costs).length).toBeGreaterThanOrEqual(30);
  });

  test.each(professions)('%s has all core combat categories', (key) => {
    const { costs } = parseProfessionTxt(PROFESSION_COSTS[key]);
    expect(costs).toHaveProperty("armor-light");
    expect(costs).toHaveProperty("armor-medium");
    expect(costs).toHaveProperty("armor-heavy");
    expect(costs).toHaveProperty("weapon-1-h-edged");
    expect(costs).toHaveProperty("body-development");
    expect(costs).toHaveProperty("power-point-development");
  });

  test.each(professions)('%s has valid cost format (number or N/N/N...)', (key) => {
    const { costs } = parseProfessionTxt(PROFESSION_COSTS[key]);
    for (const [slug, cost] of Object.entries(costs)) {
      const parts = cost.split("/");
      for (const part of parts) {
        const num = Number(part);
        expect(num).not.toBeNaN();
        expect(num).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('PROFESSION_DEFINITIONS', () => {
  test('every profession in COSTS has a definition', () => {
    for (const key of Object.keys(PROFESSION_COSTS)) {
      expect(PROFESSION_DEFINITIONS).toHaveProperty(key);
    }
  });

  test('spellUserType is a valid value', () => {
    const validTypes = ["pure", "semi", "hybrid", "arcane_pure", "arcane_semi", "none"];
    for (const [key, def] of Object.entries(PROFESSION_DEFINITIONS)) {
      expect(validTypes).toContain(def.spellUserType);
    }
  });

  test('spell casters have a spellRealm', () => {
    for (const [key, def] of Object.entries(PROFESSION_DEFINITIONS)) {
      if (def.spellUserType !== "none") {
        expect(def.spellRealm).toBeTruthy();
      }
    }
  });

  test('hybrid casters have spellRealm2', () => {
    for (const [key, def] of Object.entries(PROFESSION_DEFINITIONS)) {
      if (def.spellUserType === "hybrid") {
        expect(def.spellRealm2).toBeTruthy();
      }
    }
  });
});

describe('getAvailableProfessions', () => {
  test('returns all keys from PROFESSION_COSTS', () => {
    const result = getAvailableProfessions();
    expect(result).toEqual(Object.keys(PROFESSION_COSTS));
  });
});

describe('getProfessionCosts', () => {
  test('returns costs for a known profession', () => {
    const costs = getProfessionCosts("Cleric");
    expect(costs).not.toBeNull();
    expect(costs["armor-light"]).toBe("2/2/2");
    expect(costs["body-development"]).toBe("10");
  });

  test('returns null for unknown profession', () => {
    expect(getProfessionCosts("FakeProfession")).toBeNull();
  });

  test('Cleric and Animist share some costs but differ in others', () => {
    const cleric = getProfessionCosts("Cleric");
    const animist = getProfessionCosts("Animist");
    expect(cleric["armor-light"]).toBe(animist["armor-light"]);
    expect(cleric["body-development"]).not.toBe(animist["body-development"]);
  });
});
