import {RMSSCombat} from "../../combat/rmss_combat.js";
import {RMSSWeaponSkillManager} from "../../combat/rmss_weapon_skill_manager.js";

export default class RMSSNpcSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 860,
            height: 780,
            template: "systems/rmss/templates/sheets/actors/rmss-npc-sheet.hbs",
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".item-delete").click(async ev => {
            const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            item.delete();
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

        if (itemData.type === "skill_category") {
             // no skill category needed for NPCs. Use skills directly
        } else if ( itemData.type === "skill") {
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
        const equipables = [];

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
}