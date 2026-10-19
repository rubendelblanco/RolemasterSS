/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { costNumbers, compareDevelopmentCosts } from "../module/actors/utils/development_cost_order.js";

const ordenar = (costs) => [...costs].sort(compareDevelopmentCosts);

describe("costNumbers", () => {
  it("the numbers of a cost, in order", () => {
    expect(costNumbers("2/5")).toEqual([2, 5]);
    expect(costNumbers("3/3/3")).toEqual([3, 3, 3]);
    expect(costNumbers("4")).toEqual([4]);
    expect(costNumbers(6)).toEqual([6]);
    expect(costNumbers(" 1 / 5 ")).toEqual([1, 5]);
  });

  it("a cost that can't be read counts as 5", () => {
    expect(costNumbers("")).toEqual([5]);
    expect(costNumbers(undefined)).toEqual([5]);
    expect(costNumbers("abc")).toEqual([5]);
  });
});

describe("compareDevelopmentCosts: cheapest first, by the first number", () => {
  it("2/5 is cheaper than 3/8, whatever their ratio (the case that came out reversed)", () => {
    expect(compareDevelopmentCosts("2/5", "3/8")).toBeLessThan(0);
    expect(ordenar(["3/8", "2/5"])).toEqual(["2/5", "3/8"]);
  });

  it("the Paladin's weapon categories come out in the right order", () => {
    expect(ordenar(["3/8", "2/5", "4", "4", "4", "6", "6"])).toEqual(["2/5", "3/8", "4", "4", "4", "6", "6"]);
  });

  it("the first number decides before the second", () => {
    expect(ordenar(["5/6", "4/20", "1/50"])).toEqual(["1/50", "4/20", "5/6"]);
  });

  it("with the same first number the second one decides", () => {
    expect(ordenar(["4/12", "4/10"])).toEqual(["4/10", "4/12"]);
    expect(ordenar(["3/3/9", "3/3/3"])).toEqual(["3/3/3", "3/3/9"]);
  });

  it("with the same first number, the cost that allows more ranks comes first", () => {
    expect(ordenar(["4", "4/10"])).toEqual(["4/10", "4"]);
  });

  it("a plain number against a slash cost goes by the first number", () => {
    expect(ordenar(["3", "2/9", "10"])).toEqual(["2/9", "3", "10"]);
  });

  it("equal costs are equal", () => {
    expect(compareDevelopmentCosts("2/5", "2/5")).toBe(0);
    expect(compareDevelopmentCosts(4, "4")).toBe(0);
  });
});
