import RMSSCharacterSheet from "./rmss_character_sheet.js";
import ItemService from "../../actors/services/item_service.js";
import ForceSpellService from "../../spells/services/force_spell_service.js";

export default class RMSSCreatureSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-creature-sheet.hbs",
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    _registerItemListeners(html) {
        super._registerItemListeners(html);
        html.find(".spell-cast").click(ev => this._onSpellCastClick(ev));
    }

    async _onSpellCastClick(ev) {
        ev.preventDefault();
        const spellId = ev.currentTarget.dataset.itemId;
        const spellListName = ev.currentTarget.dataset.spellListName;
        const spellListRealm = ev.currentTarget.dataset.spellListRealm;

        const spell = this.actor.items.get(spellId);
        if (!spell) return;

        if (spell.system?.instant) {
            const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
            await InstantSpellService.castInstantSpell({ actor: this.actor, spell });
            return;
        }

        if (spell.system?.type === "BE") {
            const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
            await BaseElementalSpellService.castBaseElementalSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        } else if (spell.system?.type === "DE") {
            const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
            await DirectedElementalSpellService.castDirectedElementalSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        } else {
            await ForceSpellService.castForceSpell({
                actor: this.actor,
                spell,
                spellListName,
                spellListRealm
            });
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        const saveCreatureAttack = async (event) => {
            const attackCalc = $(event.currentTarget).closest('.creature-attack-calc');
            const attackBonus = parseInt(attackCalc.find('.creature-attack-bonus').text().trim(), 10) || 0;
            const attackMult = parseInt(attackCalc.find('.creature-attack-multiplier select').val(), 10) || 1;
            const attackNumber = parseInt(attackCalc.find('.creature-attack-number').text().trim(), 10) || 1;
            const attackProb = parseInt(attackCalc.find('.creature-attack-probability').text().trim(), 10) || 100;
            const data = {
                "system.attacks_number": attackNumber,
                "system.bonus": attackBonus,
                "system.multiplier": attackMult,
                "system.probability": attackProb
            }
            const itemId = attackCalc.data('item-id');
            const item = this.actor.items.get(itemId);

            if (item) {
                await item.update(data);
            }
        };

        // contenteditable fires 'blur' when user leaves the field, not 'change'
        html.find('.creature-attack-calc').on('blur', '[contenteditable="true"]', saveCreatureAttack);
        // select fires 'change' when user picks a new value
        html.find('.creature-attack-calc').on('change', 'select', saveCreatureAttack);

        html.find('select[name="system.initiative_code"]').on("change", ev => {
            const newValue = Number(ev.target.value);

            this.actor.update({
                "system.attributes.initiative.mod": newValue,
                "system.attributes.initiative.value": newValue
            });
        });
    }

    async _onDropItem(event, data) {
        await super._onDropItem(event, data);

        if (data.type === 'Item') {
            const item = await fromUuid(data.uuid);

            if (item && item.type === "creature_attack") {
                const creatureAttacks = this.actor.items.filter(item => item.type === "creature_attack");

                for (let [index, attack] of creatureAttacks.entries()) {
                    await attack.update({ "system.order": index + 1 });
                }

                console.log(creatureAttacks);
            }
        }
    }

    async getData() {
        const context = super.getData();
        // Use a safe clone of the actor data for further operations.
        const actorData = this.actor.toObject(false);
        let enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description, {async: true});

        // Add the actor's data to context.data for easier access, as well as flags.
        context.system = actorData.system;
        context.flags = actorData.flags;
        context.enrichedDescription = enrichedDescription;
        context.initiative_codes = CONFIG.rmss.creature_speed;

        //effects
        context.effects = this.actor.effects.contents;

        // Prepare character data and items.
        this._prepareItems(context);

        return context;
    }

    _prepareItems(context) {
        return ItemService.prepareItems(this.actor, context);
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;

        // Get the type of item to create.
        const type = header.dataset.type;

        // Grab any data associated with this control.
        const data = duplicate(header.dataset);

        // Initialize a default name.
        const name = `New ${type.capitalize()}`;

        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            data: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.data.type;
        // Finally, create the item!
        return await Item.create(itemData, {parent: this.actor});
    }
}