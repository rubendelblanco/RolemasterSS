import MerchantService from "../services/merchant_service.js";
import ItemService from "../services/item_service.js";

/**
 * Dialog to confirm a sale from a merchant actor to a buyer (GM-only, no player-facing use).
 */
export default class MerchantSellDialog extends Application {

    constructor(merchantActor, item, options = {}) {
        super(options);
        this.merchantActor = merchantActor;
        this.item = item;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "merchant-sell-dialog",
            title: game.i18n.localize("rmss.merchant.sell_dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/merchant_sell_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        // Same buyer-discovery source as ItemService.giveItem: only character actors
        // with a token currently placed on the active scene.
        const buyers = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character");

        const maxQty = Number(this.item.system.quantity) || 0;
        const unitCost = ItemService.getUnitCost(this.item, maxQty);

        return {
            item: this.item,
            maxQty,
            unitCost,
            currencyType: this.item.system.currency_type,
            buyers
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".confirm-sale").click(ev => this._onConfirmSale(ev));
    }

    async _onConfirmSale(ev) {
        ev.preventDefault();
        const qty = Number(this.element.find("[name='qty']").val()) || 0;
        const buyerId = this.element.find("[name='buyer']").val();
        const buyer = game.actors.get(buyerId);
        if (!buyer) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_buyer_selected"));
            return;
        }
        await MerchantService.sellItem(this.merchantActor, this.item, buyer, qty);
        this.close();
    }
}
