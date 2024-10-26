export class RMSSCombat extends Combat {
    constructor(data, context) {
        super(data, context);
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

        console.log("Target Token:", targets);

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
