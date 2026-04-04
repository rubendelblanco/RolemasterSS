// Listen for click events on chat buttons
import { RMSSWeaponCriticalManager } from "../combat/rmss_weapon_critical_manager.js";
import { RMSSCombat } from "../combat/rmss_combat.js";
import { socket } from "../../rmss.js";
import {
    getChatMessageFromButton,
    applyCriticalRollChatUI,
    setupCriticalRollGmReroll,
    registerCriticalRollChatMessageFollowUp,
    beginCriticalRollClickLock,
    endCriticalRollClickLock,
    clearCriticalRollPending,
    mergeCriticalSpentSlotFlag,
    CRITICAL_ROLL_PENDING_ATTR
} from "./critical_roll_chat_ui.js";

registerCriticalRollChatMessageFollowUp();

Hooks.on("renderChatMessage", (message, html, data) => {
    // Attacker owner or GM (reroll UI); runs outside combat too (chat/hooks always loads)
    html.find(".chat-critical-roll").each(function () {
        const attackerId = this.dataset.attacker;
        const actor = game.actors.get(attackerId);
        const isOwner = actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        if (!isOwner && !game.user.isGM) {
            this.remove();
        }
    });

    if (html.find(".chat-critical-roll").length) {
        applyCriticalRollChatUI(message);
        setupCriticalRollGmReroll(message, html);
    }

    // One handler per button: without .off(), each renderChatMessage stacks listeners (async / GM).
    const CRIT_CLICK_NS = "click.rmssCriticalRoll";
    html.find(".chat-critical-roll").off(CRIT_CLICK_NS).on(CRIT_CLICK_NS, async (ev) => {
        const button = ev.currentTarget;

        if (button.disabled) {
            ev.preventDefault();
            return;
        }

        const lockKey = beginCriticalRollClickLock(button);
        if (lockKey == null) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            return;
        }

        ev.preventDefault();
        ev.stopImmediatePropagation();

        const originalContent = button.innerHTML;
        const msg = getChatMessageFromButton(button);
        // Stops applyCriticalRollChatUI(message) on re-render from clearing disabled while GM dialog is open
        button.dataset[CRITICAL_ROLL_PENDING_ATTR] = "1";

        try {
        button.disabled = true;
        button.style.opacity = "0.65";
        button.style.cursor = "wait";
        button.innerHTML = `<div class="chat-critical-roll-inner"><div class="chat-critical-roll-main" style="justify-content:center;">
            <span style="font-size:1.1em;">⏱️</span>
            <span>${game.i18n.localize("rmss.combat.awaiting_gm_confirmation")}</span>
        </div></div>`;

        const targetId = ev.currentTarget.dataset.targetId;
        let token = targetId ? canvas.scene?.tokens?.get(targetId) : null;
        if (!token) {
            const targets = Array.from(game.user.targets);
            token = targets?.[0];
        }
        if (!token) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.select_target") || "Please select a target.");
            clearCriticalRollPending(button);
            button.innerHTML = originalContent;
            button.disabled = false;
            button.style.opacity = "1";
            button.style.cursor = "pointer";
            return;
        }
        const damage = ev.currentTarget.dataset.damage;
        const severity = ev.currentTarget.dataset.severity;
        const critType = ev.currentTarget.dataset.crittype;
        const attackerId = ev.currentTarget.dataset.attacker;
        const attackerUuid = ev.currentTarget.dataset.attackerUuid;
        const mainSev = ev.currentTarget.dataset.mainSeverity;
        const ewDup = ev.currentTarget.dataset.effectWeaponDup === "1";
        const ewSecond = ev.currentTarget.dataset.effectWeaponSecond;
        const ewExtraCrit = ev.currentTarget.dataset.effectWeaponExtraCritType;
        const ewRollModRaw = ev.currentTarget.dataset.effectWeaponRollMod;
        const ewRollModifier = ewRollModRaw !== undefined && ewRollModRaw !== "" ? parseInt(ewRollModRaw, 10) : 0;
        const ewSuperiorEChain = ev.currentTarget.dataset.effectWeaponSuperiorEChain === "1";
        const sendOpts = {};
        if (mainSev !== undefined && mainSev !== "") sendOpts.mainSeverity = mainSev;
        if (ewDup || (ewSecond !== undefined && ewSecond !== "") || (ewExtraCrit !== undefined && ewExtraCrit !== "")) {
            sendOpts.effectWeapon = {
                enabled: true,
                duplicatePrimary: ewDup,
                ewRollModifier: Number.isFinite(ewRollModifier) ? ewRollModifier : 0,
                superiorEChain: ewSuperiorEChain,
                ...(ewSecond ? { secondSeverity: ewSecond } : {}),
                ...(ewExtraCrit ? { extraCritType: ewExtraCrit } : {})
            };
        }

        let criticalResult;
        const weaponItemId = ev.currentTarget.dataset.weaponItemId;
        try {
            criticalResult = await RMSSWeaponCriticalManager.sendCriticalMessage(
                token,
                damage,
                severity,
                critType,
                attackerId,
                {
                    ...sendOpts,
                    ...(weaponItemId ? { weaponItemId } : {}),
                    ...(attackerUuid ? { attackerUuid } : {})
                }
            );
        } catch (err) {
            console.error("[RMSS] sendCriticalMessage", err);
            clearCriticalRollPending(button);
            button.innerHTML = originalContent;
            button.disabled = false;
            button.style.opacity = "1";
            button.style.cursor = "pointer";
            return;
        }

        if (!criticalResult) {
            clearCriticalRollPending(button);
            button.innerHTML = originalContent;
            button.disabled = false;
            button.style.opacity = "1";
            button.style.cursor = "pointer";
            return;
        }

        let spentSlotsAfter = null;
        if (msg) {
            const slot = button.dataset.critSlot ?? "0";
            spentSlotsAfter = await mergeCriticalSpentSlotFlag(msg, slot);
        }

        button.innerHTML = originalContent;
        clearCriticalRollPending(button);
        if (msg) {
            applyCriticalRollChatUI(msg, {
                spentSlots: spentSlotsAfter ?? (msg.getFlag("rmss", "criticalSpentSlots") || {}),
                unlocked: false
            });
            const $li = $(button.closest(".message"));
            const $content = $li.find(".message-content");
            if ($content.length) setupCriticalRollGmReroll(msg, $content);
        }

        await socket.executeAsGM("applyCriticalToEnemy", criticalResult, token.id, attackerId, true);
        let follow = criticalResult._rmssEffectWeaponFollowUp;
        while (follow) {
            await socket.executeAsGM("applyCriticalToEnemy", follow, token.id, attackerId, true);
            follow = follow._rmssEffectWeaponFollowUp;
        }
        } finally {
            endCriticalRollClickLock(button, lockKey);
        }
    });

    html.find('.click-to-toggle').on('click', (event) => {
        const breakdown = html.find('.breakdown-details');
        breakdown.toggle();
    });
});
