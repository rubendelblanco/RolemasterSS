/**
 * Conditional modifiers: tags of an attack or roll, which modifiers count for it, and the conditional modifier effect.
 */
import {
  MODIFIER_TARGET,
  LEGACY_ELEMENTAL_DEFENSE_FLAG,
  weaponAttackTags,
  spellAttackTags,
  resistanceRollTags,
  matchesVersus,
  effectModifiers,
  getConditionalModifier,
  normalizeModifiers,
  normalizeTagList,
  spellTags,
  spellTagsOf,
  getResistanceModifier
} from '../module/effects/conditional_modifiers.js';
import {
  buildConditionalModifierEffect,
  isRoundTickedEffect,
  TICKS_PER_ROUND_FLAG
} from '../module/effects/effect_catalog.js';

const effect = (modifiers, extra = {}) => ({ flags: { rmss: { modifiers } }, ...extra });
const actorWith = (...effects) => ({ effects });

describe('tags', () => {
  test('a weapon attack is melee, unless the weapon is a missile or thrown weapon', () => {
    expect(weaponAttackTags({ system: { type: "1h" } })).toEqual(["weapon", "melee"]);
    expect(weaponAttackTags({ system: { type: "mis" } })).toEqual(["weapon", "missile"]);
    expect(weaponAttackTags({ system: { type: "th" } })).toEqual(["weapon", "missile"]);
    expect(weaponAttackTags(null)).toEqual(["weapon", "melee"]);
  });

  test('an elemental spell attack carries its element when the table says which', () => {
    expect(spellAttackTags("fire_bolt")).toEqual(["spell", "elemental", "fire", "heat"]);
    expect(spellAttackTags("fire_ball")).toEqual(["spell", "elemental", "fire", "heat"]);
    expect(spellAttackTags("ice_bolt")).toEqual(["spell", "elemental", "ice", "cold"]);
    expect(spellAttackTags("lighting_bolt")).toEqual(["spell", "elemental", "electricity"]);
    expect(spellAttackTags("shock_bolt")).toEqual(["spell", "elemental", "electricity"]);
    expect(spellAttackTags("water_bolt")).toEqual(["spell", "elemental", "water"]);
  });

  test('an elemental spell attack with a table that says nothing is just spell and elemental', () => {
    expect(spellAttackTags("")).toEqual(["spell", "elemental"]);
    expect(spellAttackTags(undefined)).toEqual(["spell", "elemental"]);
  });

  test('a resistance roll carries what it resists', () => {
    expect(resistanceRollTags("essence")).toEqual(["spell", "essence"]);
    expect(resistanceRollTags("channeling")).toEqual(["spell", "channeling"]);
    expect(resistanceRollTags("mentalism")).toEqual(["spell", "mentalism"]);
    expect(resistanceRollTags("chann_ess")).toEqual(["spell", "channeling", "essence"]);
    expect(resistanceRollTags("arcane")).toEqual(["spell", "arcane"]);
    expect(resistanceRollTags("poison")).toEqual(["poison"]);
    expect(resistanceRollTags("fear")).toEqual(["fear"]);
    expect(resistanceRollTags("custom")).toEqual([]);
  });
});

describe('matchesVersus', () => {
  test('without conditions it always counts', () => {
    expect(matchesVersus(undefined, ["weapon"])).toBe(true);
    expect(matchesVersus([], [])).toBe(true);
  });

  test('every tag of the condition must be on the attack', () => {
    expect(matchesVersus(["spell"], ["spell", "elemental"])).toBe(true);
    expect(matchesVersus(["spell", "fire"], ["spell", "elemental", "fire", "heat"])).toBe(true);
    expect(matchesVersus(["spell", "fire"], ["spell", "elemental", "ice", "cold"])).toBe(false);
    expect(matchesVersus(["elemental"], ["weapon", "melee"])).toBe(false);
  });
});

