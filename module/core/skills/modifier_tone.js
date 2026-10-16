/**
 * Colour of a modifier shown in a dialog, so what helps and what hurts stands out before rolling: green when it
 * is positive, red when it is negative, grey when it is zero.
 */
export const MODIFIER_COLOR = Object.freeze({ POSITIVE: "#1f7a1f", NEGATIVE: "#cc0000", NEUTRAL: "#555" });

/** @param {number} value */
export function modifierColor(value) {
    const n = Number(value) || 0;
    if (n > 0) return MODIFIER_COLOR.POSITIVE;
    if (n < 0) return MODIFIER_COLOR.NEGATIVE;
    return MODIFIER_COLOR.NEUTRAL;
}

/** Inline style for a modifier line: coloured, and bold when it is not zero. */
export function modifierStyle(value) {
    const n = Number(value) || 0;
    return `color:${modifierColor(n)};${n !== 0 ? " font-weight:600;" : ""}`;
}
