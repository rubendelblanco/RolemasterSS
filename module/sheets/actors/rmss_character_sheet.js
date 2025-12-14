import ItemService from "../../actors/services/item_service.js";

/**
 * All the actions and feats in common for characters (PCs, NPCs, Creatures & Monsters)
 */
export default class RMSSCharacterSheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);
        this._registerItemListeners(html);

        // Equip/Unequip Weapon/Armor
        html.find(".equippable").click(ev => {
            const item = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            if (item.system.equipped === true) {
                item.update({ system: { equipped: false } });
            } else {
                item.update({ system: { equipped: true } });
            }
        });

        html.find(".offensive-skill").click(async ev => {
            const weapon = this.actor.items.get(ev.currentTarget.getAttribute("data-item-id"));
            weapon.use();
        });

        html.find("a.item-roll").on("click", async ev => {
            ev.preventDefault();
            await this.actor.update({"system.attributes.movement_rate.current": this.actor.system.attributes.movement_rate.value});
        });

        html.find("#movement-rate-current").on("change", async ev => {
            const value = Math.min(Number(ev.currentTarget.value) || 0, this.actor.system.movement_rate.value);
            await this.actor.update({ "system.movement_rate.current": value });
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

        // --- Handle left and right click on Fate Points ---
        html.find(".fate-icons i").on("click contextmenu", async ev => {
            ev.preventDefault();

            // Get the actor and current data
            const actor = this.actor;
            const maxFate = game.settings.get("rmss", "maxFatePoints");
            const fate = foundry.utils.getProperty(actor.system.attributes, "fate_points") || { value: 0, max: maxFate };

            // Determine if left or right click
            const isRightClick = ev.type === "contextmenu";

            // Calculate new value
            let newValue;

            if (isRightClick) {
                // Right click → increase up to max
                newValue = Math.min(maxFate, fate.value + 1);
            } else {
                // Left click → decrease down to 0
                newValue = Math.max(0, fate.value - 1);
            }

            // Update actor data
            await actor.update({ "system.attributes.fate_points.value": newValue });

        });

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

        // Auto-calculate total_db when armor_info values change
        this._registerArmorInfoListeners(html);
        
        // Auto-calculate quickness_bonus when quickness.basic_bonus changes
        this._registerQuicknessBonusListener(html);
        
        // Calculate quickness_bonus on initial load
        this._updateQuicknessBonus(html);
    }

    /**
     * Registers a listener for quickness.basic_bonus changes to automatically
     * calculate and update quickness_bonus (basic_bonus * 3).
     * @param {jQuery} html - The jQuery object containing the sheet HTML
     */
    _registerQuicknessBonusListener(html) {
        html.find('input[name="system.stats.quickness.basic_bonus"]').on("change", async (ev) => {
            await this._updateQuicknessBonus(html);
        });
        
        html.find('input[name="system.stats.quickness.temp"]').on("change", async (ev) => {
            await this._updateQuicknessBonus(html);
        });
    }

    /**
     * Calculates and updates quickness_bonus based on quickness.basic_bonus * 3.
     * Also recalculates total_db in the same update to avoid flickering.
     * @param {jQuery} html - The jQuery object containing the sheet HTML (optional)
     */
    async _updateQuicknessBonus(html = null) {
        const basicBonus = Number(this.actor.system.stats?.quickness?.basic_bonus) || 0;
        const quicknessBonus = basicBonus * 3;
        
        // Calculate total_db with the new quickness_bonus value
        const totalDB = this._calculateTotalDB(html, quicknessBonus);
        
        // Update both values in a single actor update to prevent flickering
        await this.actor.update({ 
            "system.armor_info.quickness_bonus": quicknessBonus,
            "system.armor_info.total_db": totalDB
        });
    }

    _registerArmorInfoListeners(html) {
        // Only fields from template.json lines 39-43 (excluding total_db and quickness_bonus which are calculated)
        const armorInfoFields = [
            "system.armor_info.quickness_penalty",
            "system.armor_info.adrenal_defense",
            "system.armor_info.shield_bonus",
            "system.armor_info.magic"
        ];

        armorInfoFields.forEach(fieldName => {
            html.find(`input[name="${fieldName}"]`).on("change", async (ev) => {
                const updates = {};
                
                // Special handling for quickness_penalty: convert negative to positive
                if (fieldName === "system.armor_info.quickness_penalty") {
                    const value = Number(ev.currentTarget.value) || 0;
                    if (value < 0) {
                        const positiveValue = Math.abs(value);
                        updates[fieldName] = positiveValue;
                        ev.currentTarget.value = positiveValue;
                    } else {
                        updates[fieldName] = value;
                    }
                } else {
                    updates[fieldName] = Number(ev.currentTarget.value) || 0;
                }
                
                // Calculate total_db with the new values
                const totalDB = this._calculateTotalDB(html);
                updates["system.armor_info.total_db"] = totalDB;
                
                // Update all values in a single actor update to prevent flickering
                await this.actor.update(updates);
            });
        });
    }

    /**
     * Calculates the total_db value without updating the actor.
     * Used internally to calculate the value before updating.
     * @param {jQuery} html - The jQuery object containing the sheet HTML (optional, falls back to actor data)
     * @param {number} quicknessBonusOverride - Optional override for quickness_bonus value
     * @returns {number} The calculated total_db value
     */
    _calculateTotalDB(html = null, quicknessBonusOverride = null) {
        // Parse values more carefully, handling empty strings and null/undefined
        const parseValue = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            const num = Number(val);
            return isNaN(num) ? 0 : num;
        };
        
        let quicknessBonus, adrenalDefense, magic, shieldBonus, quicknessPenalty;
        
        // Use override if provided, otherwise calculate from actor data
        if (quicknessBonusOverride !== null) {
            quicknessBonus = quicknessBonusOverride;
        } else {
            const basicBonus = Number(this.actor.system.stats?.quickness?.basic_bonus) || 0;
            quicknessBonus = basicBonus * 3;
        }
        
        if (html) {
            // Read values directly from form inputs (current values before actor update)
            adrenalDefense = parseValue(html.find('input[name="system.armor_info.adrenal_defense"]').val());
            magic = parseValue(html.find('input[name="system.armor_info.magic"]').val());
            shieldBonus = parseValue(html.find('input[name="system.armor_info.shield_bonus"]').val());
            quicknessPenalty = parseValue(html.find('input[name="system.armor_info.quickness_penalty"]').val());
        } else {
            // Fallback to actor data if HTML not provided
            const armorInfo = this.actor.system.armor_info || {};
            adrenalDefense = parseValue(armorInfo.adrenal_defense);
            magic = parseValue(armorInfo.magic);
            shieldBonus = parseValue(armorInfo.shield_bonus);
            quicknessPenalty = parseValue(armorInfo.quickness_penalty);
        }
        
        // Sum only the fields from template.json lines 39-43
        // quickness_penalty subtracts (not adds)
        const total = quicknessBonus + adrenalDefense + magic + shieldBonus - quicknessPenalty;
        
        // Ensure total_db is never negative (minimum value is 0)
        return Math.max(0, total);
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
            case "edit-flags":
                return this._onEditEffectFlags(effect);
            case "delete":
                return effect.delete();
        }
    }

    async _onEditEffectFlags(effect) {
        const currentFlags = foundry.utils.deepClone(effect.flags) || {};
        const rmssFlags = currentFlags.rmss || {};
        
        // Build form content with common RMSS flags
        const formContent = `
            <form>
                <div class="form-group">
                    <label>Value (for Bonus/Penalty/Bleeding):</label>
                    <input type="number" name="rmss.value" value="${rmssFlags.value || ''}" placeholder="Enter numeric value"/>
                </div>
                <div class="form-group">
                    <label>Custom Flags (JSON):</label>
                    <textarea name="customFlags" rows="15" style="font-family: monospace; width: 100%; min-height: 300px; resize: vertical;">${JSON.stringify(currentFlags, null, 2)}</textarea>
                    <p class="notes">Edit the full flags object as JSON. Use the Value field above for common RMSS flags, or edit the JSON directly for advanced usage.</p>
                </div>
            </form>
        `;

        const dialog = new Dialog({
            title: `Edit Flags: ${effect.name}`,
            content: formContent,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Save",
                    callback: async (html) => {
                        try {
                            // Get value from input
                            const valueInput = html.find('input[name="rmss.value"]').val();
                            const customFlagsText = html.find('textarea[name="customFlags"]').val();
                            
                            let newFlags = {};
                            
                            // Try to parse custom flags JSON
                            if (customFlagsText.trim()) {
                                try {
                                    newFlags = JSON.parse(customFlagsText);
                                } catch (e) {
                                    ui.notifications.error(`Invalid JSON: ${e.message}`);
                                    return false;
                                }
                            }
                            
                            // Update rmss.value if provided
                            if (valueInput !== '') {
                                if (!newFlags.rmss) newFlags.rmss = {};
                                newFlags.rmss.value = valueInput ? Number(valueInput) : undefined;
                            } else if (newFlags.rmss?.value === undefined) {
                                // Remove value if empty and not in JSON
                                if (newFlags.rmss && Object.keys(newFlags.rmss).length === 0) {
                                    delete newFlags.rmss;
                                }
                            }
                            
                            // Clean up empty objects
                            if (newFlags.rmss && Object.keys(newFlags.rmss).length === 0) {
                                delete newFlags.rmss;
                            }
                            if (Object.keys(newFlags).length === 0) {
                                newFlags = null;
                            }
                            
                            await effect.update({ flags: newFlags });
                            ui.notifications.info(`Flags updated for ${effect.name}`);
                        } catch (error) {
                            ui.notifications.error(`Error updating flags: ${error.message}`);
                            console.error(error);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "save",
            close: () => {}
        });
        
        dialog.render(true);
        
        // After rendering, make the dialog larger and resizable
        setTimeout(() => {
            // Find the dialog window by title
            const dialogWindows = $('.window-app.dialog');
            const targetDialog = Array.from(dialogWindows).find(win => {
                const title = $(win).find('.window-header h4').text();
                return title === `Edit Flags: ${effect.name}`;
            });
            
            if (targetDialog) {
                const $dialog = $(targetDialog);
                $dialog.css({
                    width: '700px',
                    minWidth: '500px',
                    minHeight: '500px'
                });
                // Make dialog resizable using jQuery UI
                if ($.fn.resizable) {
                    $dialog.resizable({
                        handles: 'all',
                        minWidth: 500,
                        minHeight: 400
                    });
                }
            }
        }, 100);
    }

    /** @override */
    async _onDropItem(event, data) {
        event.preventDefault();
        // --- Retrieve the dropped item from UUID ---
        const droppedItem = await fromUuid(data.uuid);
        if (!droppedItem) return;

        // Optional: get the item as it exists within this actor, if any
        const targetItem = this.actor.items.get(droppedItem.id) ?? null;
        // Prevent self-drop
        if (targetItem && droppedItem.id === targetItem.id) {
            ui.notifications.warn("You cannot drop an item onto itself.");
            return;
        }

        // Prepare item data clone
        const itemData = droppedItem.toObject();

        // Try to find an existing matching stackable item
        const existing = targetItem ?? this.actor.items.find(i =>
            i.id !== droppedItem.id &&
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
            if (droppedItem.parent?.id === this.actor.id) {
                await droppedItem.delete();
            }

            ui.notifications.info(`${itemData.name} stacked. New quantity: ${newQty}`);
            return;
        }

        // Default behavior for non-stackable or unmatched items
        return super._onDropItem(event, data);
    }

    _registerItemListeners(html) {
        html.find(".spell-favorite, .skill-favorite").click(ev => this._onItemFavoriteClick(ev));
        html.find(".item-give").click(ev => this._onItemGiveClick(ev));
        html.find(".split-stack").click(ev => this._onItemSplitClick(ev));
        html.find(".wearable").click(ev => this._onItemWearableClick(ev));
    }

    async _onItemFavoriteClick(ev) {
        const itemId = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) await ItemService.toggleFavorite(item);
    }

    async _onItemGiveClick(ev) {
        ev.preventDefault();
        const itemId = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) await ItemService.giveItem(this.actor, item);
    }

    async _onItemSplitClick(ev) {
        ev.preventDefault();
        const li = ev.currentTarget.closest("[data-item-id]");
        const itemId = li.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await ItemService.splitStack(this.actor, item);
    }

    async _onItemWearableClick(ev) {
        const itemId = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await ItemService.toggleWorn(item);
    }
}