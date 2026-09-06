import { normalizeTagArray } from "../../sheets/items/item_tags_ui.js";

/**
 * Missile weapons use {@link CONFIG.rmss.ammunition_types}; ammo items must carry the same string in {@link Item#system.tags}.
 */

/**
 * @param {string} ammoTag - e.g. "arrow", "bolt", "bullet"
 * @param {Actor} actor
 * @returns {Item[]} Stackable items on the actor with qty &gt; 0 and the tag (any depth: top-level or inside containers).
 */
export function findAmmoStacksOnActor(actor, ammoTag) {
    if (!actor?.items || !ammoTag) return [];
    const want = String(ammoTag).toLowerCase();
    return actor.items.filter((i) => {
        const qty = Number(i.system?.quantity);
        if (!Number.isFinite(qty) || qty <= 0) return false;
        const tags = normalizeTagArray(i.system?.tags);
        return tags.some((t) => t.toLowerCase() === want);
    });
}

/**
 * @param {Actor} actor
 * @param {Item} weapon - weapon item with {@code system.type === "mis"} and {@code system.ammoType} set
 * @returns {Item[]}
 */
export function findAmmoStacksForWeapon(actor, weapon) {
    const ammoType = weapon?.system?.ammoType;
    if (!ammoType) return [];
    return findAmmoStacksOnActor(actor, ammoType);
}

/**
 * Remove one unit from an ammo stack (delete stack if quantity reaches 0).
 * @param {Item} ammoItem
 */
export async function consumeOneAmmoFromStack(ammoItem) {
    const q = Math.max(1, Number(ammoItem.system?.quantity) || 1);
    if (q <= 1) {
        await ammoItem.delete();
        return 0;
    }
    const next = q - 1;
    await ammoItem.update({ "system.quantity": next });
    return next;
}

/**
 * If the player cancels the ammo picker, attack should abort.
 * @param {Item[]} stacks
 * @returns {Promise<Item|null>}
 */
export function pickAmmoStackDialog(stacks) {
    if (!stacks?.length) return Promise.resolve(null);
    if (stacks.length === 1) return Promise.resolve(stacks[0]);

    const options = stacks
        .map(
            (s, i) =>
                `<option value="${i}">${foundry.utils.escapeHTML(s.name)} (${Number(s.system?.quantity) || 1})</option>`
        )
        .join("");

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        new Dialog(
            {
                title: game.i18n.localize("rmss.combat.select_ammo"),
                content: `<form><div class="form-group"><label>${game.i18n.localize("rmss.combat.select_ammo_label")}</label><select id="rmss-ammo-pick" class="fancy-select">${options}</select></div></form>`,
                buttons: {
                    ok: {
                        label: game.i18n.localize("rmss.combat.confirm"),
                        callback: (html) => {
                            const idx = parseInt(html.find("#rmss-ammo-pick").val(), 10);
                            finish(stacks[idx] ?? null);
                        }
                    },
                    cancel: {
                        label: game.i18n.localize("rmss.combat.cancel"),
                        callback: () => finish(null)
                    }
                },
                default: "ok",
                close: () => finish(null)
            },
            { width: 400 }
        ).render(true);
    });
}

/**
 * Missile weapon ({@code mis}) with {@code system.ammoType}: pick (but don't yet consume) a
 * matching ammo stack, so its {@code attack_bonus} can be folded into the attack confirmation
 * dialog BEFORE the roll. Call {@link consumeOneAmmoFromStack} on the returned item once the
 * attack is actually confirmed.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Promise<{ ok: boolean, reason?: string, ammoItem?: Item|null }>}
 */
export async function pickMissileAmmoForAttack(actor, weapon) {
    if (weapon.type !== "weapon") return { ok: true, ammoItem: null };
    if (weapon.system?.type !== "mis") return { ok: true, ammoItem: null };
    const ammoType = String(weapon.system?.ammoType ?? "").trim();
    if (!ammoType) return { ok: true, ammoItem: null };

    const stacks = findAmmoStacksForWeapon(actor, weapon);
    if (stacks.length === 0) {
        ui.notifications.warn(game.i18n.localize("rmss.combat.no_ammo"));
        return { ok: false, reason: "no_ammo" };
    }

    const stack = await pickAmmoStackDialog(stacks);
    if (!stack) {
        return { ok: false, reason: "cancelled" };
    }

    return { ok: true, ammoItem: stack };
}

/**
 * Consume 1 unit from the ammo stack chosen by {@link pickMissileAmmoForAttack}, once the attack
 * has actually been confirmed (so a cancelled attack doesn't burn ammo).
 * @param {Item} ammoItem
 */
export async function consumeChosenAmmo(ammoItem) {
    if (!ammoItem) return;
    const name = ammoItem.name;
    const remaining = await consumeOneAmmoFromStack(ammoItem);
    ui.notifications.info(
        game.i18n.format("rmss.combat.ammo_consumed", {
            name,
            remaining
        })
    );
}
