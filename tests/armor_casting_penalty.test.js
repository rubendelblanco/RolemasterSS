/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import {
  parseCastingRealms, pickCastingRealm, computeBodyArmorCastingPenalty, computeHelmetCastingPenalty,
  getBodyArmorCastingTableRow, getHelmetCastingTableRow, CASTING_REALM, HELMET_KIND
} from "../module/core/armor/armor_casting_penalty.js";

describe("parseCastingRealms", () => {
  it("reads one or several realms, and arcane counts as essence", () => {
    expect(parseCastingRealms("essence")).toEqual(["essence"]);
    expect(parseCastingRealms("essence/channeling").sort()).toEqual(["channeling", "essence"]);
    expect(parseCastingRealms("Arcane")).toEqual(["essence"]);
    expect(parseCastingRealms("arcane/mentalism").sort()).toEqual(["essence", "mentalism"]);
  });

  it("ignores what it does not know", () => {
    expect(parseCastingRealms("banana")).toEqual([]);
    expect(parseCastingRealms(undefined)).toEqual([]);
  });
});

describe("pickCastingRealm", () => {
  const armor = [CASTING_REALM.ESSENCE, CASTING_REALM.CHANNELING, CASTING_REALM.MENTALISM];
  const helmet = [CASTING_REALM.MENTALISM, CASTING_REALM.ESSENCE, CASTING_REALM.CHANNELING];

  it("with armor, essence is worse than channeling, which is worse than mentalism", () => {
    expect(pickCastingRealm("essence/channeling", armor)).toBe("essence");
    expect(pickCastingRealm("channeling/mentalism", armor)).toBe("channeling");
    expect(pickCastingRealm("essence/mentalism", armor)).toBe("essence");
  });

  it("with a helmet, mentalism is worse than essence, which is worse than channeling", () => {
    expect(pickCastingRealm("essence/mentalism", helmet)).toBe("mentalism");
    expect(pickCastingRealm("essence/channeling", helmet)).toBe("essence");
    expect(pickCastingRealm("channeling/mentalism", helmet)).toBe("mentalism");
  });

  it("a spell that names no known realm is treated as essence", () => {
    expect(pickCastingRealm("", armor)).toBe("essence");
    expect(pickCastingRealm("banana", helmet)).toBe("essence");
  });
});

describe("computeBodyArmorCastingPenalty (Table T-4.6, Armor Status)", () => {
  it("essence is hampered by any armor", () => {
    expect(computeBodyArmorCastingPenalty(5, "essence")).toBe(-10);
    expect(computeBodyArmorCastingPenalty(10, "essence")).toBe(-25);
    expect(computeBodyArmorCastingPenalty(12, "essence")).toBe(-50);
    expect(computeBodyArmorCastingPenalty(20, "essence")).toBe(-90);
  });

  it("channeling only by metal armor (AT 13 and up)", () => {
    expect(computeBodyArmorCastingPenalty(12, "channeling")).toBe(0);
    expect(computeBodyArmorCastingPenalty(13, "channeling")).toBe(-30);
    expect(computeBodyArmorCastingPenalty(16, "channeling")).toBe(-60);
    expect(computeBodyArmorCastingPenalty(20, "channeling")).toBe(-75);
  });

  it("mentalism is never hampered by body armor, not even by an armor's own value", () => {
    for (const at of [1, 9, 20]) expect(computeBodyArmorCastingPenalty(at, "mentalism")).toBe(0);
    expect(computeBodyArmorCastingPenalty(20, "mentalism", { mentalism: -50 })).toBe(0);
  });

  it("no armor (AT 1-4) costs nothing, and an unknown AT counts as none", () => {
    expect(computeBodyArmorCastingPenalty(1, "essence")).toBe(0);
    expect(computeBodyArmorCastingPenalty(4, "essence")).toBe(0);
    expect(computeBodyArmorCastingPenalty(99, "essence")).toBe(0);
    expect(computeBodyArmorCastingPenalty(undefined, "essence")).toBe(0);
  });

  it("arcane spells are hampered like essence", () => {
    expect(computeBodyArmorCastingPenalty(10, "arcane")).toBe(-25);
  });

  it("a spell of two realms takes the worse one for armor", () => {
    expect(computeBodyArmorCastingPenalty(15, "essence/channeling")).toBe(-70);
    expect(computeBodyArmorCastingPenalty(15, "channeling/mentalism")).toBe(-60);
  });

  it("the armor's own value replaces the table's, for that realm only", () => {
    expect(computeBodyArmorCastingPenalty(10, "essence", { essence: -5 })).toBe(-5);
    expect(computeBodyArmorCastingPenalty(10, "essence", { channeling: -50 })).toBe(-25);
    expect(computeBodyArmorCastingPenalty(15, "channeling", { channeling: 10 })).toBe(-10);
    expect(computeBodyArmorCastingPenalty(15, "essence", { essence: 0 })).toBe(0);
  });

  it("empty overrides leave the table in charge", () => {
    expect(computeBodyArmorCastingPenalty(10, "essence", { essence: null })).toBe(-25);
    expect(computeBodyArmorCastingPenalty(10, "essence", { essence: "" })).toBe(-25);
  });
});

describe("computeHelmetCastingPenalty (Table T-4.6, Helmet)", () => {
  it("leather, leather and metal, and metal helmets", () => {
    expect(computeHelmetCastingPenalty(HELMET_KIND.LEATHER, "channeling")).toBe(0);
    expect(computeHelmetCastingPenalty(HELMET_KIND.LEATHER, "essence")).toBe(-20);
    expect(computeHelmetCastingPenalty(HELMET_KIND.LEATHER, "mentalism")).toBe(-30);
    expect(computeHelmetCastingPenalty(HELMET_KIND.MIXED, "channeling")).toBe(-10);
    expect(computeHelmetCastingPenalty(HELMET_KIND.MIXED, "essence")).toBe(-30);
    expect(computeHelmetCastingPenalty(HELMET_KIND.MIXED, "mentalism")).toBe(-40);
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "channeling")).toBe(-20);
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "essence")).toBe(-40);
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "mentalism")).toBe(-60);
  });

  it("a helmet kind it does not know, or none, counts as leather", () => {
    expect(computeHelmetCastingPenalty(undefined, "essence")).toBe(-20);
    expect(computeHelmetCastingPenalty("banana", "mentalism")).toBe(-30);
  });

  it("a spell of two realms takes the worse one for a helmet: mentalism, then essence", () => {
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "essence/mentalism")).toBe(-60);
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "essence/channeling")).toBe(-40);
  });

  it("the helmet's own value replaces the table's", () => {
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "mentalism", { mentalism: -15 })).toBe(-15);
    expect(computeHelmetCastingPenalty(HELMET_KIND.METAL, "mentalism", { channeling: -1 })).toBe(-60);
  });
});

describe("table rows for the sheet placeholders", () => {
  it("body armor never shows a mentalism value", () => {
    expect(getBodyArmorCastingTableRow(15)).toEqual({ channeling: -60, essence: -70, mentalism: 0 });
    expect(getBodyArmorCastingTableRow(99)).toEqual({ channeling: 0, essence: 0, mentalism: 0 });
  });

  it("helmet rows", () => {
    expect(getHelmetCastingTableRow("metal")).toEqual({ channeling: -20, essence: -40, mentalism: -60 });
    expect(getHelmetCastingTableRow(undefined)).toEqual({ channeling: 0, essence: -20, mentalism: -30 });
  });
});
