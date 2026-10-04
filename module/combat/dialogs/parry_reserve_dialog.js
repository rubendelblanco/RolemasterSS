import ParryService from "../services/parry_service.js";
import ParryChat from "../services/parry_chat.js";
import { isParryEnabled } from "../services/parry_settings.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Dialog to reserve (or release) the OB an actor sets aside to parry. See ParryService for
 * the rules. Opened from the combat tracker row, or `game.rmss.openParryDialog(actor)`.
 *
 * @param {Actor} actor
 * @param {{ combatant?: Combatant|null }} [options]
 */
export async function openParryReserveDialog(actor, { combatant = null } = {}) {
    if (!actor) return;
    if (!isParryEnabled()) {
        ui.notifications.warn(game.i18n.localize("rmss.parry.disabled"));
        return;
    }
    const combat = combatant?.combat ?? game.combat ?? null;

    const { allowed } = combatant
        ? ParryService.canReserveNow(combat, combatant, game.user.isGM)
        : { allowed: true };
    if (!allowed) {
        ui.notifications.warn(game.i18n.localize("rmss.parry.only_own_turn"));
        return;
    }
    if (ParryService.hasNoParryEffect(actor)) {
        ui.notifications.warn(game.i18n.format("rmss.parry.no_parry_effect", { name: actor.name }));
        return;
    }

    const candidates = ParryService.getParryCandidates(actor);
    if (!candidates.length) {
        ui.notifications.warn(game.i18n.format("rmss.parry.no_weapon", { name: actor.name }));
        return;
    }

    // Same OB the attack confirmation dialog will use for that weapon, so what is reserved
    // here matches what the attack later deducts it from. Imported lazily: the skill manager
    // itself imports ParryService.
    const { RMSSWeaponSkillManager } = await import("../rmss_weapon_skill_manager.js");
    const options = candidates.map((item) => ({
        item,
        id: item.id,
        ob: Math.max(0, Math.floor(Number(RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(item, actor)) || 0)),
        cap: ParryService.getCapPercent(item, actor)
    })).map((o) => ({
        ...o,
        max: ParryService.getMaxReservable(o.ob, o.cap),
        min: ParryService.getMinReservable(actor, o.ob, o.cap)
    }));
    if (options.every((o) => o.max <= 0)) {
        ui.notifications.warn(game.i18n.localize("rmss.parry.no_ob"));
        return;
    }

    const existing = ParryService.getReservation(actor);
    const locked = !!existing && !ParryService.canRelease(actor, game.user.isGM);
    const mustParry = ParryService.isMustParry(actor);
    // Lowest value the points box accepts: the forced minimum, or the unpaid stance it can't go under.
    const floorFor = (o) => Math.max(o.min, locked && !mustParry ? existing.points : 0);
    const first = options.find((o) => o.max > 0) ?? options[0];
    const optionsHtml = options.map((o) =>
        `<option value="${esc(o.id)}" data-ob="${o.ob}" data-cap="${o.cap}" data-floor="${floorFor(o)}" ${o.id === first.id ? "selected" : ""}>${esc(game.i18n.format("rmss.parry.option_label", { name: o.item.name, ob: o.ob, cap: o.cap }))}</option>`
    ).join("");

    const content = `
      <form class="rmss-parry-form">
        ${existing ? `<p class="notes">${esc(game.i18n.format("rmss.parry.current_reservation", { points: existing.points, defense: existing.defense }))}</p>` : ""}
        ${mustParry ? `<p class="notes" style="color:#b00;">${esc(game.i18n.localize("rmss.parry.must_parry_note"))}</p>` : ""}
        ${locked && !mustParry ? `<p class="notes" style="color:#b00;">${esc(game.i18n.localize("rmss.parry.unpaid_note"))}</p>` : ""}
        <div class="form-group">
          <label>${esc(game.i18n.localize("rmss.parry.weapon"))}</label>
          <select name="weapon">${optionsHtml}</select>
        </div>
        <div class="form-group">
          <label>${esc(game.i18n.localize("rmss.parry.points"))}</label>
          <input type="number" name="points" min="${floorFor(first)}" step="1" value="${Math.max(floorFor(first), locked && !mustParry ? existing.points : Math.floor(first.max / 2))}" />
        </div>
        <p class="rmss-parry-result" style="margin:6px 0 0 0;"></p>
      </form>`;

    const readForm = (html) => {
        const select = html.find("[name=weapon]")[0];
        const opt = select?.selectedOptions?.[0];
        const ob = Number(opt?.dataset.ob) || 0;
        const cap = Number(opt?.dataset.cap) || 100;
        const requested = Number(html.find("[name=points]").val()) || 0;
        return { id: select?.value, ob, cap, requested, ...ParryService.computeReservation(requested, ob, cap) };
    };

    new Dialog({
        title: game.i18n.format("rmss.parry.dialog_title", { name: actor.name }),
        content,
        buttons: {
            reserve: {
                icon: '<i class="fas fa-shield-halved"></i>',
                label: game.i18n.localize("rmss.parry.reserve"),
                callback: async (html) => {
                    const sel = readForm(html);
                    const item = candidates.find((c) => c.id === sel.id);
                    const result = await ParryService.reserve(actor, {
                        item,
                        requested: sel.requested,
                        ob: sel.ob,
                        combatId: combat?.id ?? null,
                        isGM: game.user.isGM
                    });
                    if (!result.ok) {
                        ui.notifications.warn(game.i18n.format(`rmss.parry.${result.reason}`, { name: actor.name }));
                        return;
                    }
                    await ParryChat.postReserved(actor, result.reservation);
                }
            },
            ...(existing && !locked ? {
                clear: {
                    icon: '<i class="fas fa-trash"></i>',
                    label: game.i18n.localize("rmss.parry.clear"),
                    callback: async () => {
                        const released = await ParryService.clear(actor, { isGM: game.user.isGM });
                        if (!released.ok) {
                            ui.notifications.warn(game.i18n.localize(`rmss.parry.${released.reason}`));
                            return;
                        }
                        await ParryChat.postCleared(actor);
                    }
                }
            } : {}),
            cancel: { label: game.i18n.localize("rmss.dialog.cancel") }
        },
        default: "reserve",
        render: (html) => {
            const refresh = () => {
                const sel = readForm(html);
                html.find(".rmss-parry-result").text(game.i18n.format("rmss.parry.result", {
                    spent: sel.spent, defense: sel.defense, max: sel.max, cap: sel.cap
                }));
            };
            html.find("[name=weapon]").on("change", () => {
                const opt = html.find("[name=weapon]")[0].selectedOptions[0];
                const max = ParryService.getMaxReservable(Number(opt.dataset.ob) || 0, Number(opt.dataset.cap) || 100);
                const floor = Number(opt.dataset.floor) || 0;
                html.find("[name=points]").attr("min", floor).val(Math.max(floor, Math.floor(max / 2)));
                refresh();
            });
            html.find("[name=points]").on("input change", refresh);
            refresh();
        }
    }, { classes: ["rmss", "casting-options-dialog"], width: 420 }).render(true);
}
