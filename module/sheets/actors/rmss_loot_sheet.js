import LootItemRequestDialog from "../../actors/dialogs/loot_item_request_dialog.js";
import LootMoneyRequestDialog from "../../actors/dialogs/loot_money_request_dialog.js";

/**
 * Sheet for the "loot" actor type (a fixed container — chest, stash, cache...).
 * Extends ActorSheet directly rather than RMSSCharacterSheet: like the merchant,
 * a container has no stats/skills/combat, so none of that shared machinery is needed.
 */
export default class RMSSLootSheet extends ActorSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 700,
            height: 640,
            template: "systems/rmss/templates/sheets/actors/rmss-loot-sheet.html",
            classes: ["rmss", "sheet", "actor", "loot"],
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    async getData() {
        const context = await super.getData();
        const actorData = this.actor.toObject(false);
        context.system = actorData.system;
        context.isGM = game.user.isGM;
        context.hasMoney = Object.values(context.system.money ?? {}).some(v => Number(v) > 0);

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
            // Players can only request a pickup; the GM confirms it from the chat card.
            html.find(".item-take").click(ev => this._onTakeItemClick(ev));
            html.find(".take-money").click(ev => this._onTakeMoneyClick(ev));
            return;
        }

        html.find(".item-control.item-edit").click(ev => {
            const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
            this.actor.items.get(itemId)?.sheet.render(true);
        });

        html.find(".item-control.item-delete").click(async ev => {
            const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
            await this.actor.items.get(itemId)?.delete();
        });
    }

    _onTakeItemClick(ev) {
        ev.preventDefault();
        const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        if (!this._hasOwnedCharacterOnScene()) {
            ui.notifications.warn(game.i18n.localize("rmss.loot.no_character_available"));
            return;
        }
        new LootItemRequestDialog(this.actor, item).render(true);
    }

    _onTakeMoneyClick(ev) {
        ev.preventDefault();
        if (!this._hasOwnedCharacterOnScene()) {
            ui.notifications.warn(game.i18n.localize("rmss.loot.no_character_available"));
            return;
        }
        new LootMoneyRequestDialog(this.actor).render(true);
    }

    _hasOwnedCharacterOnScene() {
        return canvas.tokens.placeables.some(t => t.actor?.type === "character" && t.actor.isOwner);
    }
}
