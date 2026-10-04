/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { syncParryEffect } from "../module/combat/services/parry_effect.js";

const strings = {
  "rmss.parry.effect_name": "Parry +{defense}",
  "rmss.parry.effect_name_used": "Parry +{defense} (used)"
};

function makeActor({ flag = null, existing = null } = {}) {
  return {
    uuid: "Actor.orc",
    effects: existing ? [existing] : [],
    getFlag: () => flag,
    createEmbeddedDocuments: jest.fn(async () => []),
  };
}

const stanceEffect = (over = {}) => ({
  name: "Parry +30",
  img: "systems/rmss/assets/default/shield-parry.svg",
  flags: { rmss: { parryStance: true } },
  getFlag: () => true,
  update: jest.fn(async () => {}),
  delete: jest.fn(async () => {}),
  ...over
});

const reservation = (over = {}) => ({ points: 30, defense: 30, consumed: false, ...over });

beforeEach(() => {
  global.game = { i18n: { format: (key, data) => strings[key].replace(/\{(\w+)\}/g, (_, k) => data[k]) } };
});
afterEach(() => { delete global.game; });

describe("syncParryEffect", () => {
  it("does nothing when there is neither a reservation nor an effect", async () => {
    const actor = makeActor();
    await syncParryEffect(actor);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("creates the token effect for a new reservation, flagged so it is never confused with the critical-hit Parry", async () => {
    const actor = makeActor({ flag: reservation() });
    await syncParryEffect(actor);
    const [type, [data]] = actor.createEmbeddedDocuments.mock.calls[0];
    expect(type).toBe("ActiveEffect");
    expect(data).toMatchObject({
      name: "Parry +30",
      img: "systems/rmss/assets/default/shield-parry.svg",
      flags: { rmss: { parryStance: true } },
      disabled: false
    });
    expect(data.name).not.toBe("Parry"); // the crit effect is matched by this exact name
    expect(data.duration).toEqual({ value: 999, units: "rounds" }); // finite, so Foundry paints it on the token
  });

  it("leaves an up-to-date effect alone", async () => {
    const effect = stanceEffect();
    const actor = makeActor({ flag: reservation(), existing: effect });
    await syncParryEffect(actor);
    expect(effect.update).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("dims the icon and says (used) once the defense is spent", async () => {
    const effect = stanceEffect();
    const actor = makeActor({ flag: reservation({ consumed: true }), existing: effect });
    await syncParryEffect(actor);
    expect(effect.update).toHaveBeenCalledWith({ name: "Parry +30 (used)", img: "systems/rmss/assets/default/shield-parry-used.svg" });
  });

  it("follows a changed defense value", async () => {
    const effect = stanceEffect();
    const actor = makeActor({ flag: reservation({ defense: 45 }), existing: effect });
    await syncParryEffect(actor);
    expect(effect.update).toHaveBeenCalledWith({ name: "Parry +45", img: "systems/rmss/assets/default/shield-parry.svg" });
  });

  it("removes the effect when the reservation is gone", async () => {
    const effect = stanceEffect();
    const actor = makeActor({ flag: null, existing: effect });
    await syncParryEffect(actor);
    expect(effect.delete).toHaveBeenCalled();
  });
});
