/**
 * Tracks combat statistics per player character during an encounter.
 * On combat end, shows a summary: crits inflicted/received, HP inflicted/received, kills.
 *
 * @author RMSS
 */
import Utils from "../utils.js";

export class CombatHistoryTracker {
    static instance = null;

    constructor() {
        if (CombatHistoryTracker.instance) return CombatHistoryTracker.instance;
        this._combatStats = new Map(); // combatId -> Map<actorId, Stats>
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

    _ensureCombat(combatId) {
        if (!this._combatStats.has(combatId)) {
            this._combatStats.set(combatId, new Map());
        }
        return this._combatStats.get(combatId);
    }

    _ensureActorStats(combatMap, actorId) {
        if (!combatMap.has(actorId)) {
            combatMap.set(actorId, {
                critsInflicted: 0,
                critsReceived: 0,
                hpInflicted: 0,
                hpReceived: 0,
                kills: 0,
                hpByDefender: {},      // defenderId -> total HP inflicted
                hpFromAttacker: {},    // attackerId -> total HP received
                critsBySeverityInflicted: {},  // E -> 2, A -> 1
                critsBySeverityReceived: {},
                killsList: []          // { defenderId, defenderName, attackerId }
            });
        }
        return combatMap.get(actorId);
    }

    _isPC(actorId) {
        return !!Utils.isAPC(actorId);
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
        const combatId = game.combat.id;
        const combatMap = this._ensureCombat(combatId);

        this._lastAttackerByDefender.set(defenderId, attackerId);

        const attackerStats = this._ensureActorStats(combatMap, attackerId);
        const defenderStats = this._ensureActorStats(combatMap, defenderId);

        if (this._isPC(attackerId)) {
            attackerStats.hpInflicted += amount;
            attackerStats.hpByDefender[defenderId] = (attackerStats.hpByDefender[defenderId] || 0) + amount;
        }
        if (this._isPC(defenderId)) {
            defenderStats.hpReceived += amount;
            defenderStats.hpFromAttacker[attackerId] = (defenderStats.hpFromAttacker[attackerId] || 0) + amount;
        }

        if (defenderDied && this._isPC(attackerId)) {
            attackerStats.kills += 1;
            const defenderName = game.actors.get(defenderId)?.name ?? "?";
            attackerStats.killsList.push({ defenderId, defenderName, attackerId });
            this._defendersKilledByDamage.add(defenderId); // avoid double-count when updateCombatant fires
        }
    }

    /**
     * Record a critical hit dealt/received.
     * @param {string} [severity] - A, B, C, D, E (null/undefined = HP-only, not counted in severity breakdown)
     */
    recordCritical(attackerId, defenderId, severity = null) {
        if (!game.combat?.id) return;
        const combatMap = this._ensureCombat(game.combat.id);

        const attackerStats = this._ensureActorStats(combatMap, attackerId);
        const defenderStats = this._ensureActorStats(combatMap, defenderId);

        const sev = severity && /^[A-E]$/i.test(severity) ? severity.toUpperCase() : null;

        if (this._isPC(attackerId)) {
            attackerStats.critsInflicted += 1;
            if (sev) {
                attackerStats.critsBySeverityInflicted[sev] = (attackerStats.critsBySeverityInflicted[sev] || 0) + 1;
            }
        }
        if (this._isPC(defenderId)) {
            defenderStats.critsReceived += 1;
            if (sev) {
                defenderStats.critsBySeverityReceived[sev] = (defenderStats.critsBySeverityReceived[sev] || 0) + 1;
            }
        }
    }

    /**
     * Record a kill. Used when death is detected elsewhere (e.g. manual GM toggle).
     */
    recordKill(attackerId, defenderId) {
        if (!game.combat?.id) return;
        const combatMap = this._ensureCombat(game.combat.id);
        const attackerStats = this._ensureActorStats(combatMap, attackerId);
        if (this._isPC(attackerId)) {
            attackerStats.kills += 1;
            const defenderName = game.actors.get(defenderId)?.name ?? "?";
            attackerStats.killsList.push({ defenderId, defenderName, attackerId });
        }
        this._lastAttackerByDefender.delete(defenderId);
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
        this._ensureCombat(combat.id);
    }

    /**
     * Get stats for combat and clear. Returns Map<actorId, Stats> for PC combatants.
     */
    getAndClearStats(combatId) {
        const combatMap = this._combatStats.get(combatId);
        this._combatStats.delete(combatId);
        this._lastAttackerByDefender.clear();
        this._defendersKilledByDamage.clear();
        return combatMap ?? new Map();
    }
}
