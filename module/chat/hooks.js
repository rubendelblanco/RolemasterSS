// Listen for click events on chat buttons
import { RMSSWeaponCriticalManager } from "../combat/rmss_weapon_critical_manager.js";
import { socket } from "../../rmss.js";
import MerchantService from "../actors/services/merchant_service.js";
import LootService from "../actors/services/loot_service.js";

/** requestKind (stamped on the button by request-card.html) -> resolver. */
const REQUEST_RESOLVERS = {
    merchantRequest: (message, decision) => MerchantService.resolveRequest(message, decision),
    lootItemRequest: (message, decision) => LootService.resolveItemRequest(message, decision),
    lootMoneyRequest: (message, decision) => LootService.resolveMoneyRequest(message, decision)
};

/** Guards against a double-click firing the same resolver twice on the same card. */
const REQUEST_CARD_IN_FLIGHT = new Set();

/**
 * @param {JQuery.Event} ev
 * @param {"accept"|"reject"} decision
 */
async function onRequestCardDecision(ev, decision) {
    ev.preventDefault();
    if (!game.user.isGM) return;

    const button = ev.currentTarget;
    const messageId = button.closest(".message")?.dataset?.messageId;
    const message = messageId ? game.messages.get(messageId) : null;
    if (!message) return;

    const resolver = REQUEST_RESOLVERS[button.dataset.requestKind];
    if (!resolver) return;

    const lockKey = `${message.id}:${button.dataset.requestKind}`;
    if (REQUEST_CARD_IN_FLIGHT.has(lockKey)) return;
    REQUEST_CARD_IN_FLIGHT.add(lockKey);
    try {
        await resolver(message, decision);
    } finally {
        REQUEST_CARD_IN_FLIGHT.delete(lockKey);
    }
}

/** Same message+slot cannot start two critical flows before the first await (disabled alone is not enough). */
const CRITICAL_ROLL_IN_FLIGHT = new Set();

/** @param {HTMLElement} button */
function criticalRollLockKey(button) {
    const row = button.closest(".message");
    const mid = row?.dataset?.messageId ?? "";
    const slot = button.dataset.critSlot ?? "0";
    if (mid) return `${mid}:${slot}`;
    if (!button.dataset.rmssCritLockId) button.dataset.rmssCritLockId = foundry.utils.randomID();
    return `orphan:${button.dataset.rmssCritLockId}`;
}

/** @returns {string|null} key if acquired */
function beginCriticalRollLock(button) {
    const key = criticalRollLockKey(button);
    if (CRITICAL_ROLL_IN_FLIGHT.has(key)) return null;
    CRITICAL_ROLL_IN_FLIGHT.add(key);
    button.classList.add("rmss-critical-roll-busy");
    return key;
}

/** @param {string|null|undefined} lockKey */
function endCriticalRollLock(button, lockKey) {
    if (lockKey) CRITICAL_ROLL_IN_FLIGHT.delete(lockKey);
    if (button?.classList) button.classList.remove("rmss-critical-roll-busy");
}

/**
 * Restore critical button HTML and re-attach click handler (local DOM only).
 * @param {HTMLElement} host
 * @param {string} backupHtml
 */
function restoreCriticalButtonInHost(host, backupHtml) {
    host.innerHTML = backupHtml;
    const btn = host.querySelector(".chat-critical-roll");
    if (btn) {
        btn.classList.remove("rmss-critical-roll-busy");
        $(btn).off(CRIT_CLICK_NS).on(CRIT_CLICK_NS, onCriticalRollClick);
    }
}

const CRIT_CLICK_NS = "click.rmssCriticalRoll";

/**
 * @param {JQuery.Event} ev
 */
