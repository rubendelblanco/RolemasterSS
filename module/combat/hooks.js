import { RMSSCombat } from "./rmss_combat.js";
import {RMSSWeaponSkillManager} from "./rmss_weapon_skill_manager.js";

export function registerCombatHooks() {
    Hooks.on("hoverToken", (token, hovered) => {
        if (hovered) {
            // Safety check: ensure token has an actor with effects initialized
            if (!token?.actor || token.actor.effects === undefined) {
                return;
            }
            
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

        } else {
            const existingTooltip = document.querySelector(".tooltip");
            if (existingTooltip) existingTooltip.remove();
            if (window._tooltipMoveHandler) {
                document.removeEventListener("mousemove", window._tooltipMoveHandler);
                delete window._tooltipMoveHandler;
            }
            delete window._activeTooltip;
        }

    });

    // Hide critical roll button if is not owner
    Hooks.on("renderChatMessage", (message, html, data) => {
        html.find(".chat-critical-roll").each(function () {
            const attackerId = this.dataset.attacker;
            const actor = game.actors.get(attackerId);
            if (!actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                this.remove();
            }
        });

        // Weapon fumble: Mounted? checkbox only visible to GM
        const mountedCheck = html.find(".weapon-fumble-mounted-check");
        if (!game.user.isGM) {
            mountedCheck.remove();
        } else {
            mountedCheck.find("input[data-action='toggle-mounted']").on("change", async (ev) => {
            const msg = message;
            const flags = msg.getFlag("rmss", "weaponFumble");
            if (!flags) return;
            const useMounted = !!ev.currentTarget.checked;
            const templateData = { ...flags, useMounted };
            const htmlContent = await renderTemplate("systems/rmss/templates/chat/weapon-fumble-result.hbs", templateData);
            await msg.update({ content: htmlContent, "flags.rmss.weaponFumble.useMounted": useMounted });
        });
        }
    });

    Hooks.on("rmssItemUsed", async (item) => {
        if (item.type === "skill") {
            const ManeuverService = (await import("../core/skills/maneuver_service.js")).default;
            await ManeuverService.rollManeuver(item.actor, item);
            return;
        }
        if (!["weapon", "creature_attack"].includes(item.type)) return;

        const targets = RMSSCombat?.getTargets();
        const enemy = targets?.[0];
        if (!enemy) return ui.notifications.warn("No target selected.");

        const attackerToken = canvas.tokens.controlled.length === 1 ? canvas.tokens.controlled[0] : null;
        const defenderToken = enemy;
        await RMSSWeaponSkillManager.handleAttack(item.actor, enemy.actor, item, attackerToken, defenderToken);
    });

    Hooks.on("updateCombat", async (combat, update) => {
        // Solo cuando cambia el número de ronda
        if (!("round" in update)) return;

        for (const combatant of combat.combatants) {
            const actor = combatant.actor;
            const move = actor?.system?.attributes.movement_rate;
            if (!move) continue;

            await actor.update({ "system.attributes.movement_rate.current": move.value });
        }

        ui.notifications.info("⚔️ Se ha restaurado el movimiento de todos los personajes.");
    });

    Hooks.on("preUpdateToken", (tokenDoc, data) => {
        if (!game.combat?.started) return;
        if (data.x === undefined && data.y === undefined) return;

        const actor = tokenDoc.actor;
        const move = actor?.system?.attributes?.movement_rate;
        if (!move) return;

        const start = { x: tokenDoc.x, y: tokenDoc.y };
        const end   = { x: data.x ?? tokenDoc.x, y: data.y ?? tokenDoc.y };
        const ray = new Ray(start, end);
        const distances = canvas.grid.measureDistances([{ ray }], { gridSpaces: true });
        const distance = distances[0];
        const remaining = Math.round(move.current || 0);

        if (distance > remaining) {
            ui.notifications.error(
                `${actor.name} no puede moverse tan lejos (${distance.toFixed(1)} / ${remaining} pies disponibles).`
            );
            return false;
        }

        const newRemaining = Math.max(remaining - Math.round(distance), 0);
        actor.update({ "system.attributes.movement_rate.current": newRemaining });
    });

}







