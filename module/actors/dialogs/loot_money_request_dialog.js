import LootService from "../services/loot_service.js";

/**
 * Player-facing dialog to request specific coins from a loot container's money.
 * One field per denomination, defaulting to "take everything available" but
 * editable — lets a group split a hoard across several requests instead of the
 * first click taking it all. Confirming just posts a chat request for the GM
 * (see LootService.requestMoney); nothing moves until accepted.
 */
export default class LootMoneyRequestDialog extends Application {

    constructor(sourceActor, options = {}) {
        super(options);
        this.sourceActor = sourceActor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "loot-money-request-dialog",
            title: game.i18n.localize("rmss.loot.take_money_dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/loot_money_request_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "loot-request-dialog"]
        });
    }

    getData() {
        const receivers = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character" && a.isOwner);

        const denominations = Object.keys(CONFIG.rmss.currency_exchange_rates).map(denom => ({
            key: denom,
            label: game.i18n.localize(`rmss.currency_type.${denom}`),
            available: Number(this.sourceActor.system.money?.[denom]) || 0
        }));

        return {
            denominations,
            receivers,
            hint: game.i18n.localize("rmss.loot.take_money_dialog_hint")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".confirm-take").click(ev => this._onConfirmTake(ev));
    }

    async _onConfirmTake(ev) {
        ev.preventDefault();
        const receiverUuid = this.element.find("[name='receiver']").val();
        const receiver = await fromUuid(receiverUuid);
        if (!receiver) {
            ui.notifications.warn(game.i18n.localize("rmss.loot.no_character_available"));
            return;
        }

        const amounts = {};
        for (const denom of Object.keys(CONFIG.rmss.currency_exchange_rates)) {
            amounts[denom] = Number(this.element.find(`[name='amount.${denom}']`).val()) || 0;
        }

        await LootService.requestMoney(this.sourceActor, receiver, amounts);
        this.close();
    }
}
