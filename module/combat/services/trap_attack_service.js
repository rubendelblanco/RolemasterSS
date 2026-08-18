import Utils from "../../utils.js";
import EquipmentService from "../../actors/services/equipment_service.js";
import { RMSSWeaponSkillManager } from "../rmss_weapon_skill_manager.js";
import { RMSSWeaponCriticalManager } from "../rmss_weapon_critical_manager.js";

/**
 * Fires a hazard/trap attack from scene trigger scripts (native Region Behavior "Execute
 * Script", Monk's Active Tiles, a macro, etc.) through the normal weapon-attack pipeline —
 * same attack-table roll, GM attack confirmation, critical roll/confirmation and Slaying
 * matching as a real weapon attack, no separate trap-only logic to keep in sync.
 *
 * The "trap" is a regular (hidden, not placed on canvas) npc/creature Actor whose attack is
 * whatever it has equipped/available: an equipped "weapon" item (OB/attack table/critical
 * type/Slaying tags define the trap — e.g. "Trap: Spear +50" with a short spear at OB 50), or,
 * for a "creature" actor, a natural "creature_attack" item (e.g. "Trampa de pinchos" with a
 * Spikes attack) — creature_attack items have no equipped flag and no Slaying fields, they're
 * just always-on natural attacks.
 */
export default class TrapAttackService {
    /**
     * @param {string} trapActorId - Actor id of the trap "actor"
     * @param {string|Token|TokenDocument} target - The token that triggered the trap (or its id)
     * @param {string} [weaponItemId] - Pick a specific weapon/creature_attack when the trap actor has more than one; defaults to the first
     * @returns {Promise<void>}
     */
    static async trigger(trapActorId, target, weaponItemId = null) {
        const trapActor = game.actors.get(trapActorId);
        if (!trapActor) {
            ui.notifications.error(`RMSS trap: actor "${trapActorId}" not found.`);
            return;
        }

        const targetToken = TrapAttackService._resolveToken(target);
        const targetActor = targetToken?.actor ?? null;
        if (!targetActor) {
            ui.notifications.error("RMSS trap: could not resolve the triggering token's actor.");
            return;
        }

        const weapon = TrapAttackService._resolveTrapAttack(trapActor, weaponItemId);
        if (!weapon) {
            ui.notifications.error(`RMSS trap: actor "${trapActor.name}" has no equipped weapon nor creature attack.`);
            return;
        }

        if (Utils.isTargetDefeated(targetActor)) return;

        await RMSSWeaponSkillManager.handleAttack(trapActor, targetActor, weapon, null, targetToken);
    }

    /**
     * Fire a critical directly — no attack roll, no OB/DB, just "apply severity X of critical
     * table Y" (e.g. a dart trap: severity "C" on the "P" puncture table). Reuses the same
     * roll-on-the-critical-table + apply-effects code as the GM's manual token-HUD "Effects"
     * button, so it announces in chat and applies ActiveEffects/death the same way a real
     * critical would.
     *
     * Note: large-creature subtypes (magic/mithril/holy/slaying on the superlarge tables)
     * aren't wired into this direct path yet — only plain letter severities (A-E) on a regular
     * critical table (see `CONFIG.rmss.criticalDictionary` for valid critType codes). Use
     * {@link TrapAttackService.trigger} instead if you need Slaying to matter for this trap.
     *
     * @param {string|Token|TokenDocument} target - The token that triggered the trap (or its id)
     * @param {{ severity: string, critType: string, damage?: number, modifier?: number, trapActorId?: string|null }} options
     * @returns {Promise<void>}
     */
    static async triggerCritical(target, { severity, critType, damage = 0, modifier = 0, trapActorId = null }) {
        if (!severity || !critType) {
            ui.notifications.error("RMSS trap: severity and critType are required.");
            return;
        }

        const targetToken = TrapAttackService._resolveToken(target);
        const targetActor = targetToken?.actor ?? null;
        if (!targetActor) {
            ui.notifications.error("RMSS trap: could not resolve the triggering token's actor.");
            return;
        }

        if (Utils.isTargetDefeated(targetActor)) return;

        const gmResponse = { severity, critType, modifier, attackerId: trapActorId };
        const result = await RMSSWeaponCriticalManager.updateActorHits(targetToken.id, true, damage, gmResponse);
        if (!result) return;
        await RMSSWeaponCriticalManager.applyCriticalTo(result, targetActor, trapActorId);
    }

    /**
     * Equipped "weapon" items first, then natural "creature_attack" items (ordered like the
     * creature sheet does), so an npc-style trap with a weapon and a creature-style trap with
     * a natural attack both work through the same call.
     */
    static _resolveTrapAttack(trapActor, weaponItemId) {
        const weapons = EquipmentService.getEquippedWeapons(trapActor);
        const creatureAttacks = trapActor.items
            .filter((i) => i.type === "creature_attack")
            .sort((a, b) => (Number(a.system?.order) || 0) - (Number(b.system?.order) || 0));
        const candidates = [...weapons, ...creatureAttacks];
        if (weaponItemId) {
            return candidates.find((w) => (w.id ?? w._id) === weaponItemId) ?? null;
        }
        return candidates[0] ?? null;
    }

    /** @param {string|Token|TokenDocument} target */
    static _resolveToken(target) {
        if (!target) return null;
        if (typeof target === "string") return canvas.tokens?.get(target) ?? canvas.scene?.tokens?.get(target) ?? null;
        return target;
    }
}