async function onCriticalRollClick(ev) {
    const button = ev.currentTarget;

    if (button.disabled) {
        ev.preventDefault();
        return;
    }

    ev.preventDefault();
    ev.stopImmediatePropagation();

    const host = button.closest(".rmss-crit-slot-host");
    if (!host) {
        ui.notifications.warn("RMSS: missing .rmss-crit-slot-host (old chat message?).");
        return;
    }

    // Snapshot before lock: beginCriticalRollLock adds rmss-critical-roll-busy, which must not be in the restore HTML.
    const backupHtml = host.innerHTML;

    const lockKey = beginCriticalRollLock(button);
    if (lockKey == null) {
        return;
    }
    host.innerHTML = `<div class="rmss-crit-pending">${game.i18n.localize("rmss.combat.critical_resolving")}</div>`;

    let success = false;
    try {
        const targetId = button.dataset.targetId;
        let token = targetId ? canvas.scene?.tokens?.get(targetId) : null;
        if (!token) {
            const targets = Array.from(game.user.targets);
            token = targets?.[0];
        }
        if (!token) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.select_target") || "Please select a target.");
            return;
        }
        const damage = button.dataset.damage;
        const severity = button.dataset.severity;
        const critType = button.dataset.crittype;
        const attackerId = button.dataset.attacker;
        const attackerUuid = button.dataset.attackerUuid;
        const mainSev = button.dataset.mainSeverity;
        const ewDup = button.dataset.effectWeaponDup === "1";
        const ewSecond = button.dataset.effectWeaponSecond;
        const ewExtraCrit = button.dataset.effectWeaponExtraCritType;
        const ewRollModRaw = button.dataset.effectWeaponRollMod;
        const ewRollModifier = ewRollModRaw !== undefined && ewRollModRaw !== "" ? parseInt(ewRollModRaw, 10) : 0;
        const ewSuperiorEChain = button.dataset.effectWeaponSuperiorEChain === "1";
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

        const weaponItemId = button.dataset.weaponItemId;
        let criticalResult;
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
            return;
        }

        if (!criticalResult) return;

        await socket.executeAsGM("applyCriticalToEnemy", criticalResult, token.id, attackerId, true);
        let follow = criticalResult._rmssEffectWeaponFollowUp;
        while (follow) {
            await socket.executeAsGM("applyCriticalToEnemy", follow, token.id, attackerId, true);
            follow = follow._rmssEffectWeaponFollowUp;
        }

        success = true;

        const rolled = game.i18n.localize("rmss.combat.critical_rolled");
        const again = game.i18n.localize("rmss.combat.critical_roll_again_link");
        host.innerHTML = `
<div class="rmss-crit-done">
  <div class="rmss-crit-rolled-msg">${rolled}</div>
  <button type="button" class="rmss-crit-reenable-local">${again}</button>
</div>`;
        const reenableBtn = host.querySelector(".rmss-crit-reenable-local");
        if (reenableBtn) {
            reenableBtn.addEventListener(
                "click",
                (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    restoreCriticalButtonInHost(host, backupHtml);
                },
                { once: true }
            );
        }
    } catch (err) {
        console.error("[RMSS] critical roll pipeline", err);
    } finally {
        endCriticalRollLock(button, lockKey);
        if (!success && host.querySelector(".rmss-crit-pending")) {
            restoreCriticalButtonInHost(host, backupHtml);
        }
    }
}

Hooks.on("renderChatMessage", (message, html, data) => {
    if (!game.user.isGM) {
        html.find(".rmss-chat-gm-only").remove();
    }
    // Attacker owner or GM; runs outside combat too (chat/hooks always loads)
    html.find(".chat-critical-roll").each(function () {
        const attackerId = this.dataset.attacker;
        const actor = game.actors.get(attackerId);
        const isOwner = actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
        if (!isOwner && !game.user.isGM) {
            const h = this.closest(".rmss-crit-slot-host");
            if (h) h.remove();
            else this.remove();
        }
    });

    html.find(".chat-critical-roll").off(CRIT_CLICK_NS).on(CRIT_CLICK_NS, onCriticalRollClick);

    html.find(".rmss-request-accept").off("click.rmssRequestCard").on("click.rmssRequestCard", ev => onRequestCardDecision(ev, "accept"));
    html.find(".rmss-request-reject").off("click.rmssRequestCard").on("click.rmssRequestCard", ev => onRequestCardDecision(ev, "reject"));

    html.find('.click-to-toggle').on('click', (event) => {
        const breakdown = html.find('.breakdown-details');
        breakdown.toggle();
    });
});
