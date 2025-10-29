/**
 * RollService
 * Rolemaster-compatible d100 open-ended rolls for Foundry VTT v13+.
 * - Uses native exploding syntax so Dice So Nice can animate the sequence.
 * - Fixes downward open-ended (1–5): subsequent rolls are subtracted (RM logic).
 * - Optional chat output to trigger Dice So Nice via Roll.toMessage().
 */
export default class RollService {

    /**
     * Full open-ended (both directions):
     * - 96–100: explode up (sum)
     * - 1–5: explode down (subtract subsequent rolls)
     */
    static async openEndedD100(options = {}) {
        return this._perform({
            formula: "1d100x>95x<6",
            fixDown: true,
            options
        });
    }

    /**
     * High open-ended only (96–100 explode up).
     */
    static async highOpenEndedD100() {
        return this._perform({
            formula: "1d100x>95",
            fixDown: false
        });
    }

    /**
     * Low open-ended only (1–5 explode down).
     * (RM logic: first roll stays, subsequent rolls are subtracted)
     */
    static async lowOpenEndedD100(options = {}) {
        return this._perform({
            formula: "1d100x<6",
            // In low-only, any explosion is downward; apply fix-down always.
            fixDown: true,
            forceDown: true
        });
    }

    /**
     * Shared implementation.
     * @param {Object} cfg
     * @param {string} cfg.formula - Foundry formula with explode flags.
     * @param {boolean} cfg.fixDown - If true, apply RM downward subtraction when needed.
     * @param {boolean} [cfg.forceDown=false] - Treat explosion direction as down regardless of first roll.
     */
    static async _perform({ formula, fixDown, forceDown = false }) {

        // 1) Evaluate native roll so Dice So Nice can animate the chain
        const roll = new Roll(formula);
        await roll.evaluate();

        // 2) Inspect raw results and detect direction
        //    NOTE: terms[0] is the d100 term; results[] are the chained results.
        const results = roll.terms?.[0]?.results?.map(r => r.result) ?? [];
        const first = results[0] ?? 0;

        // Determine direction (up / down / none)
        let direction = "none";
        if (forceDown) {
            direction = "down";
        } else if (first >= 96) {
            direction = "up";
        } else if (first <= 5) {
            direction = "down";
        }

        // 3) Compute RM-corrected total when downward explosions must be subtracted
        let total = roll.total;
        if (fixDown && direction === "down" && results.length > 1) {
            // RM rule: keep first roll, subtract the sum of the rest
            total = results[0] - results.slice(1).reduce((a, b) => a + b, 0);
            // Override internal total so ChatMessage shows the corrected value
            roll._total = total; // Foundry Roll uses _total as backing for total getter
        }

        // 4) Build readable chain for UI
        const arrow = direction === "down" ? "↓" : direction === "up" ? "↑" : "→";
        const details = results.join(` ${arrow} `);

        return { roll, total, results, direction, details };
    }

    /**
     * Convenience formatter for applying a modifier (e.g., OB-DB diff) to a roll result.
     * @param {{ total:number, details:string }} rollData
     * @param {number} diff
     * @returns {{ base:number, total:number, text:string }}
     */
    static formatRollResult(rollData, diff = 0) {
        const base = rollData.total;
        const total = base + diff;
        const text = `${rollData.details} ${diff >= 0 ? "+" : ""}${diff} = <b>${total}</b>`;
        return { base, total, text };
    }
}
