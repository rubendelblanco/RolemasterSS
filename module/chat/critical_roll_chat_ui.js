/**
 * Persistent state on ChatMessage flags (rmss.criticalSpentSlots, rmss.criticalRerollUnlocked)
 * to lock critical buttons after resolution and let the GM allow rerolls.
 */

/** Prevents double-click / duplicate listeners before the first await (disabled alone is not enough). */
const CRITICAL_ROLL_CLICK_LOCKS = new Set();

/** While set, renderChatMessage must not clear disabled (flags not updated yet during GM dialog). */
export const CRITICAL_ROLL_PENDING_ATTR = "rmssCritPending";

/** @param {HTMLElement} button */
export function clearCriticalRollPending(button) {
    delete button.dataset[CRITICAL_ROLL_PENDING_ATTR];
}

/**
 * @param {HTMLElement} button
 * @returns {string|null} lock key if acquired; null if a click is already in progress
 */
export function beginCriticalRollClickLock(button) {
    const row = button.closest(".message");
    const mid = row?.dataset?.messageId ?? "";
    const key = mid
        ? `${mid}:${button.dataset.critSlot ?? "0"}`
        : `orphan:${button.dataset.rmssCritLockId ?? (button.dataset.rmssCritLockId = foundry.utils.randomID())}`;
    if (CRITICAL_ROLL_CLICK_LOCKS.has(key)) return null;
    CRITICAL_ROLL_CLICK_LOCKS.add(key);
    button.classList.add("rmss-critical-roll-busy");
    button.style.pointerEvents = "none";
    return key;
}

/**
 * @param {HTMLElement} button
 * @param {string|null|undefined} lockKey
 */
export function endCriticalRollClickLock(button, lockKey) {
    if (lockKey) CRITICAL_ROLL_CLICK_LOCKS.delete(lockKey);
    button.classList.remove("rmss-critical-roll-busy");
    button.style.pointerEvents = "";
}

/** @param {HTMLElement} button */
export function getChatMessageFromButton(button) {
    const row = button.closest(".message");
    const id = row?.dataset?.messageId;
    if (!id) return null;
    return game.messages.get(id);
}

/**
 * Applies disabled state / styles to all .chat-critical-roll buttons for this message in the DOM.
 * @param {ChatMessage} message
 * @param {{ spentSlots?: Record<string, boolean>, unlocked?: boolean }} [uiState]
 *   After setFlag/update, getFlag can lag one frame; pass spentSlots/unlocked explicitly when needed.
 */
export function applyCriticalRollChatUI(message, uiState) {
    if (!message) return;
    const slots =
        uiState?.spentSlots != null
            ? uiState.spentSlots
            : (message.getFlag("rmss", "criticalSpentSlots") || {});
    const unlocked =
        uiState?.unlocked !== undefined
            ? uiState.unlocked
            : message.getFlag("rmss", "criticalRerollUnlocked") === true;
    const nodes = document.querySelectorAll(`.message[data-message-id="${message.id}"] .chat-critical-roll`);
    nodes.forEach((btn) => {
        if (btn.dataset[CRITICAL_ROLL_PENDING_ATTR] === "1") {
            btn.disabled = true;
            btn.style.opacity = "0.65";
            btn.style.cursor = "wait";
            return;
        }
        const slot = btn.dataset.critSlot ?? "0";
        const spent = slots[slot] === true;
        const shouldLock = spent && !unlocked;
        btn.disabled = shouldLock;
        btn.style.opacity = shouldLock ? "0.5" : "1";
        btn.style.cursor = shouldLock ? "not-allowed" : "pointer";
    });
}

/**
 * True if at least one critical slot was already resolved (locked until the GM allows a repeat).
 * @param {ChatMessage} message
 */
export function messageHasSpentCriticalSlots(message) {
    const slots = message.getFlag("rmss", "criticalSpentSlots") || {};
    return Object.values(slots).some((v) => v === true);
}

/**
 * Removes the GM unlock block from the DOM for every rendered instance of this message.
 * @param {ChatMessage} message
 */
export function removeCriticalRollGmUnlockUI(message) {
    document.querySelectorAll(`.message[data-message-id="${message.id}"] .rmss-crit-gm-reroll-wrap`).forEach((el) => el.remove());
}

/**
 * Injects a one-shot GM-only button: click unlocks criticals and removes the control.
 * Shown again after another critical is resolved (criticalRerollUnlocked cleared in hooks).
 * @param {ChatMessage} message
 * @param {JQuery} html - message fragment (e.g. .message-content)
 */
export function setupCriticalRollGmReroll(message, html) {
    const list = html.find(".rmss-chat-criticals-list");
    if (!list.length) return;
    list.siblings(".rmss-crit-gm-reroll-wrap").remove();
    if (!game.user.isGM) return;

    const unlocked = message.getFlag("rmss", "criticalRerollUnlocked") === true;
    if (unlocked || !messageHasSpentCriticalSlots(message)) return;

    const labelText = game.i18n.localize("rmss.combat.critical_reroll_gm_allow");
    const wrap = $(`<div class="rmss-crit-gm-reroll-wrap"><button type="button" class="rmss-crit-gm-unlock-btn"></button></div>`);
    wrap.find("button").text(labelText);
    list.after(wrap);
    wrap.find("button.rmss-crit-gm-unlock-btn").off("click.rmssCritUnlock").on("click.rmssCritUnlock", async () => {
        const spentSlots = message.getFlag("rmss", "criticalSpentSlots") || {};
        await message.setFlag("rmss", "criticalRerollUnlocked", true);
        applyCriticalRollChatUI(message, { spentSlots, unlocked: true });
        removeCriticalRollGmUnlockUI(message);
    });
}

/**
 * After message flags change, refresh critical UI and GM unlock control.
 * @param {ChatMessage} message
 * @param {object} diff
 */
export function refreshCriticalRollChatAfterMessageUpdate(message, diff) {
    const rmssFlags = foundry.utils.getProperty(diff, "flags.rmss");
    if (rmssFlags === undefined) return;
    applyCriticalRollChatUI(message);
    const $li = $(`.message[data-message-id="${message.id}"]`).first();
    const $content = $li.find(".message-content");
    if ($content.length) {
        setupCriticalRollGmReroll(message, $content);
    }
}

export function registerCriticalRollChatMessageFollowUp() {
    Hooks.on("updateChatMessage", (message, diff) => {
        if (foundry.utils.getProperty(diff, "flags.rmss") === undefined) return;
        refreshCriticalRollChatAfterMessageUpdate(message, diff);
    });
}