describe('getConditionalModifier', () => {
  test('adds the modifiers of the target kind whose condition matches', () => {
    const actor = actorWith(effect([
      { target: "db", value: 5, versus: ["spell", "elemental"] },
      { target: "rr", value: 5, versus: ["spell"] }
    ]));
    expect(getConditionalModifier(actor, "db", ["spell", "elemental"])).toBe(5);
    expect(getConditionalModifier(actor, "rr", ["spell", "essence"])).toBe(5);
  });

  test('a weapon attack does not get the elemental defense, a poison roll does not get the one against spells', () => {
    const actor = actorWith(effect([
      { target: "db", value: 5, versus: ["spell", "elemental"] },
      { target: "rr", value: 5, versus: ["spell"] }
    ]));
    expect(getConditionalModifier(actor, "db", ["weapon", "melee"])).toBe(0);
    expect(getConditionalModifier(actor, "rr", ["poison"])).toBe(0);
  });

  test('each target kind keeps to itself', () => {
    const actor = actorWith(effect([{ target: "ob", value: 15, versus: ["weapon"] }]));
    expect(getConditionalModifier(actor, "ob", ["weapon", "melee"])).toBe(15);
    expect(getConditionalModifier(actor, "db", ["weapon", "melee"])).toBe(0);
  });

  test('the effects of several spells add up', () => {
    const actor = actorWith(
      effect([{ target: "db", value: 5, versus: ["spell", "elemental"] }]),
      effect([{ target: "db", value: 20, versus: ["fire"] }])
    );
    expect(getConditionalModifier(actor, "db", ["spell", "elemental", "fire", "heat"])).toBe(25);
    expect(getConditionalModifier(actor, "db", ["spell", "elemental", "ice", "cold"])).toBe(5);
  });

  test('disabled and expired (suppressed) effects do not count', () => {
    const mod = [{ target: "db", value: 5 }];
    const actor = actorWith(effect(mod), effect(mod, { disabled: true }), effect(mod, { isSuppressed: true }));
    expect(getConditionalModifier(actor, "db", [])).toBe(5);
  });

  test('no actor, no effects, or no modifiers add nothing', () => {
    expect(getConditionalModifier(null, "db", [])).toBe(0);
    expect(getConditionalModifier({ effects: [] }, "db", [])).toBe(0);
    expect(getConditionalModifier(actorWith({ flags: {} }), "db", [])).toBe(0);
  });

  test('the elemental defense of the first version is still honoured as +N to DB against elemental spells', () => {
    const old = { flags: { rmss: { [LEGACY_ELEMENTAL_DEFENSE_FLAG]: 5 } } };
    expect(effectModifiers(old)).toEqual([{ target: "db", value: 5, versus: ["spell", "elemental"] }]);
    expect(getConditionalModifier(actorWith(old), "db", ["spell", "elemental", "fire", "heat"])).toBe(5);
    expect(getConditionalModifier(actorWith(old), "db", ["weapon", "melee"])).toBe(0);
  });
});

describe('normalizeModifiers', () => {
  test('returns clean modifiers, with an empty condition when none is given', () => {
    expect(normalizeModifiers([{ target: "db", value: "5" }])).toEqual([{ target: "db", value: 5, versus: [] }]);
  });

  test('refuses what could never work, where it is asked for', () => {
    expect(() => normalizeModifiers([])).toThrow("at least one modifier");
    expect(() => normalizeModifiers(undefined)).toThrow("at least one modifier");
    expect(() => normalizeModifiers([{ target: "hp", value: 5 }])).toThrow("target must be one of");
    expect(() => normalizeModifiers([{ target: MODIFIER_TARGET.DB, value: "lots" }])).toThrow("value must be a number");
    expect(() => normalizeModifiers([{ target: "db", value: 5, versus: "spell" }])).toThrow("list of tags");
    expect(() => normalizeModifiers([{ target: "db", value: 5, versus: [""] }])).toThrow("list of tags");
  });
});

