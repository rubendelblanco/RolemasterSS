/**
 * Tracks combat statistics per player character during an encounter.
 * On combat end, shows a summary: crits inflicted/received, HP inflicted/received, kills.
 * Stats are persisted in combat flags for multiplayer sync.
 *
 * @author RMSS
 */
import Utils from "../utils.js";
import { socket } from "../../rmss.js";

export class CombatHistoryTracker {
    static instance = null;

    constructor() {
        if (CombatHistoryTracker.instance) return CombatHistoryTracker.instance;
        this._lastAttackerByDefender = new Map(); // defenderId -> attackerId (for kill attribution)
        this._defendersKilledByDamage = new Set(); // defenderIds already counted via recordDamage (avoid double-count in hook)
        CombatHistoryTracker.instance = this;
    }

    static get() {
        if (!CombatHistoryTracker.instance) {
            CombatHistoryTracker.instance = new CombatHistoryTracker();
        }
        return CombatHistoryTracker.instance;
    }

    _isEnabled() {
        return game.settings.get("rmss", "enableCombatHistoryTracker") === true;
    }

    _isPC(actorId) {
        return !!Utils.isAPC(actorId);
    }

    _record(op, payload) {
        if (!this._isEnabled() || !game.combat?.id) return;
        socket.executeAsGM("recordCombatStat", game.combat.id, op, payload).catch(() => {});
    }

    /**
     * Record damage dealt. Updates last attacker for kill attribution.
     * Call this before applying damage so we have the attacker when defender dies.
     * @param {string} attackerId - Actor ID of attacker
     * @param {string} defenderId - Actor ID of defender
     * @param {number} amount - HP damage
     * @param {boolean} defenderDied - Whether defender died from this hit
     */
    recordDamage(attackerId, defenderId, amount, defenderDied = false) {
        if (!game.combat?.id) return;

        this._lastAttackerByDefender.set(defenderId, attackerId);

        if (this._isPC(attackerId) || this._isPC(defenderId)) {
            this._record("damage", { attackerId, defenderId, amount, defenderDied });
        }

        if (defenderDied && this._isPC(attackerId)) {
            this._defendersKilledByDamage.add(defenderId);
        }
    }

    /**
     * Record a critical hit dealt/received.
     * @param {string} [severity] - A, B, C, D, E (null/undefined = HP-only, not counted in severity breakdown)
     */
    recordCritical(attackerId, defenderId, severity = null) {
        if (!game.combat?.id) return;

        if (this._isPC(attackerId) || this._isPC(defenderId)) {
            this._record("critical", { attackerId, defenderId, severity });
        }
    }

    /**
     * Record a kill. Used when death is detected elsewhere (e.g. manual GM toggle).
     */
    recordKill(attackerId, defenderId) {
        if (!game.combat?.id) return;

        if (this._isPC(attackerId)) {
            this._record("kill", { attackerId, defenderId });
        }
        this._lastAttackerByDefender.delete(defenderId);
    }

    /**
     * Record a spell cast during combat.
     * @param {string} actorId - Actor ID of caster
     * @param {number} spellLevel - Spell level (PP cost)
     * @param {number} [xpAwarded=0] - XP awarded for this spell (0 if failed/no XP)
     */
    recordSpellCast(actorId, spellLevel, xpAwarded = 0) {
        if (!game.combat?.id || !this._isPC(actorId)) return;

        this._record("spell", { actorId, spellLevel, xpAwarded: xpAwarded || 0 });
    }

    /**
     * Get last attacker for a defender (for kill attribution when death from HP-only).
     */
    getLastAttacker(defenderId) {
        return this._lastAttackerByDefender.get(defenderId);
    }

    /**
     * Initialize combat tracking on combat start.
     */
    onCombatStart(combat) {
        if (!combat?.id) return;
        // No-op: stats are now in combat flags
    }

    /**
     * Get stats from combat flags. Returns Map<actorId, Stats> for display.
     * @param {Combat} combat - The combat document (before it is deleted)
     * @returns {Map<string, object>}
     */
    getStatsFromCombat(combat) {
        const raw = combat?.getFlag("rmss", "combatStats") || {};
        return new Map(Object.entries(raw));
    }
}
