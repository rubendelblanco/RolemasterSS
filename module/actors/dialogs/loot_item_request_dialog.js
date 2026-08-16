import LootService from "../services/loot_service.js";

/**
 * Player-facing dialog to request taking an item from a loot container. Like
 * MerchantRequestDialog, this never mutates anything directly: confirming just
 * posts a chat request for the GM (see LootService.requestItem). No cost involved.
 */
export default class LootItemRequestDialog extends Application {

    constructor(sourceActor, item, options = {}) {
        super(options);
        this.sourceActor = sourceActor;
        this.item = item;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "loot-item-request-dialog",
            title: game.i18n.localize("rmss.loot.take_item_dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/loot_item_request_dialog.html",
            width: 400,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        // Only the requesting player's own characters, present on the current scene —
        // same buyer-discovery approach as MerchantRequestDialog.
        const receivers = canvas.tokens.placeables
            .map(t => t.actor)
            .filter(a => a && a.type === "character" && a.isOwner);

        const maxQty = Number(this.item.system.quantity) || 0;

        return {
            item: this.item,
            maxQty,
            receivers,
            hint: game.i18n.localize("rmss.loot.take_item_dialog_hint")
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
        const qty = Number(this.element.find("[name='qty']").val()) || 0;
        await LootService.requestItem(this.sourceActor, this.item, receiver, qty);
        this.close();
    }
}
