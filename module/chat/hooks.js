// Escuchar el evento 'click' en el botón del chat
import {RMSSWeaponCriticalManager} from "../combat/rmss_weapon_critical_manager.js";
import {RMSSCombat} from "../combat/rmss_combat.js";
Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".chat-critical-roll").click(async ev => {
        ev.preventDefault();
        const enemy = RMSSCombat.getTargets()[0].actor;
        const damage = ev.currentTarget.dataset.damage;
        const severity = ev.currentTarget.dataset.severity;
        const critType = ev.currentTarget.dataset.crittype;
        const attackerId = ev.currentTarget.dataset.attacker;
        const criticalResult = await RMSSWeaponCriticalManager.sendCriticalMessage(enemy, damage, severity, critType);
        await RMSSWeaponCriticalManager.applyCriticalToEnemy(criticalResult, enemy, attackerId);
    });
});
