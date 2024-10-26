// Escuchar el evento 'click' en el botón del chat
import {RMSSWeaponCriticalManager} from "../combat/rmss_weapon_critical_manager.js";
Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".chat-critical-roll").click(async ev => {
        ev.preventDefault();
        const enemyId = ev.currentTarget.dataset.enemy;
        const damage = ev.currentTarget.dataset.damage;
        const severity = ev.currentTarget.dataset.severity;
        const critType = ev.currentTarget.dataset.crittype;
        await RMSSWeaponCriticalManager.sendCriticalMessage(enemyId, damage, severity, critType);
    });
});
