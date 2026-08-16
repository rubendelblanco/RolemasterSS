import RollTableStockService from "../services/roll_table_stock_service.js";

/**
 * GM dialog to populate a merchant's or loot's stock from a world RollTable —
 * mirrors Monk's Enhanced Journal's "Populate from Rollable Table". Local GM
 * action, no chat card/confirmation involved (see RollTableStockService).
 */
export default class PopulateFromRollTableDialog extends Application {

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "populate-from-roll-table-dialog",
            title: game.i18n.localize("rmss.populate_table.dialog_title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/populate_from_roll_table_dialog.html",
            width: 420,
            height: "auto",
            classes: ["rmss", "rmss-request-dialog"]
        });
    }

    getData() {
        const tables = game.tables.contents.map(t => ({ id: t.id, name: t.name, formula: t.formula }));
        return {
            tables,
            initialFormula: tables[0]?.formula ?? ""
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("[name='tableId']").on("change", ev => this._updateFormula(ev));
        html.find(".confirm-populate").click(ev => this._onConfirm(ev));
    }

    _updateFormula(ev) {
        const tableId = ev.currentTarget.value;
        const table = game.tables.get(tableId);
        this.element.find(".populate-table-formula").text(table?.formula ?? "");
    }

    async _onConfirm(ev) {
        ev.preventDefault();

        const tableId = this.element.find("[name='tableId']").val();
        const table = game.tables.get(tableId);
        if (!table) {
            ui.notifications.warn(game.i18n.localize("rmss.populate_table.no_table_selected"));
            return;
        }

        const draws = Math.max(1, Number(this.element.find("[name='draws']").val()) || 1);
        const resetWhenExhausted = this.element.find("[name='resetWhenExhausted']").is(":checked");
        const quantityFormula = this.element.find("[name='quantityFormula']").val() || "1";
        const clearItems = this.element.find("[name='clearItems']").val();
        const duplicateItems = this.element.find("[name='duplicateItems']").val();

        const { added, skipped } = await RollTableStockService.populate(this.actor, table, {
            draws, resetWhenExhausted, quantityFormula, clearItems, duplicateItems
        });

        ui.notifications.info(game.i18n.format("rmss.populate_table.result", { added, skipped }));
        this.close();
    }
}
