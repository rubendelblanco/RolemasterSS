/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import {
  COMBAT_EVENT, isMeleeAttack, getEventMacroUuid, fireCombatEvent, runCombatEventMacro
} from "../module/combat/services/combat_event_macro_service.js";

let settingValue;

beforeEach(() => {
  settingValue = "Macro.abc";
  global.game = {
    ...global.game,
    settings: { get: jest.fn(() => settingValue) },
    i18n: { localize: (k) => k, format: (k, d) => `${k}::${JSON.stringify(d ?? {})}` }
  };
  global.ui = { notifications: { warn: jest.fn() } };
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("isMeleeAttack", () => {
  it("ordinary weapons and creature attacks are melee, missile weapons are not", () => {
    expect(isMeleeAttack({ type: "weapon", system: { type: "1he" } })).toBe(true);
    expect(isMeleeAttack({ type: "creature_attack", system: {} })).toBe(true);
    expect(isMeleeAttack({ type: "weapon", system: { type: "mis" } })).toBe(false);
  });

  it("anything that is not a weapon (spells, nothing) is not melee", () => {
    expect(isMeleeAttack({ type: "spell", system: {} })).toBe(false);
    expect(isMeleeAttack(null)).toBe(false);
  });
});

describe("getEventMacroUuid", () => {
  it("reads and trims the setting; unknown events and read errors give an empty string", () => {
    settingValue = "  Macro.abc  ";
    expect(getEventMacroUuid(COMBAT_EVENT.MELEE_MISS)).toBe("Macro.abc");
    expect(getEventMacroUuid("nope")).toBe("");
    global.game.settings.get = () => { throw new Error("not registered"); };
    expect(getEventMacroUuid(COMBAT_EVENT.MELEE_MISS)).toBe("");
  });
});

describe("fireCombatEvent", () => {
  const ctx = {
    actor: { uuid: "Actor.a" },
    weapon: { uuid: "Actor.a.Item.w" },
    attackerToken: { document: { uuid: "Scene.s.Token.t1" } },
    defenderToken: { document: { uuid: "Scene.s.Token.t2" } }
  };

  it("asks for a GM-side run with plain uuids when a macro is configured", async () => {
    const runner = jest.fn(async () => {});
    await fireCombatEvent(COMBAT_EVENT.MELEE_MISS, ctx, { runner });
    expect(runner).toHaveBeenCalledWith({
      event: "meleeMiss",
      macroUuid: "Macro.abc",
      actorUuid: "Actor.a",
      weaponUuid: "Actor.a.Item.w",
      attackerTokenUuid: "Scene.s.Token.t1",
      defenderTokenUuid: "Scene.s.Token.t2"
    });
  });

  it("does nothing when no macro is configured", async () => {
    settingValue = "";
    const runner = jest.fn();
    await fireCombatEvent(COMBAT_EVENT.MELEE_MISS, ctx, { runner });
    expect(runner).not.toHaveBeenCalled();
  });

  it("never throws, even if the run fails", async () => {
    const runner = jest.fn(async () => { throw new Error("socket down"); });
    await expect(fireCombatEvent(COMBAT_EVENT.MELEE_MISS, ctx, { runner })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("copes with a missing target token", async () => {
    const runner = jest.fn(async () => {});
    await fireCombatEvent(COMBAT_EVENT.MELEE_MISS, { actor: ctx.actor }, { runner });
    expect(runner.mock.calls[0][0].defenderTokenUuid).toBeNull();
  });
});

describe("runCombatEventMacro (GM side)", () => {
  const execute = jest.fn(async () => {});
  const docs = {
    "Macro.abc": { documentName: "Macro", execute },
    "Actor.a": { id: "actor" },
    "Actor.a.Item.w": { id: "weapon" },
    "Scene.s.Token.t1": { object: { id: "atk", actor: { id: "tokenActor" } } },
    "Scene.s.Token.t2": { object: { id: "def" } }
  };

  beforeEach(() => {
    execute.mockClear();
    global.fromUuid = jest.fn(async (uuid) => docs[uuid] ?? null);
  });

  const data = {
    event: "meleeMiss", macroUuid: "Macro.abc", actorUuid: "Actor.a", weaponUuid: "Actor.a.Item.w",
    attackerTokenUuid: "Scene.s.Token.t1", defenderTokenUuid: "Scene.s.Token.t2"
  };

  it("runs the macro with the attacker as token and the defender as target", async () => {
    await runCombatEventMacro(data);
    expect(execute).toHaveBeenCalledWith({
      event: "meleeMiss",
      actor: { id: "actor" },
      weapon: { id: "weapon" },
      token: docs["Scene.s.Token.t1"].object,
      target: docs["Scene.s.Token.t2"].object,
      targets: [docs["Scene.s.Token.t2"].object]
    });
  });

  it("warns and runs nothing when the uuid is not a macro", async () => {
    await runCombatEventMacro({ ...data, macroUuid: "Actor.a" });
    expect(execute).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });

  it("tokens on another scene come through as null instead of failing", async () => {
    docs["Scene.s.Token.t2"] = { object: null };
    await runCombatEventMacro(data);
    expect(execute.mock.calls[0][0].target).toBeNull();
    expect(execute.mock.calls[0][0].targets).toEqual([]);
    docs["Scene.s.Token.t2"] = { object: { id: "def" } };
  });

  it("a failing macro is logged, not thrown", async () => {
    execute.mockRejectedValueOnce(new Error("boom"));
    await expect(runCombatEventMacro(data)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
