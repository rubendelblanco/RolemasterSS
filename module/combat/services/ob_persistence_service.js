/**
 * Servicio de persistencia de OB (bonificación ofensiva) gastado por combatiente en cada round.
 * El OB se comparte entre ataques y paradas; se resetea al cambiar de round.
 */
export default class OBPersistenceService {
    static FLAG_OB_USED = "obUsedByCombatant";

    /**
     * Obtiene el OB ya gastado por un combatiente en el round actual.
     * @param {Combat} combat
     * @param {string} combatantId
     * @returns {number}
     */
    static getObUsed(combat, combatantId) {
        if (!combat || !combatantId) return 0;
        const data = combat.getFlag?.("rmss", OBPersistenceService.FLAG_OB_USED) ?? combat.flags?.rmss?.[OBPersistenceService.FLAG_OB_USED] ?? {};
        return data[combatantId] ?? 0;
    }

    /**
     * Suma OB gastado al combatiente en el round actual.
     * @param {Combat} combat
     * @param {string} combatantId
     * @param {number} amount
     */
    static async addObUsed(combat, combatantId, amount) {
        if (!combat || !combatantId) return;
        const existing = combat.getFlag?.("rmss", OBPersistenceService.FLAG_OB_USED) ?? combat.flags?.rmss?.[OBPersistenceService.FLAG_OB_USED] ?? {};
        const current = existing[combatantId] ?? 0;
        const updated = { ...existing, [combatantId]: current + amount };
        await combat.setFlag("rmss", OBPersistenceService.FLAG_OB_USED, updated);
    }

    /**
     * Resetea todo el OB gastado (llamar al cambiar de round).
     * @param {Combat} combat
     */
    static async resetObUsed(combat) {
        if (!combat) return;
        await combat.unsetFlag("rmss", OBPersistenceService.FLAG_OB_USED);
    }

    /**
     * Obtiene el combatantId del actor en el combate actual.
     * @param {Combat|null} combat
     * @param {Actor} actor
     * @returns {string|null}
     */
    static getCombatantIdForActor(combat, actor) {
        if (!combat || !actor) return null;
        const actorId = actor.id ?? actor._id;
        const combatant = Array.from(combat.combatants ?? []).find(c => (c.actorId ?? c.actor?.id) === actorId);
        return combatant?.id ?? null;
    }
}
