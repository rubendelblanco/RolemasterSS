import { RMSSCombat } from "../../combat/rmss_combat.js";
import { RMSSWeaponSkillManager } from "../../combat/rmss_weapon_skill_manager.js";

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
                item.update({ system: { equipped: false } });
            } else {
                console.log("Setting True");
                item.update({ system: { equipped: true } });
            }
            console.log(`After change: ${item.system.equipped}`);
        });

        html.find(".offensive-skill").click(async ev => {
            const weapon = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            weapon.use();
            // TODO: base attacks??
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

        html.find(".effect-control").click(this._onEffectControl.bind(this));

        const updateCriticalCodes = (html, name, updatePath) => {
            html.find(`input[name="${name}"]`).click(async ev => {
                const selectedValue = ev.currentTarget.value;
                await this.actor.update({ [updatePath]: selectedValue });
            });
        };

        // Hotbar drag & drop
        document.querySelectorAll("tr[draggable='true']").forEach(el => {
            el.addEventListener("dragstart", event => {
                let itemId = event.currentTarget.getAttribute("data-item-id");
                let uuid = event.currentTarget.getAttribute("data-uuid");

                if (!itemId || !uuid) return;

                let dragData = {
                    type: "Item",
                    uuid: uuid
                };

                event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
            });
        });


        updateCriticalCodes(html, "critical-procedure", "system.attributes.critical_codes.critical_procedure");
        updateCriticalCodes(html, "critical-table", "system.attributes.critical_codes.critical_table");
        updateCriticalCodes(html, "stun-bleeding", "system.attributes.critical_codes.stun_bleeding");
    }

    _onEffectControl(event) {
        event.preventDefault();
        const owner = this.actor;
        const effectId = event.currentTarget.getAttribute("data-effect-id");
        const effect = owner.effects.get(effectId);
        switch (event.currentTarget.dataset.action) {
            case "create":
                if (this.actor.isEmbedded) {
                    return ui.notifications.error("Managing embedded Documents which are not direct descendants of a primary Document is un-supported at this time.");
                }
                return owner.createEmbeddedDocuments("ActiveEffect", [{
                    label: "New Effect",
                    icon: "icons/svg/aura.svg",
                    origin: owner.uuid,
                    disabled: true
                }]);
            case "edit":
                return effect.sheet.render(true);
            case "delete":
                return effect.delete();
        }
    }

    /** @override */
    async _onDropItem(event, data) {
        event.preventDefault();

        const newItem = await Item.implementation.fromDropData(data);
        const itemData = newItem.toObject();

        // --- Check for existing matching item ---
        const existing = this.actor.items.find(i =>
            i.name === itemData.name &&
            i.system.description === itemData.system.description &&
            i.system.is_stackable
        );

        if (existing) {
            // Current and added quantity
            const addQty = itemData.system.quantity || 1;
            const oldQty = existing.system.quantity || 1;
            const newQty = oldQty + addQty;

            // Base unit values
            const unitWeight = (existing.system.unitWeight ?? (existing.system.weight / oldQty)) || 0;
            const unitCost   = (existing.system.unitCost   ?? (existing.system.cost / oldQty))   || 0;

            // Recalculate totals
            const newWeight = unitWeight * newQty;
            const newCost   = unitCost * newQty;

            await existing.update({
                "system.quantity": newQty,
                "system.weight": newWeight,
                "system.cost": newCost
            });

            // Remove the duplicate only if it’s already in the actor (not from compendium/catalogue)
            const duplicate = this.actor.items.get(itemData._id);
            if (duplicate) {
                await duplicate.delete();
            }

            ui.notifications.info(`${itemData.name} stacked. New quantity: ${newQty}`);
            return;
        }

        // --- Default behavior (not stackable or no match) ---
        return super._onDropItem(event, data);
    }
}