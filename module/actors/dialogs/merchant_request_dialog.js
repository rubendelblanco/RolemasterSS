import MerchantService from "../services/merchant_service.js";
import ItemService from "../services/item_service.js";

/**
 * Player-facing dialog to request a purchase from a merchant actor. Unlike
 * MerchantSellDialog, this never mutates anything directly: confirming just posts
 * a chat request for the GM (see MerchantService.requestItem).
 */
export default class MerchantRequestDialog extends Application {

    constructor(merchantActor, item, options = {}) {
        super(options);
        this.merchantActor = merchantActor;
        this.item = item;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "merchant-request-dialog",
            title: game.i18n.localize("rmss.merchant.request_dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/merchant_request_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        // Only the requesting player's own characters, present on the current scene —
        // mirrors MerchantSellDialog's buyer discovery, filtered down to actors they own.
        const buyers = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character" && a.isOwner);

        const maxQty = Number(this.item.system.quantity) || 0;
        const unitCost = ItemService.getUnitCost(this.item, maxQty);

        return {
            item: this.item,
            maxQty,
            unitCost,
            currencyType: this.item.system.currency_type,
            buyers,
            hint: game.i18n.localize("rmss.merchant.request_dialog_hint")
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".confirm-request").click(ev => this._onConfirmRequest(ev));
    }

    async _onConfirmRequest(ev) {
        ev.preventDefault();
        const buyerUuid = this.element.find("[name='buyer']").val();
        const buyer = await fromUuid(buyerUuid);
        if (!buyer) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_character_available"));
            return;
        }
        const qty = Number(this.element.find("[name='qty']").val()) || 0;
        await MerchantService.requestItem(this.merchantActor, this.item, buyer, qty);
        this.close();
    }
}
