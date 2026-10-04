// Our Item Sheet extends the default
import ItemMacroEditor from "../../core/macros/item_macro_editor.js";
import { bindMacroDropZone } from "./macro_drop_util.js";
import { bindWeaponSlayingEditor, getWeaponSlayingArray, getWeaponSlayingListId } from "./weapon_slaying_ui.js";

export default class RMSSCreatureAttackSheet extends ItemSheet {

    // Set the height and width
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 530,
            height: 560,
            template: "systems/rmss/templates/sheets/items/rmss-creature-attack-sheet.hbs",
            classes: ["rmss", "sheet", "item"]
        });
    }

    // If our sheet is called here it is.
    get template() {
        return "systems/rmss/templates/sheets/items/rmss-creature-attack-sheet.hbs";
    }

    // Make the data available to the sheet template
    async getData() {
        const baseData = await super.getData();
        
        // Get arms tables and sort by translated name
        let armsTables = await game.rmss?.attackTableIndex || [];
        armsTables = armsTables.sort((a, b) => {
            const nameA = game.i18n.localize(`rmss.attack_table.${a}`) || a;
            const nameB = game.i18n.localize(`rmss.attack_table.${b}`) || b;
            return nameA.localeCompare(nameB, game.i18n.lang);
        });

        let criticalTables = await game.rmss?.criticalTableIndex || [];
        criticalTables = criticalTables.sort((a, b) => {
            const nameA = game.i18n.localize(`rmss.critical_table.${a}`) || a;
            const nameB = game.i18n.localize(`rmss.critical_table.${b}`) || b;
            return nameA.localeCompare(nameB, game.i18n.lang);
        });

        const system = baseData.item.system;
        const attack_effects = foundry.utils.mergeObject(
            {
                increased_initiative: "",
                effect_weapon: "",
                effect_weapon_critical_type: "",
                effect_weapon_fixed_severity: "",
                increased_critical: false,
                weapon_of_bleeding: false
            },
            system.attack_effects ?? {},
            { inplace: false }
        );

        let sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system: { ...system, attack_effects },
            weaponSlaying: getWeaponSlayingArray(system),
            weaponSlayingListId: getWeaponSlayingListId(this.item),
            config: CONFIG.rmss,
            actorId: this.getActorId(),
            armsTables: armsTables,
            criticalTables
        };

        return sheetData;
    }

    activateListeners(html) {
        super.activateListeners(html);
        bindMacroDropZone(this, html);
        bindWeaponSlayingEditor(this, html);
        this._setupHolyUnholyExclusive(html);
    }

    /** Same rule as the weapon sheet: an attack is holy or unholy, not both. */
    _setupHolyUnholyExclusive(html) {
        const holy = html.find('input[name="system.holy"]')[0];
        const unholy = html.find('input[name="system.unholy"]')[0];
        if (!holy || !unholy) return;
        const sync = (source) => {
            if (source.checked) (source === holy ? unholy : holy).checked = false;
        };
        holy.addEventListener("change", () => sync(holy));
        unholy.addEventListener("change", () => sync(unholy));
    }

    getActorId() {
        let actorId = null;
        if (this.item.parent instanceof Actor) {
            actorId = this.item.parent.id;
        }
        return actorId;
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();

        if (this.isEditable) {
            buttons.unshift({
                label: "Macro",
                class: "item-macro-button",
                icon: "fas fa-code",
                onclick: ev => this._onOpenMacroEditor(ev)
            });
        }

        return buttons;
    }

    _onOpenMacroEditor(event) {
        new ItemMacroEditor(this.item).render(true);
    }
}