describe('buildConditionalModifierEffect', () => {
  const base = { origin: "Actor.a", name: "Prayer of Protection", modifiers: [{ target: "db", value: 5, versus: ["spell", "elemental"] }] };

  test('lasts a number of seconds of game time', () => {
    expect(buildConditionalModifierEffect({ ...base, seconds: 600, description: "d" })).toEqual({
      name: "Prayer of Protection",
      img: "icons/svg/aura.svg",
      origin: "Actor.a",
      description: "d",
      disabled: false,
      flags: { rmss: { modifiers: [{ target: "db", value: 5, versus: ["spell", "elemental"] }] } },
      duration: { value: 600, units: "seconds", expiry: null }
    });
  });

  test('lasts a number of rounds, counted down in combat', () => {
    const data = buildConditionalModifierEffect({ ...base, rounds: 1 });
    expect(data.duration).toEqual({ value: 1, units: "rounds", expiry: null });
    expect(data.flags.rmss[TICKS_PER_ROUND_FLAG]).toBe(true);
  });

  test('it needs a duration, and only one kind', () => {
    expect(() => buildConditionalModifierEffect({ ...base })).toThrow("either seconds or rounds");
    expect(() => buildConditionalModifierEffect({ ...base, seconds: 10, rounds: 1 })).toThrow("either seconds or rounds");
  });

  test('it needs a name and valid modifiers', () => {
    expect(() => buildConditionalModifierEffect({ ...base, name: "", seconds: 10 })).toThrow("needs a name");
    expect(() => buildConditionalModifierEffect({ ...base, modifiers: [], seconds: 10 })).toThrow("at least one modifier");
  });

  test('other flags to carry (a replace key) are kept next to the modifiers', () => {
    const data = buildConditionalModifierEffect({ ...base, seconds: 10, rmss: { casterUuid: "Actor.c" } });
    expect(data.flags.rmss.casterUuid).toBe("Actor.c");
    expect(data.flags.rmss.modifiers).toHaveLength(1);
  });
});

describe('isRoundTickedEffect', () => {
  test('the fixed combat effects go down by name', () => {
    for (const name of ["Stunned", "Parry", "No parry", "Bonus", "Penalty"]) {
      expect(isRoundTickedEffect({ name })).toBe(true);
    }
    for (const name of ["Bleeding", "Dying", "Dead", "Unconscious", "Prayer"]) {
      expect(isRoundTickedEffect({ name })).toBe(false);
    }
  });

  test('so does any effect that says so with the flag, whatever its name', () => {
    expect(isRoundTickedEffect({ name: "Sacred Strike", flags: { rmss: { [TICKS_PER_ROUND_FLAG]: true } } })).toBe(true);
    expect(isRoundTickedEffect({ name: "Sacred Strike", flags: { rmss: {} } })).toBe(false);
  });
});

describe('normalizeTagList', () => {
  test('trims, lower-cases and drops empty and repeated tags', () => {
    expect(normalizeTagList([" Fire ", "cold", "fire", "", "  "])).toEqual(["fire", "cold"]);
  });

  test('accepts a comma-separated string, and anything else is an empty list', () => {
    expect(normalizeTagList("fire, Cold ,")).toEqual(["fire", "cold"]);
    expect(normalizeTagList(undefined)).toEqual([]);
    expect(normalizeTagList(5)).toEqual([]);
  });
});

describe('spellTags', () => {
  test('every spell is a spell, and nothing else when there is nothing else to say', () => {
    expect(spellTags()).toEqual(["spell"]);
    expect(spellTags({ type: "F" })).toEqual(["spell"]);
  });

  test('it carries the realm it is cast from, and a hybrid list gives both', () => {
    expect(spellTags({ type: "F", realm: "Essence" })).toEqual(["spell", "essence"]);
    expect(spellTags({ type: "F", realm: "essence/channeling" })).toEqual(["spell", "essence", "channeling"]);
    expect(spellTags({ type: "F", realm: "arcane" })).toEqual(["spell", "arcane"]);
    expect(spellTags({ type: "F", realm: "nonsense" })).toEqual(["spell"]);
  });

  test('bolts and balls are elemental, with the element their attack table names', () => {
    expect(spellTags({ type: "DE", attackTable: "ice_bolt" })).toEqual(["spell", "elemental", "ice", "cold"]);
    expect(spellTags({ type: "BE", attackTable: "fire_ball", realm: "essence" })).toEqual(["spell", "essence", "elemental", "fire", "heat"]);
    expect(spellTags({ type: "DE" })).toEqual(["spell", "elemental"]);
  });

  test('the tags written on the spell are added, without repeating what was derived', () => {
    expect(spellTags({ type: "F", realm: "essence", authored: ["Cold", "charm"] })).toEqual(["spell", "essence", "cold", "ice", "charm"]);
    expect(spellTags({ type: "DE", attackTable: "fire_bolt", authored: ["fire", "spell"] })).toEqual(["spell", "elemental", "fire", "heat"]);
  });
});

