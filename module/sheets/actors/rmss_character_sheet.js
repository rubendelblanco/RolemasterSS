import { RMSSCombat } from "../../combat/rmss_combat.js";
import { RMSSWeaponSkillManager } from "../../combat/rmss_weapon_skill_manager.js";
import ItemService from "../../actors/services/item_service.js";

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
            if (item.system.is_container) {
                await ItemService.deleteContainer(this.actor, item);
            }
            else {
                item.delete();
            }
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

        // Identify drop target from the HTML element
        const targetId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const targetItem = targetId ? this.actor.items.get(targetId) : null;

        // Retrieve dragged item from UUID
        const sourceItem = await fromUuid(data.uuid);
        if (!sourceItem) return;

        // Prevent self-drop
        if (targetItem && sourceItem.id === targetItem.id) {
            ui.notifications.warn("You cannot drop an item onto itself.");
            return;
        }

        // Prepare item data clone
        const itemData = sourceItem.toObject();

        // Try to find an existing matching stackable item
        const existing = targetItem ?? this.actor.items.find(i =>
            i.id !== sourceItem.id &&
            i.name === itemData.name &&
            i.type === itemData.type &&
            i.system.is_stackable
        );

        if (existing) {
            // Combine stack quantities
            const addQty = itemData.system.quantity || 1;
            const oldQty = existing.system.quantity || 1;
            const newQty = Number(Number(oldQty + addQty).toFixed(2));

            const unitWeight = (existing.system.unitWeight ?? (existing.system.weight / oldQty)) || 0;
            const unitCost   = (existing.system.unitCost   ?? (existing.system.cost / oldQty))   || 0;

            await existing.update({
                "system.quantity": newQty,
                "system.weight": Number(Number(unitWeight * newQty).toFixed(2)),
                "system.cost": Number(Number(unitCost * newQty).toFixed(2))
            });

            // Delete the dragged item if it belongs to the same actor
            if (sourceItem.parent?.id === this.actor.id) {
                await sourceItem.delete();
            }

            ui.notifications.info(`${itemData.name} stacked. New quantity: ${newQty}`);
            return;
        }

        // Default behavior for non-stackable or unmatched items
        return super._onDropItem(event, data);
    }
}