import CurrencyService from "../services/currency_service.js";

/**
 * Player-facing dialog to give some of the actor's own money to any other actor with a
 * token on the current scene — another PC, an NPC, or a creature. Unlike
 * LootMoneyRequestDialog (which posts a request for the GM to approve), this is money
 * the sender already owns, so it transfers immediately once confirmed.
 */
export default class GiveMoneyDialog extends Application {

    constructor(sourceActor, options = {}) {
        super(options);
        this.sourceActor = sourceActor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "give-money-dialog",
            title: game.i18n.localize("rmss.money_transfer.dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/give_money_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        const byName = (a, b) => a.name.localeCompare(b.name);
        const candidates = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.id !== this.sourceActor.id);

        const pcs = candidates.filter(a => a.type === "character").sort(byName);
        const npcs = candidates.filter(a => a.type === "npc").sort(byName);
        const creatures = candidates.filter(a => a.type === "creature").sort(byName);

        const denominations = Object.keys(CONFIG.rmss.currency_exchange_rates).map(denom => ({
            key: denom,
            label: game.i18n.localize(`rmss.currency_type.${denom}`),
            available: Number(this.sourceActor.system.money?.[denom]) || 0
        }));

        return {
            source: { img: this.sourceActor.img, name: this.sourceActor.name },
            denominations,
            pcs,
            npcs,
            creatures,
            hasReceivers: (pcs.length + npcs.length + creatures.length) > 0,
            hint: game.i18n.localize("rmss.money_transfer.dialog_hint")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".confirm-give").click(ev => this._onConfirmGive(ev));
    }

    async _onConfirmGive(ev) {
        ev.preventDefault();
        const receiverUuid = this.element.find("[name='receiver']").val();
        const receiver = receiverUuid ? await fromUuid(receiverUuid) : null;
        if (!receiver) {
            ui.notifications.warn(game.i18n.localize("rmss.money_transfer.no_receiver_selected"));
            return;
        }

        const amounts = {};
        for (const denom of Object.keys(CONFIG.rmss.currency_exchange_rates)) {
            amounts[denom] = Number(this.element.find(`[name='amount.${denom}']`).val()) || 0;
        }

        await CurrencyService.giveMoney(this.sourceActor, receiver, amounts);
        this.close();
    }
}
