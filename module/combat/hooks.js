import { RMSSCombat } from "./rmss_combat.js";
import {RMSSWeaponSkillManager} from "./rmss_weapon_skill_manager.js";

Hooks.on("hoverToken", (token, hovered) => {
    if (hovered) {
        let effectInfo = {};

        for (let effect of token.actor.effects) {
            const iconPath = effect.img;

            if (effect.name === "Stunned" || effect.name === "Parry" || effect.name === "No parry") {
                if (!effectInfo[iconPath]) {
                    effectInfo[iconPath] = effect.duration.rounds
                } else {
                    effectInfo[iconPath] = parseInt(effectInfo[iconPath]) + parseInt(effect.duration.rounds)
                }
            }

            if (effect.name === "Bleeding") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath].push(-effect.flags.rmss.value);
            }

            if (effect.name === "Penalty") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath].push(effect.flags.rmss.value);
            }

            if (effect.name === "Bonus") {
                if (!effectInfo[iconPath]) effectInfo[iconPath] = [];
                effectInfo[iconPath] = effect.duration.rounds + " (" + effect.flags.rmss.value + ")";
            }

        }

        if (Object.keys(effectInfo).length > 0) {
            const entries = Object.entries(effectInfo);
            let rows = "";

            for (let i = 0; i < entries.length; i += 2) {
                const [iconPath1, value1] = entries[i];
                const [iconPath2, value2] = entries[i + 1] || [null, null];

                rows += `
            <tr>
                <td><img src="${iconPath1}" width="20" height="20" style="vertical-align: middle;"></td>
                <td style="text-align: left;">${value1}</td>
                ${iconPath2 ? `
                    <td><img src="${iconPath2}" width="20" height="20" style="vertical-align: middle;"></td>
                    <td style="text-align: left;">${value2}</td>
                ` : "<td colspan='2'></td>"}
            </tr>
        `;
            }

            const tooltip = document.createElement("div");
            tooltip.classList.add("tooltip");
            tooltip.style.position = "absolute";
            tooltip.style.zIndex = "1000";
            tooltip.style.padding = "5px";
            tooltip.style.background = "black";
            tooltip.style.color = "white"; // blanco, sin azul
            tooltip.style.border = "1px solid white";
            tooltip.style.borderRadius = "5px";
            tooltip.innerHTML = `<table>${rows}</table>`;

            document.body.appendChild(tooltip);

            window._activeTooltip = tooltip;

            document.addEventListener("mousemove", window._tooltipMoveHandler = function (event) {
                tooltip.style.left = (event.pageX + 15) + "px";
                tooltip.style.top = (event.pageY + 15) + "px";
            });
        }

    }
    else {
        const existingTooltip = document.querySelector(".tooltip");
        if (existingTooltip) existingTooltip.remove();
        if (window._tooltipMoveHandler) {
            document.removeEventListener("mousemove", window._tooltipMoveHandler);
            delete window._tooltipMoveHandler;
        }
        delete window._activeTooltip;
    }

});

//Hide critical roll button if is not owner
Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".chat-critical-roll").each(function () {
        const attackerId = this.dataset.attacker;
        const actor = game.actors.get(attackerId);
        if (!actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
            this.remove();
        }
    });
});


Hooks.on("rmssItemUsed", async (item) => {
    if (!["weapon", "creature_attack"].includes(item.type)) return;

    const enemy = RMSSCombat?.getTargets()?.[0];
    if (!enemy) return ui.notifications.warn("No target selected.");

    await RMSSWeaponSkillManager.handleAttack(item.actor, enemy.actor, item);
});

