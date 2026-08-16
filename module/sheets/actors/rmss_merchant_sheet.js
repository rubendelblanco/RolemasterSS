import MerchantSellDialog from "../../actors/dialogs/merchant_sell_dialog.js";
import MerchantRequestDialog from "../../actors/dialogs/merchant_request_dialog.js";
import SellToMerchantDialog from "../../actors/dialogs/sell_to_merchant_dialog.js";

/**
 * Sheet for the "merchant" actor type (a shop/vendor). Extends ActorSheet directly
 * rather than RMSSCharacterSheet: a shop has no stats, skills, or combat, so none
 * of that shared machinery is needed here.
 */
export default class RMSSMerchantSheet extends ActorSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 700,
            height: 640,
            template: "systems/rmss/templates/sheets/actors/rmss-merchant-sheet.html",
            classes: ["rmss", "sheet", "actor", "merchant"],
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    async getData() {
        const context = await super.getData();
        const actorData = this.actor.toObject(false);
        context.system = actorData.system;
        context.isGM = game.user.isGM;

        // Simple flat grouping by item type — no container/skill/spell machinery needed.
        context.stock = { item: [], weapon: [], armor: [], herb_or_poison: [] };
        for (const item of this.actor.items) {
            if (context.stock[item.type]) context.stock[item.type].push(item);
        }

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        if (!game.user.isGM) {
            // Players can only request a purchase or offer to sell; the GM confirms either from the chat card.
            html.find(".item-request").click(ev => this._onRequestClick(ev));
            html.find(".sell-item-to-merchant").click(ev => this._onSellItemClick(ev));
            return;
        }

        html.find(".item-sell").click(ev => this._onSellClick(ev));

        html.find(".item-control.item-edit").click(ev => {
            const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
            this.actor.items.get(itemId)?.sheet.render(true);
        });

        html.find(".item-control.item-delete").click(async ev => {
            const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
            await this.actor.items.get(itemId)?.delete();
        });
    }

    _onSellClick(ev) {
        ev.preventDefault();
        const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        new MerchantSellDialog(this.actor, item).render(true);
    }

    _onRequestClick(ev) {
        ev.preventDefault();
        const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const hasOwnedCharacterOnScene = canvas.tokens.placeables
            .some(t => t.actor?.type === "character" && t.actor.isOwner);
        if (!hasOwnedCharacterOnScene) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_character_available"));
            return;
        }

        new MerchantRequestDialog(this.actor, item).render(true);
    }

    _onSellItemClick(ev) {
        ev.preventDefault();

        const hasOwnedCharacterOnScene = canvas.tokens.placeables
            .some(t => t.actor?.type === "character" && t.actor.isOwner);
        if (!hasOwnedCharacterOnScene) {
            ui.notifications.warn(game.i18n.localize("rmss.merchant.no_character_available"));
            return;
        }

        new SellToMerchantDialog(this.actor).render(true);
    }
}
