/**
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from "@jest/globals";
import { getParryMode, isParryEnabled, isParryAutomatic, isShieldFacingEnabled } from "../module/combat/services/parry_settings.js";

const withMode = (value) => { global.game = { settings: { get: () => value } }; };
afterEach(() => { delete global.game; });

describe("parry safety switch", () => {
  it("full: everything is on", () => {
    withMode("full");
    expect(getParryMode()).toBe("full");
    expect([isParryEnabled(), isParryAutomatic(), isShieldFacingEnabled()]).toEqual([true, true, true]);
  });

  it("manual: parry exists as a record, but nothing is automatic; shields still follow facing", () => {
    withMode("manual");
    expect([isParryEnabled(), isParryAutomatic(), isShieldFacingEnabled()]).toEqual([true, false, true]);
  });

  it("off: no parry features and shields count regardless of facing", () => {
    withMode("off");
    expect([isParryEnabled(), isParryAutomatic(), isShieldFacingEnabled()]).toEqual([false, false, false]);
  });

  it("falls back to full if the setting is missing or holds a bad value", () => {
    withMode("nonsense");
    expect(getParryMode()).toBe("full");
    global.game = { settings: { get: () => { throw new Error("not registered"); } } };
    expect(getParryMode()).toBe("full");
    delete global.game;
    expect(getParryMode()).toBe("full");
  });
});
