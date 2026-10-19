/**
 * Order of development costs, cheapest first.
 *
 * A cost like "2/5" is a list: the first rank of a level costs 2, the second 5. They are compared by their first number,
 * then by the second, and so on: "2/5" is cheaper than "3/8", "4/10" than "4/12". A cost with fewer numbers than the
 * other counts as dearer when all the numbers they share are equal ("4/10" comes before a plain "4", which only allows
 * one rank per level). A cost that can't be read counts as 5.
 */

/** The numbers of a cost, in order: "2/5" -> [2, 5], "4" -> [4], 3 -> [3]. */
export function costNumbers(cost) {
    if (typeof cost === "number") return Number.isFinite(cost) ? [cost] : [5];
    const numbers = String(cost ?? "")
        .split("/")
        .map((part) => parseFloat(part.trim()))
        .filter((n) => Number.isFinite(n));
    return numbers.length ? numbers : [5];
}

/** Comparison for Array#sort: negative when `a` is cheaper than `b`. */
export function compareDevelopmentCosts(a, b) {
    const x = costNumbers(a);
    const y = costNumbers(b);
    const length = Math.max(x.length, y.length);
    for (let i = 0; i < length; i++) {
        const left = x[i] ?? Infinity;
        const right = y[i] ?? Infinity;
        if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
}
