import ParryService from "./services/parry_service.js";
import ParryChat from "./services/parry_chat.js";
import { syncParryEffect } from "./services/parry_effect.js";
import { openParryReserveDialog } from "./dialogs/parry_reserve_dialog.js";
import { isParryEnabled, isParryAutomatic } from "./services/parry_settings.js";

/**
 * Parry reservation plumbing: re-arms reservations as their owner's turn starts, clears them
 * when the encounter ends, and decorates the combat tracker rows (Reserve button + badge).
 */
export function registerParryHooks() {

    // A parry reservation is a standing stance: when its owner's turn starts it is re-armed
    // (defense available again) and its caps re-checked. updateCombat is also the place that sees
    // the very first turn start (combat.startCombat), which the "turn end" tick in
    // combat_turn_tick.js never reports.
    Hooks.on("updateCombat", async (combat, changed) => {
        if (!game.user.isGM || !isParryEnabled()) return;
        if (!("turn" in changed) && !("round" in changed)) return;
        const actor = combat.combatant?.actor;
        if (!actor) return;
        try {
            const outcome = await ParryService.refreshAtTurnStart(actor);
            // A "must parry" victim whose stance was dropped or fell short gets it back at the minimum.
            if (isParryAutomatic()) await ParryService.enforceMustParry(actor, { combatId: combat.id });
            // Remind the owner (whisper) right when they can still change their stance.
            if (outcome === "kept") await ParryChat.postTurnReminder(actor, ParryService.getReservation(actor));
            else if (outcome === "dropped") await ParryChat.postDropped(actor);
        } catch (e) {
            console.error("rmss | parry turn start", e);
        }
    });

    Hooks.on("deleteCombat", async (combat) => {
        if (!game.user.isGM) return;
        for (const combatant of combat.combatants) {
            try {
                await ParryService.clear(combatant.actor, { force: true });
            } catch (e) {
                console.error("rmss | parry cleanup", e);
            }
        }
    });

    // Keep the tracker badge and the token icon in sync when a reservation is made, consumed or
    // dropped. Only the active GM touches the effect, so several GMs don't duplicate it.
    const parryChanged = (changes) => {
        const rmss = changes?.flags?.rmss;
        return !!rmss && ("parry" in rmss || "-=parry" in rmss);
    };
    const onParryChange = (actor) => {
        ui.combat?.render();
        if (!game.user.isActiveGM || !actor) return;
        syncParryEffect(actor).catch((e) => console.error("rmss | parry effect", e));
    };
    Hooks.on("updateActor", (actor, changes) => { if (parryChanged(changes)) onParryChange(actor); });
    Hooks.on("updateToken", (token, changes) => { if (parryChanged(changes?.delta)) onParryChange(token.actor); });

    // "Change or release" button on the turn reminder card.
    Hooks.on("renderChatMessage", (message, html) => {
        html.find(".rmss-parry-open").off("click.rmssParry").on("click.rmssParry", async (event) => {
            event.preventDefault();
            const actor = await fromUuid(event.currentTarget.dataset.actorUuid);
            if (!actor) return;
            const combatant = game.combat?.combatants.find((c) => c.actor?.uuid === actor.uuid) ?? null;
            openParryReserveDialog(actor, { combatant });
        });
    });

    Hooks.on("renderCombatTracker", (app, html) => {
        const root = html instanceof HTMLElement ? html : html?.[0];
        const combat = app.viewed ?? game.combat;
        if (!root || !combat || !isParryEnabled()) return;

        for (const row of root.querySelectorAll(".combatant[data-combatant-id]")) {
            const combatant = combat.combatants.get(row.dataset.combatantId);
            const actor = combatant?.actor;
            if (!actor) continue;

            const reservation = ParryService.getReservation(actor);
            if (reservation) {
                const badge = document.createElement("span");
                badge.className = `rmss-parry-badge${reservation.consumed ? " consumed" : ""}`;
                badge.dataset.tooltip = game.i18n.format(
                    reservation.consumed ? "rmss.parry.badge_tooltip_consumed" : "rmss.parry.badge_tooltip",
                    { points: reservation.points, defense: reservation.defense }
                );
                badge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> +${reservation.defense}`;
                row.querySelector(".token-name .name")?.after(badge);
            }

            if (!combatant.isOwner) continue;
            if (ParryService.getParryCandidates(actor).length === 0) continue;
            const controls = row.querySelector(".combatant-controls");
            if (!controls) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "inline-control combatant-control icon fa-solid fa-shield-halved rmss-parry-button";
            button.dataset.tooltip = "";
            button.setAttribute("aria-label", game.i18n.localize("rmss.parry.button_tooltip"));
            button.addEventListener("click", (event) => {
                // The row itself activates the combatant on click; this button must not.
                event.preventDefault();
                event.stopPropagation();
                openParryReserveDialog(actor, { combatant });
            });
            controls.prepend(button);
        }
    });
}
