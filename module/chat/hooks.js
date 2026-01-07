// Listen for click events on chat buttons
import {RMSSWeaponCriticalManager} from "../combat/rmss_weapon_critical_manager.js";
import {RMSSCombat} from "../combat/rmss_combat.js";
import {socket} from "../../rmss.js";

// Map to track buttons in cooldown: key = button element, value = timeout ID
const buttonCooldowns = new WeakMap();

Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".chat-critical-roll").click(async ev => {
        const button = ev.currentTarget;
        
        // Check if button is in cooldown
        if (button.disabled || buttonCooldowns.has(button)) {
            ev.preventDefault();
            return;
        }

        ev.preventDefault();
        
        // Disable button and add cooldown style
        button.disabled = true;
        button.style.opacity = "0.5";
        button.style.cursor = "not-allowed";
        
        // Save original text
        const originalContent = button.innerHTML;
        
        // 5 second cooldown
        const cooldownSeconds = 5;
        let remaining = cooldownSeconds;
        
        // Clear existing timeout if any
        const existingTimeout = buttonCooldowns.get(button);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        // Function to update the counter
        const updateCooldown = () => {
            if (remaining > 0) {
                button.innerHTML = `<div style="display:inline-block; align-items:center; gap:4px;">
                    <span style="font-size:1.1em;">⏱️</span>
                    <span>${game.i18n.localize("rmss.combat.cooldown")} ${remaining}s</span>
                </div>`;
                remaining--;
                const timeoutId = setTimeout(updateCooldown, 1000);
                buttonCooldowns.set(button, timeoutId);
            } else {
                // Restore button
                button.innerHTML = originalContent;
                button.disabled = false;
                button.style.opacity = "1";
                button.style.cursor = "pointer";
                buttonCooldowns.delete(button);
            }
        };
        
        // Start cooldown
        updateCooldown();
        
        // Execute the action
        const token = RMSSCombat.getTargets()[0];
        const damage = ev.currentTarget.dataset.damage;
        const severity = ev.currentTarget.dataset.severity;
        const critType = ev.currentTarget.dataset.crittype;
        const attackerId = ev.currentTarget.dataset.attacker;
        const criticalResult = await RMSSWeaponCriticalManager.sendCriticalMessage(token, damage, severity, critType, attackerId);
        await socket.executeAsGM("applyCriticalToEnemy", criticalResult, token.id, attackerId, token instanceof Token);
    });

    html.find('.click-to-toggle').on('click', (event) => {
        const breakdown = html.find('.breakdown-details');
        breakdown.toggle();
    });
});

