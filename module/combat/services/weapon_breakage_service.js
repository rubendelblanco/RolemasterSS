/**
 * Weapon breakage: a natural "double" (11, 22, 33, ... 99) whose repeated digit falls within
 * the weapon's breakage_range ("lo-hi", e.g. "1-3" covers 11/22/33) triggers a silent 1d100 +
 * weapon.system.strength check. Below 100 total, the weapon breaks (system.broken = true) and
 * can no longer be used to attack (see RMSSItem#use).
 */
export default class WeaponBreakageService {

    /**
     * @param {number} naturalRoll - the natural (un-exploded) attack roll, 1-100
     * @param {string} breakageRange - e.g. "1-3" (also accepts a bare single digit, "3")
     * @returns {boolean}
     */
    static isBreakageTrigger(naturalRoll, breakageRange) {
        const range = String(breakageRange ?? "").trim();
        if (!range) return false;

        const parts = range.split("-").map((s) => parseInt(s.trim(), 10));
        const lo = parts[0];
        const hi = Number.isFinite(parts[1]) ? parts[1] : lo;
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;

        if (!Number.isFinite(naturalRoll) || naturalRoll % 11 !== 0) return false;
        const digit = naturalRoll / 11; // 11->1, 22->2, ..., 99->9
        if (digit < 1 || digit > 9) return false;

        return digit >= Math.min(lo, hi) && digit <= Math.max(lo, hi);
    }

    /**
     * A weapon only participates in the breakage mechanic when BOTH strength and breakage_range
     * actually carry data. Leaving either blank (0/""/null/undefined) opts the weapon out
     * entirely - the escape hatch for things like unarmed/martial-arts strikes that shouldn't be
     * able to "break" at all, rather than always favoring survival via a 0 strength.
     * @param {Item} weapon
     * @returns {boolean}
     */
    static hasBreakageData(weapon) {
        const hasStrength = Number(weapon?.system?.strength) > 0;
        const hasRange = String(weapon?.system?.breakage_range ?? "").trim() !== "";
        return hasStrength && hasRange;
    }

    /**
     * The silent check roll itself: 1d100 + weapon strength, breaks below 100. No dice3d
     * animation - this is meant to happen quietly in the background of the normal attack roll.
     * @param {Item} weapon
     * @returns {Promise<{ broke: boolean, naturalRoll: number, strength: number, total: number }>}
     */
    static async rollBreakageCheck(weapon) {
        const strength = Number(weapon.system?.strength) || 0;
        const roll = new Roll("1d100");
        await roll.evaluate();
        const total = roll.total + strength;
        const broke = total < 100;
        if (broke) {
            await weapon.update({ "system.broken": true });
        }
        return { broke, naturalRoll: roll.total, strength, total };
    }

    /**
     * Full check for an attack: skip non-weapons, already-broken weapons, and non-triggering
     * rolls; otherwise roll the check and announce breakage in chat (silent when it survives).
     * @param {Item} weapon
     * @param {number} naturalRoll
     * @param {Actor} actor
     */
    static async maybeCheckBreakage(weapon, naturalRoll, actor) {
        if (weapon?.type !== "weapon") return;
        if (weapon.system?.broken) return;
        if (!this.hasBreakageData(weapon)) return;
        if (!this.isBreakageTrigger(naturalRoll, weapon.system?.breakage_range)) return;

        const { broke } = await this.rollBreakageCheck(weapon);
        if (broke) {
            const content = `
                <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                        <div style="color: #fff; font-weight: 600;">${actor.name}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <img src="${weapon.img}" alt="${weapon.name}" width="32" height="32" style="border-radius: 4px; border: 1px solid #333;">
                        <b style="color: #ff8a80;">${weapon.name} ${game.i18n.localize("rmss.combat.weapon_broke")}</b>
                    </div>
                </div>
            `;
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content
            });
        }
    }
}
