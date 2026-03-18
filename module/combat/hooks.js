import { RMSSCombat } from "./rmss_combat.js";
import { RMSSWeaponSkillManager } from "./rmss_weapon_skill_manager.js";
import { CombatHistoryTracker } from "./combat_history_tracker.js";
import { RMSSEffectApplier } from "./rmss_effect_applier.js";
import ExperiencePointsCalculator from "../sheets/experience/rmss_experience_manager.js";

export function registerCombatHooks() {
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

    // When GM manually toggles Defeated on a combatant, show "Who defeated?" dialog
    Hooks.on("updateCombatant", async (combatant, change) => {
        if (!("defeated" in change) || !change.defeated) return;
        if (!game.combat?.id || combatant.parent?.id !== game.combat.id) return;

        const defenderId = combatant.actorId;
        if (!defenderId) return;

        const tracker = CombatHistoryTracker.get();
        if (tracker._defendersKilledByDamage.has(defenderId)) {
            tracker._defendersKilledByDamage.delete(defenderId);
            return; // already counted via recordDamage, XP already awarded
        }

        const defenderActor = combatant.actor;
        const defenderName = defenderActor?.name ?? "?";
        const token = combatant.token;
        if (!token) return;

        if (defenderActor?.type === "character") {
            await RMSSEffectApplier._markTokenAsDead(token, null);
            return;
        }

        const combat = combatant.parent;
        const pcCombatants = combat.combatants.filter(c => c.actor?.type === "character");
        const options = pcCombatants.map(c => ({
            value: c.actor?.id ?? "",
            label: c.actor?.name ?? c.name ?? "?"
        })).filter(o => o.value);
        options.push({ value: "__other__", label: game.i18n.localize("rmss.combat.who_defeated.other") });

        const lastAttackerId = tracker.getLastAttacker(defenderId);
        const defaultVal = (lastAttackerId && options.some(o => o.value === lastAttackerId))
            ? lastAttackerId
            : (options[0]?.value ?? "__other__");

        const content = `
            <form class="who-defeated-dialog">
                <p>${game.i18n.format("rmss.combat.who_defeated.title", { name: defenderName })}</p>
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.combat.who_defeated.label")}</label>
                    <select name="defeater" data-dtype="String">
                        ${options.map(o => `<option value="${o.value}" ${o.value === defaultVal ? "selected" : ""}>${o.label}</option>`).join("")}
                    </select>
                </div>
            </form>
        `;

        const doMarkAsDead = async (expData) => {
            await RMSSEffectApplier._markTokenAsDead(token, expData);
        };

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.who_defeated.dialog_title"),
                content,
                default: "confirm",
                buttons: {
                    confirm: {
                        icon: "<i class='fas fa-check'></i>",
                        label: game.i18n.localize("rmss.combat.who_defeated.confirm"),
                        callback: async (html) => {
                            const selected = html.find("[name=defeater]").val();
                            if (selected && selected !== "__other__") {
                                const killer = game.actors.get(selected);
                                if (killer) {
                                    if (game.settings.get("rmss", "enableCombatHistoryTracker")) {
                                        tracker.recordKill(selected, defenderId);
                                    }
                                    const killExp = ExperiencePointsCalculator.calculateKillExpPoints(
                                        defenderActor?.system?.attributes?.level?.value ?? 0,
                                        killer.system?.attributes?.level?.value ?? 1
                                    );
                                    const code = defenderActor?.system?.bonus_experience ?? null;
                                    const bonusExp = ExperiencePointsCalculator.calculateBonusExpPoints(
                                        killer.system?.attributes?.level?.value ?? 1,
                                        code
                                    );
                                    const totalAmountExp = killExp + bonusExp;
                                    const totalExpActor = parseInt(killer.system?.attributes?.experience_points?.value || 0) + totalAmountExp;
                                    await killer.update({ "system.attributes.experience_points.value": totalExpActor });
                                    const expData = {
                                        actorName: killer.name,
                                        actorId: killer.id,
                                        expBreakdown: { kill: killExp, bonus: bonusExp },
                                        expGained: totalAmountExp
                                    };
                                    await doMarkAsDead(expData);
                                } else {
                                    await doMarkAsDead(null);
                                }
                            } else {
                                await doMarkAsDead(null);
                            }
                            resolve();
                        }
                    },
                    cancel: {
                        icon: "<i class='fas fa-times'></i>",
                        label: game.i18n.localize("rmss.combat.cancel"),
                        callback: async () => {
                            await doMarkAsDead(null);
                            resolve();
                        }
                    }
                }
            }, { width: 400 }).render(true);
        });
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







