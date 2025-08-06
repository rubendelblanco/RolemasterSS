import {RMSSCombatant} from "./rmss_combatant.js";

/**
 * Custom Combat class for RMSS system.
 *
 * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
 * specifically with automatic round-based duration decrementing, this class
 * implements custom logic in `nextRound` to manually manage effect durations.
 *
 * In version 12, ActiveEffect duration fields (e.g., rounds) do not reliably decrement
 * or expire at the end of each round when expected, especially in systems outside of
 * the official D&D 5E system. As a result, effects relying on round-based expiry can
 * persist indefinitely, even when they should have expired.
 *
 * This implementation of `nextRound` iterates over each combatant's active effects and
 * manually decrements round-based durations. When an effect reaches zero rounds, it is
 * removed from the actor. This custom solution ensures that effects with round-based
 * durations expire correctly in each new combat round.
 */
export class RMSSCombat extends Combat {
    constructor(data, context) {
        console.log(data);
        super(data, context);
    }

    /** @override */
    _createCombatant(data, initData) {
        // Use RMSSCombatant instead Combatant
        return new RMSSCombatant(data, this, initData);
    }

    async _decreaseRoundsEffect(effect){
        const duration = effect.duration;

        if (duration.rounds) {
            const remainingRounds = duration.rounds - 1;

            if (remainingRounds <= 0) {
                await effect.delete();
            } else {
                await effect.update({"duration.rounds": remainingRounds});
            }
        }
    }

    /** @override */
    async nextTurn() {
        return super.nextTurn();
    }

    /** @override */
    async nextRound(){
        super.nextRound();

        for (let combatant of this.combatants) {
            const actor = combatant.actor;
            if (!actor) continue;
            const permanentEffects = ["Bleeding", "Penalty"];
            let effectsAlreadyErased = {"Stunned": false, "No parry": false, "Parry": false};

            for (let effect of [...actor.effects]) {
                if (effect.name === "Bleeding") {
                    actor.system.attributes.hits.current -= effect.flags.rmss.value;
                }

                if (permanentEffects.includes(effect.name) || (effectsAlreadyErased.hasOwnProperty(effect.name) && effectsAlreadyErased[effect.name])) {
                    continue;
                }

                await this._decreaseRoundsEffect(effect);

                //only erase one effect per round
                if (effectsAlreadyErased.hasOwnProperty(effect.name)) {
                    effectsAlreadyErased[effect.name] = true;
                }
            }
        }
    }

    async rollInitiative(ids, {formula=null, updateTurn=true}={}) {
        console.log("Iniciativa personalizada");
        return super.rollInitiative(ids, {formula, updateTurn});
    }

    // Function to get the selected target token based on toggle target state
    static getTargets() {
        // Get the currently selected tokens
        const selectedTokens = canvas.tokens.controlled;

        // Ensure we have exactly one selected token
        if (selectedTokens.length !== 1) {
            ui.notifications.warn("Please select exactly one token as the attacker.");
            return;
        }

        // Find the target token that has the target state toggled on
        const targets = Array.from(game.user.targets);

        // Check if a target is found
        if (!targets) {
            ui.notifications.warn("Please target another token.");
            return;
        }

        return targets;
    }

}

//Singleton for combat start
export class CombatStartManager {
    constructor() {
        if (CombatStartManager.instance) {
            return CombatStartManager.instance;
        }
        this._registerHook();
        CombatStartManager.instance = this;
    }

    _registerHook() {
        if (!CombatStartManager.hookRegistered) {
            Hooks.on("combatStart", (combat) => this.handleCombatStart(combat));
            CombatStartManager.hookRegistered = true;
        }
    }

    handleCombatStart(combat) {
        this.playCombatSound();
        this.showCombatImage();
    }

    playCombatSound(combat) {
        // Define the base directory path
        const basePath = CONFIG.rmss.paths.sounds_folder+"combat/begin_combat/";
        // Create an array with only the filenames
        const soundFiles = [
            "begin_combat_1.mp3",
            "begin_combat_2.mp3",
            "begin_combat_3.mp3",
            "begin_combat_4.mp3",
            "begin_combat_5.ogg"
        ];
        // Randomly select a sound from the array
        const randomIndex = Math.floor(Math.random() * soundFiles.length);
        const randomSound = soundFiles[randomIndex];

        foundry.audio.AudioHelper.play({ src: basePath + randomSound, volume: 0.8, loop: false, singleton: true }, true);
        console.log("¡El combate ha comenzado!");
    }

    showCombatImage() {
        const imageDiv = document.createElement("div");
        imageDiv.id = "combat-image-overlay";
        imageDiv.style.position = "absolute";
        imageDiv.style.top = "50%";
        imageDiv.style.left = "50%";
        imageDiv.style.transform = "translate(-50%, -50%)";
        imageDiv.style.zIndex = "10000";
        imageDiv.style.border = "0";
        imageDiv.style.transition = "opacity 2s ease";

        // Add image
        const image = document.createElement("img");
        image.src = CONFIG.rmss.paths.images_folder+"logo_swords.png"
        image.style.width = "400px";
        image.style.height = "auto";
        image.style.border = "none";

        // Añadir la imagen al div y el div al cuerpo del documento
        imageDiv.appendChild(image);
        document.body.appendChild(imageDiv);

        // Desvanecer la imagen después de 5 segundos
        setTimeout(() => {
            imageDiv.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(imageDiv);
            }, 2000);
        }, 3000);
    }
}
