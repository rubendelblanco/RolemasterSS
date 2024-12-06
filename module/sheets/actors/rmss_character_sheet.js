import {RMSSCombat} from "../../combat/rmss_combat.js";
import {RMSSWeaponSkillManager} from "../../combat/rmss_weapon_skill_manager.js";

/**
 * All the actions and feats in common for characters (PCs, NPCs, Creatures & Monsters)
 */
export default class RMSSCharacterSheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);

        // Equip/Unequip Weapon/Armor
        html.find(".equippable").click(ev => {
            const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            console.log(`Before change: ${item.system.equipped}`);
            if (item.system.equipped === true) {
                console.log("Setting False");
                item.update({system: {equipped: false}});
            } else {
                console.log("Setting True");
                item.update({system: {equipped: true}});
            }
            console.log(`After change: ${item.system.equipped}`);
        });

        html.find(".offensive-skill").click(async ev => {
            const enemy = RMSSCombat.getTargets()[0];
            const weapon = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            const ob = this.actor.items.get(weapon.system.offensive_skill).system.total_bonus;
            await RMSSWeaponSkillManager.sendAttackMessage(this.actor, enemy.actor, weapon, ob);
        });

        // Items
        html.find(".item-create").click(this._onItemCreate.bind(this));

        html.find(".item-delete").click(async ev => {
            const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            item.delete();
        });

        html.find(".item-edit").click(ev => {
            const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            item.sheet.render(true);
        });
    }
}