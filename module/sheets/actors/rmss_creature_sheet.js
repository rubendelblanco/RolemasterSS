import RMSSCharacterSheet from "./rmss_character_sheet.js";

export default class RMSSCreatureSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-creature-sheet.hbs",
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.creature-attack-calc').on('blur', '[contenteditable="true"]', async (event) => {
            const attackCalc = $(event.currentTarget).closest('.creature-attack-calc');
            const attackBonus = parseInt(attackCalc.find('[class="creature-attack-bonus"]').text()) || 0;
            const attackMult = parseInt(attackCalc.find('[class="creature-attack-multiplier"] select').val()) || 1;
            const attackNumber = parseInt(attackCalc.find('[clas="creature-attack-number"]').text()) || 1;
            const attackProb = parseInt(attackCalc.find('[clas="creature-attack-probability"]').text()) || 100;
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

        //effects
        context.effects = this.actor.effects.contents;

        // Prepare character data and items.
        this._prepareItems(context);

        return context;
    }

    _prepareItems(context) {
        // Initialize containers.
        const gear = [];
        const creatureAttack= [];
        const weapons = [];
        const armor = [];
        const herbs = [];
        const spells = [];

        // Iterate through items, allocating to containers
        for (let i of context.items) {
            i.img = i.img || DEFAULT_TOKEN;
            // Append to gear.
            if (i.type === "item") {
                gear.push(i);
            }
            else if (i.type === "weapon") {
                weapons.push(i);
            }
            else if (i.type === "herb_or_poison") {
                herbs.push(i);
            }
            // Append to playerskill
            else if (i.type === "creature_attack") {
                creatureAttack.push(i);
            }
            else if (i.type === "armor") {
                armor.push(i);
            }
            else if (i.type === "spell") {
                spells.push(i);
            }
        }

        // Assign and return
        context.gear = gear;
        context.creature_attack = creatureAttack;
        context.weapons = weapons;
        context.armor = armor;
        context.herbs = herbs;
        context.spells = spells;
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