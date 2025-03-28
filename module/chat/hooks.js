// Escuchar el evento 'click' en el botón del chat
import {RMSSWeaponCriticalManager} from "../combat/rmss_weapon_critical_manager.js";
import {RMSSCombat} from "../combat/rmss_combat.js";
import {socket} from "../../rmss.js";
Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".chat-critical-roll").click(async ev => {
        ev.preventDefault();
        const token = RMSSCombat.getTargets()[0];
        const damage = ev.currentTarget.dataset.damage;
        const severity = ev.currentTarget.dataset.severity;
        const critType = ev.currentTarget.dataset.crittype;
        const attackerId = ev.currentTarget.dataset.attacker;
        const criticalResult = await RMSSWeaponCriticalManager.sendCriticalMessage(token, damage, severity, critType, attackerId);
        await socket.executeAsGM("applyCriticalToEnemy", criticalResult, token.id, attackerId, token instanceof Token);
    });

    html.find('.click-to-toggle').on('click', (event) => {
        const breakdown = html.find('.breakdown-details');
        breakdown.toggle();
    });
});

