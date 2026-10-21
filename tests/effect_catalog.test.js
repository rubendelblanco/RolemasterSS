/**
 * The effect catalog. Each case writes out, by hand, the exact data the code built inline before the catalog existed, so
 * moving the effects into one place cannot change what an effect looks like once created.
 */
import {
  buildEffectData,
  EFFECT_DEFINITIONS,
  EFFECT_NAMES,
  ROUND_TICKED_EFFECT_NAMES
} from '../module/effects/effect_catalog.js';

const ICONS = "systems/rmss/assets/icons/";
const ME = "Actor.abc";

describe('names', () => {
  test('are the ones the code that looks effects up by name expects', () => {
    expect(EFFECT_NAMES).toEqual({
      STUNNED: "Stunned",
      BLEEDING: "Bleeding",
      PENALTY: "Penalty",
      PARRY: "Parry",
      NO_PARRY: "No parry",
      BONUS: "Bonus",
      DYING: "Dying",
      DEAD: "Dead",
      UNCONSCIOUS: "Unconscious"
    });
  });

  test('the effects that go down a round at the end of the owner\'s turn are the five that did before', () => {
    expect([...ROUND_TICKED_EFFECT_NAMES]).toEqual(["Stunned", "Parry", "No parry", "Bonus", "Penalty"]);
  });
});

