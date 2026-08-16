import MerchantService from "../services/merchant_service.js";
import ItemService from "../services/item_service.js";

/**
 * Player-facing dialog, opened from the merchant's own sheet, to request selling
 * one of the player's items to that merchant. Unlike the earlier per-item-icon
 * design, the merchant is fixed by context (the sheet you opened it from) — the
 * player instead picks which of their characters is selling and which item, both
 * inside this dialog. Confirming just posts a chat request for the GM (see
 * MerchantService.requestSell); nothing moves until accepted.
 */
export default class SellToMerchantDialog extends Application {

    constructor(merchantActor, options = {}) {
        super(options);
        this.merchantActor = merchantActor;
        this.buyRate = Number(merchantActor.system.buyRate) || 0;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sell-to-merchant-dialog",
            title: game.i18n.localize("rmss.merchant.sell_request_dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/sell_to_merchant_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        const sellers = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character" && a.isOwner);

        this._sellersData = sellers.map(actor => ({
            uuid: actor.uuid,
            name: actor.name,
            items: this._sellableItems(actor)
        }));

        return {
            merchantName: this.merchantActor.name,
            buyRate: this.buyRate,
            sellers: this._sellersData,
            hint: game.i18n.localize("rmss.merchant.sell_request_dialog_hint")
        };
    }

    /** Items this actor could sell: same stock-eligible types as the merchant, no natural weapons. */
    _sellableItems(actor) {
        return actor.items
            .filter(i => ["item", "weapon", "armor", "herb_or_poison"].includes(i.type))
            .filter(i => !(i.type === "weapon" && i.system.isNaturalWeapon))
            .map(i => {
                const maxQty = Number(i.system.quantity) || 0;
                const unitCost = ItemService.getUnitCost(i, maxQty);
                return {
                    id: i.id,
                    name: i.name,
                    maxQty,
                    unitCost,
                    currencyAbb: game.i18n.localize(`rmss.currency_type_abb.${i.system.currency_type}`)
                };
            });
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._populateItemOptions(0);
        html.find("[name='seller']").on("change", ev => this._populateItemOptions(ev.currentTarget.selectedIndex));
        html.find("[name='item'], [name='qty']").on("change input", () => this._updateOffer());
        html.find(".confirm-sell-request").click(ev => this._onConfirmSell(ev));
    }

    _populateItemOptions(sellerIndex) {
        const seller = this._sellersData[sellerIndex];
        const select = this.element.find("[name='item']");
        select.empty();
        for (const it of seller?.items ?? []) {
            select.append(
                `<option value="${it.id}" data-max-qty="${it.maxQty}" data-unit-cost="${it.unitCost}" data-currency="${it.currencyAbb}">${it.name} (x${it.maxQty})</option>`
            );
        }
        this._updateOffer();
    }

    _updateOffer() {
        const itemOption = this.element.find("[name='item']")[0]?.selectedOptions?.[0];
        const maxQty = Number(itemOption?.dataset?.maxQty) || 0;
        const unitCost = Number(itemOption?.dataset?.unitCost) || 0;
        const currency = itemOption?.dataset?.currency || "";
        const qty = Math.max(0, Number(this.element.find("[name='qty']").val()) || 0);

        this.element.find("[name='qty']").attr("max", maxQty);
        this.element.find(".sell-max-qty").text(maxQty);

        const offer = Number((unitCost * this.buyRate / 100 * qty).toFixed(2));
        this.element.find(".sell-offer-amount").text(offer);
        this.element.find(".sell-offer-currency").text(currency);
    }

    async _onConfirmSell(ev) {
        ev.preventDefault();
        const sellerUuid = this.element.find("[name='seller']").val() || this._sellersData[0]?.uuid;
        const seller = sellerUuid ? await fromUuid(sellerUuid) : null;
        if (!seller) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_character_available"));
            return;
        }

        const itemId = this.element.find("[name='item']").val();
        const item = seller.items.get(itemId);
        if (!item) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_sellable_items"));
            return;
        }

        const qty = Number(this.element.find("[name='qty']").val()) || 0;
        await MerchantService.requestSell(seller, item, this.merchantActor, qty);
        this.close();
    }
}
