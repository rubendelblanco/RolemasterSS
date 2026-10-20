/**
 * Tests for EffectApplyService.applyEffectsAsGM (the GM-side handler that lets a player put an effect on other actors).
 */
import { jest } from '@jest/globals';
import EffectApplyService, { EFFECT_KEY_FLAG } from '../module/actors/services/effect_apply_service.js';

global.foundry = { utils: { deepClone: (o) => JSON.parse(JSON.stringify(o)) } };

function makeActor(effects = []) {
  return {
    documentName: "Actor",
    effects: effects.map((e) => ({ id: e.id, getFlag: (scope, key) => e.flags?.[scope]?.[key] })),
    deleteEmbeddedDocuments: jest.fn(async () => {}),
    createEmbeddedDocuments: jest.fn(async () => {})
  };
}

function setWorld({ isGM = true, docs = {} } = {}) {
  global.game = { user: { isGM } };
  global.fromUuid = jest.fn(async (uuid) => docs[uuid] ?? null);
}

const effect = { name: "Resguardo", changes: [], flags: { rmss: { otro: 1 } } };

describe("EffectApplyService.applyEffectsAsGM", () => {
  test("does nothing when the client is not a GM", async () => {
    const a = makeActor();
    setWorld({ isGM: false, docs: { "Actor.a": a } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a"], effectData: effect });
    expect(r).toEqual({ applied: [], failed: [] });
    expect(a.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test("creates the effect on every actor", async () => {
    const a = makeActor(), b = makeActor();
    setWorld({ docs: { "Actor.a": a, "Actor.b": b } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a", "Actor.b"], effectData: effect });
    expect(r).toEqual({ applied: ["Actor.a", "Actor.b"], failed: [] });
    expect(a.createEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", [expect.objectContaining({ name: "Resguardo" })]);
    expect(b.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  test("stamps the replace key on the effect and keeps the other flags", async () => {
    const a = makeActor();
    setWorld({ docs: { "Actor.a": a } });
    await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a"], effectData: effect, replaceKey: "resguardo:caster" });
    const created = a.createEmbeddedDocuments.mock.calls[0][1][0];
    expect(created.flags.rmss).toEqual({ otro: 1, [EFFECT_KEY_FLAG]: "resguardo:caster" });
    expect(effect.flags.rmss[EFFECT_KEY_FLAG]).toBeUndefined();
  });

  test("replaces only the effects carrying the same key", async () => {
    const a = makeActor([
      { id: "e1", flags: { rmss: { [EFFECT_KEY_FLAG]: "resguardo:caster" } } },
      { id: "e2", flags: { rmss: { [EFFECT_KEY_FLAG]: "resguardo:otro-lanzador" } } },
      { id: "e3", flags: {} }
    ]);
    setWorld({ docs: { "Actor.a": a } });
    await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a"], effectData: effect, replaceKey: "resguardo:caster" });
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["e1"]);
    expect(a.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  test("without a key nothing is deleted", async () => {
    const a = makeActor([{ id: "e1", flags: { rmss: { [EFFECT_KEY_FLAG]: "x" } } }]);
    setWorld({ docs: { "Actor.a": a } });
    await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a"], effectData: effect });
    expect(a.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test("a token uuid resolves to its actor", async () => {
    const a = makeActor();
    setWorld({ docs: { "Scene.s.Token.t": { documentName: "Token", actor: a } } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Scene.s.Token.t"], effectData: effect });
    expect(r.applied).toEqual(["Scene.s.Token.t"]);
  });

  test("an unknown uuid fails without stopping the others", async () => {
    const a = makeActor();
    setWorld({ docs: { "Actor.a": a } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.gone", "Actor.a"], effectData: effect });
    expect(r).toEqual({ applied: ["Actor.a"], failed: ["Actor.gone"] });
  });

  test("an actor whose update throws is reported as failed", async () => {
    const a = makeActor(), b = makeActor();
    a.createEmbeddedDocuments.mockRejectedValue(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    setWorld({ docs: { "Actor.a": a, "Actor.b": b } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a", "Actor.b"], effectData: effect });
    expect(r).toEqual({ applied: ["Actor.b"], failed: ["Actor.a"] });
    console.error.mockRestore();
  });

  test("an effect without a name is rejected for every actor", async () => {
    const a = makeActor();
    setWorld({ docs: { "Actor.a": a } });
    const r = await EffectApplyService.applyEffectsAsGM({ actorUuids: ["Actor.a"], effectData: { changes: [] } });
    expect(r).toEqual({ applied: [], failed: ["Actor.a"] });
    expect(a.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test("an empty or missing payload does nothing", async () => {
    setWorld();
    expect(await EffectApplyService.applyEffectsAsGM()).toEqual({ applied: [], failed: [] });
    expect(await EffectApplyService.applyEffectsAsGM({ actorUuids: [], effectData: effect })).toEqual({ applied: [], failed: [] });
  });
});