describe('spellTagsOf', () => {
  test('reads the type, attack table and written tags of a spell item', () => {
    const spell = { system: { type: "DE", attack_table: "lighting_bolt", spell_tags: ["shock"] } };
    expect(spellTagsOf(spell, { realm: "essence" })).toEqual(["spell", "essence", "elemental", "electricity", "shock"]);
  });

  test('a spell with no data is just a spell', () => {
    expect(spellTagsOf(null)).toEqual(["spell"]);
    expect(spellTagsOf({ system: {} })).toEqual(["spell"]);
  });
});

describe('getResistanceModifier', () => {
  const protectedAgainstFire = actorWith(effect([
    { target: "rr", value: 20, versus: ["spell", "fire"] },
    { target: "rr", value: 5, versus: ["spell"] }
  ]));

  test('counts what is given against the category, and against the tags of the spell', () => {
    expect(getResistanceModifier(protectedAgainstFire, { category: "essence", tags: ["spell", "fire", "heat"] })).toBe(25);
  });

  test('without the spell tags only the category counts: a fire protection does not apply to just any spell', () => {
    expect(getResistanceModifier(protectedAgainstFire, { category: "essence" })).toBe(5);
    expect(getResistanceModifier(protectedAgainstFire, { category: "essence", tags: ["spell", "ice", "cold"] })).toBe(5);
  });

  test('the spell tags alone are enough, with no category', () => {
    expect(getResistanceModifier(protectedAgainstFire, { tags: ["spell", "fire"] })).toBe(25);
  });

  test('a poison roll gets nothing against spells', () => {
    expect(getResistanceModifier(protectedAgainstFire, { category: "poison" })).toBe(0);
  });

  test('nothing to ask about adds nothing', () => {
    expect(getResistanceModifier(protectedAgainstFire)).toBe(0);
    expect(getResistanceModifier(null, { category: "essence" })).toBe(0);
  });
});

describe('element partners', () => {
  test('an element written on a spell brings its partner, whichever way it is written', () => {
    expect(spellTags({ type: "F", authored: ["ice"] })).toEqual(["spell", "ice", "cold"]);
    expect(spellTags({ type: "F", authored: ["cold"] })).toEqual(["spell", "cold", "ice"]);
    expect(spellTags({ type: "F", authored: ["fire"] })).toEqual(["spell", "fire", "heat"]);
    expect(spellTags({ type: "F", authored: ["heat"] })).toEqual(["spell", "heat", "fire"]);
  });

  test('so a protection against cold covers a spell written as ice, and the other way round', () => {
    const againstCold = actorWith(effect([{ target: "rr", value: 20, versus: ["spell", "cold"] }]));
    const againstIce = actorWith(effect([{ target: "rr", value: 20, versus: ["spell", "ice"] }]));
    for (const written of ["ice", "cold"]) {
      const tags = spellTags({ type: "F", realm: "essence", authored: [written] });
      expect(getResistanceModifier(againstCold, { category: "essence", tags })).toBe(20);
      expect(getResistanceModifier(againstIce, { category: "essence", tags })).toBe(20);
    }
  });

  test('the partner is not repeated when both are already there', () => {
    expect(spellTags({ type: "F", authored: ["ice", "cold"] })).toEqual(["spell", "ice", "cold"]);
    expect(spellTags({ type: "DE", attackTable: "ice_bolt", authored: ["cold"] })).toEqual(["spell", "elemental", "ice", "cold"]);
  });

  test('an element with no partner brings nothing else', () => {
    expect(spellTags({ type: "F", authored: ["electricity", "charm"] })).toEqual(["spell", "electricity", "charm"]);
  });

  test('an attack table called cold_bolt or heat_bolt is the same element as an ice or fire one', () => {
    expect(spellTags({ type: "DE", attackTable: "cold_bolt" })).toEqual(["spell", "elemental", "ice", "cold"]);
    expect(spellTags({ type: "DE", attackTable: "heat_ball" })).toEqual(["spell", "elemental", "fire", "heat"]);
  });
});
