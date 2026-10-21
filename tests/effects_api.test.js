/**
 * game.rmss.effects.applyConditionalModifier: what a macro uses to put a conditional modifier effect on actors.
 */
import { jest } from '@jest/globals';
import { applyConditionalModifier } from '../module/effects/effects_api.js';

global.foundry = { utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)) } };

const makeActor = (uuid, existing = []) => ({
  documentName: "Actor",
  uuid,
  effects: existing.map((e) => ({ id: e.id, getFlag: (scope, key) => e.flags?.[scope]?.[key] })),
  deleteEmbeddedDocuments: jest.fn(async () => {}),
  createEmbeddedDocuments: jest.fn(async () => {})
});

const options = {
  name: "Prayer of Protection",
  modifiers: [
    { target: "db", value: 5, versus: ["spell", "elemental"] },
    { target: "rr", value: 5, versus: ["spell"] }
  ],
  seconds: 600
};

const deps = (extra = {}) => ({
  canModify: () => true,
  applyAsGM: jest.fn(async ({ actorUuids }) => ({ applied: actorUuids, failed: [] })),
  ...extra
});

describe('applyConditionalModifier', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('an actor the caller can write to gets the effect directly, with the modifiers in its flags', async () => {
    const a = makeActor("Actor.a");
    const d = deps();
    const result = await applyConditionalModifier(a, options, d);

    expect(result).toEqual({ applied: ["Actor.a"], failed: [] });
    expect(d.applyAsGM).not.toHaveBeenCalled();
    const data = a.createEmbeddedDocuments.mock.calls[0][1][0];
    expect(data.name).toBe("Prayer of Protection");
    expect(data.duration).toEqual({ value: 600, units: "seconds", expiry: null });
    expect(data.flags.rmss.modifiers).toEqual([
      { target: "db", value: 5, versus: ["spell", "elemental"] },
      { target: "rr", value: 5, versus: ["spell"] }
    ]);
  });

  test('an actor it cannot write to goes through a GM client', async () => {
    const a = makeActor("Actor.a"), b = makeActor("Actor.b");
    const d = deps({ canModify: (actor) => actor === a });
    const result = await applyConditionalModifier([a, b], { ...options, replaceKey: "prayer:caster" }, d);

    expect(result).toEqual({ applied: ["Actor.a", "Actor.b"], failed: [] });
    expect(b.createEmbeddedDocuments).not.toHaveBeenCalled();
    const payload = d.applyAsGM.mock.calls[0][0];
    expect(payload.actorUuids).toEqual(["Actor.b"]);
    expect(payload.replaceKey).toBe("prayer:caster");
    expect(payload.effectData.flags.rmss.modifiers).toHaveLength(2);
  });

  test('the replace key goes on the effect and replaces the one the caster put before', async () => {
    const a = makeActor("Actor.a", [{ id: "old", flags: { rmss: { effectKey: "prayer:caster" } } }]);
    await applyConditionalModifier(a, { ...options, replaceKey: "prayer:caster" }, deps());
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["old"]);
    expect(a.createEmbeddedDocuments.mock.calls[0][1][0].flags.rmss.effectKey).toBe("prayer:caster");
  });

  test('the origin is the first actor unless the macro says who casts it', async () => {
    const a = makeActor("Actor.a"), b = makeActor("Actor.b");
    await applyConditionalModifier([a, b], options, deps());
    expect(a.createEmbeddedDocuments.mock.calls[0][1][0].origin).toBe("Actor.a");
    expect(b.createEmbeddedDocuments.mock.calls[0][1][0].origin).toBe("Actor.a");

    const c = makeActor("Actor.c");
    await applyConditionalModifier(c, { ...options, origin: "Actor.caster" }, deps());
    expect(c.createEmbeddedDocuments.mock.calls[0][1][0].origin).toBe("Actor.caster");
  });

  test('tokens are accepted, and what is not an actor or a token is left out', async () => {
    const a = makeActor("Actor.a");
    const result = await applyConditionalModifier([{ actor: a }, null, {}], options, deps());
    expect(result).toEqual({ applied: ["Actor.a"], failed: [] });
  });

  test('a mistake in the modifiers fails before touching anybody', async () => {
    const a = makeActor("Actor.a");
    const d = deps();
    await expect(applyConditionalModifier(a, { ...options, modifiers: [{ target: "hp", value: 5 }] }, d)).rejects.toThrow("target must be one of");
    await expect(applyConditionalModifier(a, { ...options, seconds: undefined }, d)).rejects.toThrow("either seconds or rounds");
    expect(a.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(d.applyAsGM).not.toHaveBeenCalled();
  });

  test('with no GM connected the actors it could not write to are reported as failed, not thrown', async () => {
    const a = makeActor("Actor.a"), b = makeActor("Actor.b");
    const d = deps({ canModify: (actor) => actor === a, applyAsGM: jest.fn(async () => { throw new Error("no GM"); }) });
    const result = await applyConditionalModifier([a, b], options, d);
    expect(result).toEqual({ applied: ["Actor.a"], failed: ["Actor.b"] });
  });

  test('the actors the GM could not reach come back as failed', async () => {
    const b = makeActor("Actor.b"), c = makeActor("Actor.c");
    const d = deps({ canModify: () => false, applyAsGM: jest.fn(async () => ({ applied: ["Actor.b"], failed: ["Actor.c"] })) });
    expect(await applyConditionalModifier([b, c], options, d)).toEqual({ applied: ["Actor.b"], failed: ["Actor.c"] });
  });

  test('nobody to put it on does nothing', async () => {
    const d = deps();
    expect(await applyConditionalModifier([], options, d)).toEqual({ applied: [], failed: [] });
    expect(d.applyAsGM).not.toHaveBeenCalled();
  });

  test('an actor whose write fails is reported as failed and the rest still get it', async () => {
    const a = makeActor("Actor.a"), b = makeActor("Actor.b");
    a.createEmbeddedDocuments.mockRejectedValue(new Error("boom"));
    expect(await applyConditionalModifier([a, b], options, deps())).toEqual({ applied: ["Actor.b"], failed: ["Actor.a"] });
  });
});
