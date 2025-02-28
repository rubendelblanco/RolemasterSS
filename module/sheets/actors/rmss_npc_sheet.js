import RMSSCharacterSheet from "./rmss_character_sheet.js";

export default class RMSSNpcSheet extends RMSSCharacterSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-npc-sheet.hbs",
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body" }]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.npc-skill-calc').on('blur', '[contenteditable="true"]', async (event) => {
            const skillCalc = $(event.currentTarget).closest('.npc-skill-calc');
            const rankBonus = parseInt(skillCalc.find('[class="npc-item-rank-bonus"]').text()) || 0;
            const itemBonus = parseInt(skillCalc.find('[class="npc-item-bonus"]').text()) || 0;
            const specialBonus = parseInt(skillCalc.find('[class="npc-item-special-bonus-1"]').text()) || 0;
            const total = rankBonus + itemBonus + specialBonus;
            const totalBonus = skillCalc.find('[class="npc-item-total-bonus"]').text(total);
            const data = {
                "system.rank_bonus": rankBonus,
                "system.item_bonus": itemBonus,
                "system.special_bonus_1": specialBonus,
                "system.total_bonus": totalBonus,
            }
            const itemId = totalBonus.data('item-id');
            const item = this.actor.items.get(itemId);

            if (item) {
                await item.update(data);
            }
        });
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

    async _onDropItem(event, data) {
        // Reconstruct the item from the event
        const newitem = await Item.implementation.fromDropData(data);
        const itemData = newitem.toObject();

       if ( itemData.type === "skill") {
            // Get the already owned Items from the actor and push into an array
            const owneditems = this.object.getOwnedItemsByType("skill");

            let ownedskilllist = Object.values(owneditems);

            // Check if the dragged item is not in the array and not owned
            if (!ownedskilllist.includes(itemData.name)) {
                console.log("Not Owned!");
                super._onDropItem(event, data);
            }
        }
        else {
            super._onDropItem(event, data);
        }
    }

    _prepareItems(context) {
        // Initialize containers.
        const gear = [];
        const playerskill= [];
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
            else if (i.type === "skill") {
                playerskill.push(i);
            }
            else if (i.type === "armor") {
                armor.push(i);
            }
            else if (i.type === "spell") {
                spells.push(i);
            }
        }

        // Sort Skill Arrays
        playerskill.sort(function(a, b) {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        });

        // Assign and return
        context.gear = gear;
        context.playerskill = playerskill;
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