describe('buildEffectData', () => {
  test('Stunned: rounds, and no flags when there is nothing to put in them', () => {
    expect(buildEffectData("stunned", { origin: ME, iconsFolder: ICONS, rmss: {}, duration: 3 })).toEqual({
      name: "Stunned",
      img: `${ICONS}stunned.svg`,
      origin: ME,
      disabled: false,
      duration: { value: 3, units: "rounds" }
    });
  });

  test('Stunned: with the tick deferral flag', () => {
    const data = buildEffectData("stunned", { origin: ME, iconsFolder: ICONS, rmss: { tickDeferredUntilRound: 4 }, duration: 2 });
    expect(data.flags).toEqual({ rmss: { tickDeferredUntilRound: 4 } });
  });

  test('Bleeding: lasts 99 rounds and carries the rate', () => {
    expect(buildEffectData("bleeding", {
      origin: ME, iconsFolder: ICONS, description: "Bleeding for 3", rmss: { value: 3, tickDeferredUntilRound: 2 }
    })).toEqual({
      name: "Bleeding",
      img: `${ICONS}bleeding.svg`,
      origin: ME,
      description: "Bleeding for 3",
      disabled: false,
      flags: { rmss: { value: 3, tickDeferredUntilRound: 2 } },
      duration: { value: 99, units: "rounds" }
    });
  });

  test('Penalty, timed: the given rounds', () => {
    expect(buildEffectData("penalty", {
      origin: ME, iconsFolder: ICONS, description: "d", rmss: { value: -25, temporaryPenalty: true }, duration: 4
    })).toEqual({
      name: "Penalty",
      img: `${ICONS}broken-bone.svg`,
      origin: ME,
      description: "d",
      disabled: false,
      flags: { rmss: { value: -25, temporaryPenalty: true } },
      duration: { value: 4, units: "rounds" }
    });
  });

  test('Penalty, permanent: 99 rounds', () => {
    const data = buildEffectData("penalty", { origin: ME, iconsFolder: ICONS, description: "d", rmss: { value: -10, permanentPenalty: true } });
    expect(data.duration).toEqual({ value: 99, units: "rounds" });
    expect(data.flags).toEqual({ rmss: { value: -10, permanentPenalty: true } });
    expect(data.name).toBe("Penalty");
  });

  test('Penalty from fasting: its own icon and the fasting flag', () => {
    expect(buildEffectData("fastingPenalty", {
      origin: ME, iconsFolder: ICONS, description: "Hungry", rmss: { value: -20, permanentPenalty: true, fastingPenalty: true }
    })).toEqual({
      name: "Penalty",
      img: `${ICONS}fasting.svg`,
      origin: ME,
      description: "Hungry",
      disabled: false,
      flags: { rmss: { value: -20, permanentPenalty: true, fastingPenalty: true } },
      duration: { value: 99, units: "rounds" }
    });
  });

  test('Parry (must parry): rounds and the penalty', () => {
    expect(buildEffectData("parry", { origin: ME, iconsFolder: ICONS, rmss: { value: -30 }, duration: 2 })).toEqual({
      name: "Parry",
      img: `${ICONS}sword-clash.svg`,
      origin: ME,
      disabled: false,
      flags: { rmss: { value: -30 } },
      duration: { value: 2, units: "rounds" }
    });
  });

  test('No parry: rounds', () => {
    expect(buildEffectData("noParry", { origin: ME, iconsFolder: ICONS, rmss: {}, duration: 3 })).toEqual({
      name: "No parry",
      img: `${ICONS}shield-disabled.svg`,
      origin: ME,
      disabled: false,
      duration: { value: 3, units: "rounds" }
    });
  });

  test('Bonus: rounds, description and the value', () => {
    expect(buildEffectData("bonus", { origin: ME, iconsFolder: ICONS, description: "+10", rmss: { value: 10 }, duration: 2 })).toEqual({
      name: "Bonus",
      img: `${ICONS}bonus.svg`,
      origin: ME,
      description: "+10",
      disabled: false,
      flags: { rmss: { value: 10 } },
      duration: { value: 2, units: "rounds" }
    });
  });

  test('Dying: the attacker goes in the flags, even when there is none', () => {
    expect(buildEffectData("dying", { origin: ME, iconsFolder: ICONS, rmss: { attackerId: null }, duration: 5 })).toEqual({
      name: "Dying",
      img: `${ICONS}dead-head.svg`,
      origin: ME,
      disabled: false,
      flags: { rmss: { attackerId: null } },
      duration: { value: 5, units: "rounds" }
    });
  });

  test('Dead: the core overlay, the token skull and a very long duration in seconds', () => {
    expect(buildEffectData("dead", { origin: ME, img: "icons/svg/skull.svg", coreFlags: { overlay: true } })).toEqual({
      name: "Dead",
      img: "icons/svg/skull.svg",
      origin: ME,
      disabled: false,
      flags: { core: { overlay: true } },
      duration: { value: 999999, units: "seconds" }
    });
  });

  test('Unconscious: the hits flag and a very long duration in seconds', () => {
    expect(buildEffectData("unconscious", { origin: ME, iconsFolder: ICONS, rmss: { unconsciousFromHits: true } })).toEqual({
      name: "Unconscious",
      img: `${ICONS}knockout.svg`,
      origin: ME,
      disabled: false,
      flags: { rmss: { unconsciousFromHits: true } },
      duration: { value: 999999, units: "seconds" }
    });
  });

  test('the parry stance icon: its own name and image, 999 rounds', () => {
    expect(buildEffectData("parryStance", { origin: ME, name: "Parry +20", img: "systems/rmss/assets/default/shield-parry.svg", rmss: { parryStance: true } })).toEqual({
      name: "Parry +20",
      img: "systems/rmss/assets/default/shield-parry.svg",
      origin: ME,
      disabled: false,
      flags: { rmss: { parryStance: true } },
      duration: { value: 999, units: "rounds" }
    });
  });

  test('a description that is not given is not in the data', () => {
    const data = buildEffectData("bonus", { origin: ME, iconsFolder: ICONS, rmss: { value: 5 }, duration: 1 });
    expect("description" in data).toBe(false);
  });

  test('an effect that is not in the catalog is an error, not silently an empty one', () => {
    expect(() => buildEffectData("nope", { origin: ME })).toThrow("Unknown effect: nope");
  });

  test('every definition has a name or leaves it to the caller, and a unit', () => {
    for (const [key, def] of Object.entries(EFFECT_DEFINITIONS)) {
      expect(["rounds", "seconds"]).toContain(def.units);
      if (key !== "parryStance") expect(typeof def.name).toBe("string");
    }
  });
});
