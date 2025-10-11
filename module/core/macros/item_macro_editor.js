export default class ItemMacroEditor extends Application {

    /**
     * Constructor for the editor, initializes with an item and optional settings.
     */
    constructor(item, options = {}) {
        super(options);
        this.item = item;
    }

    /** @override */
    static get defaultOptions() {
        // Default configuration options for this application.
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "item-macro-editor",
            classes: ["sheet", "item-macro-editor"],
            title: "Item Macro Editor",
            template: "systems/rmss/templates/sheets/items/rmss-macro-editor.hbs",
            width: 600, // Width of the editor window
            height: 500, // Height of the editor window
            resizable: true, // Allow resizing
            closeOnSubmit: false, // Prevent closing on submit
            submitOnChange: false, // Prevent submitting on input changes
            tabs: []
        });
    }

    /** @override */
    get title() {
        // Dynamically sets the window title to include the item's name.
        return `Macro: ${this.item.name}`;
    }

    /** @override */
    getData() {
        const data = super.getData();

        // Retrieve the current macro assigned to the item (stored as flags).
        const macroData = this.item.getFlag("rmss", "macro") || {
            name: `${this.item.name} Macro`, // Default macro name
            command: "// Write your JavaScript code here\n// The item is available as 'item'\n// Example:\nconsole.log('Executing macro for:', item.name);",
            type: "script"
        };

        // Attach item and macro data to the template data.
        data.item = this.item;
        data.macro = macroData;
        data.hasExistingMacro = !!this.item.getFlag("rmss", "macro"); // Whether the item already has a macro.

        return data;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Event listener for "Save Macro" button.
        html.find('.save-macro').click(this._onSaveMacro.bind(this));

        // Event listener for "Execute Macro" button.
        html.find('.execute-macro').click(this._onExecuteMacro.bind(this));

        // Event listener for "Delete Macro" button.
        html.find('.delete-macro').click(this._onDeleteMacro.bind(this));

        // Event listener for "Create Global Macro" button.
        html.find('.create-global-macro').click(this._onCreateGlobalMacro.bind(this));

        // Auto-resize functionality for the textarea.
        const textarea = html.find('textarea[name="command"]')[0];
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';

            textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px'; // Adjust height dynamically.
            });
        }
    }

    /**
     * Save the macro attached to the item.
     */
    async _onSaveMacro(event) {
        event.preventDefault();

        const form = this.element.find('form')[0];
        const formData = new FormDataExtended(form);
        const macroData = formData.object;

        // Validate if the command is not empty.
        if (!macroData.command.trim()) {
            ui.notifications.warn("The macro cannot be empty");
            return;
        }

        // Save the macro to the item's flags.
        await this.item.setFlag("rmss", "macro", macroData);

        ui.notifications.info(`Macro saved for ${this.item.name}`);

        // Refresh the window to reflect the changes.
        this.render();
    }

    /**
     * Execute the item macro in a safe context.
     */
    async _onExecuteMacro(event) {
        event.preventDefault();

        const macroData = this.item.getFlag("rmss", "macro");
        if (!macroData || !macroData.command.trim()) {
            ui.notifications.warn("No macro available to execute");
            return;
        }

        try {
            // Create the needed context for macro execution.
            const item = this.item;
            const actor = this.item.parent; // Actor that owns the item (if any).
            const token = actor?.getActiveTokens()?.[0]; // Active token for the actor.

            // Execute the JavaScript macro in an async context.
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFunction('item', 'actor', 'token', macroData.command);
            await fn(item, actor, token);

            ui.notifications.info("Macro executed successfully");

        } catch (error) {
            console.error("Error executing macro:", error);
            ui.notifications.error(`Macro error: ${error.message}`);
        }
    }

    /**
     * Delete the macro assigned to the item.
     */
    async _onDeleteMacro(event) {
        event.preventDefault();

        // Show a confirmation dialog before deleting the macro.
        const confirmed = await Dialog.confirm({
            title: "Confirm Deletion",
            content: "Are you sure you want to delete this macro?",
            defaultYes: false
        });

        if (confirmed) {
            // Remove the macro data from the item's flags.
            await this.item.unsetFlag("rmss", "macro");
            ui.notifications.info("Macro deleted");
            this.render(); // Refresh the window.
        }
    }

    /**
     * Create a global macro in the macros directory.
     */
    async _onCreateGlobalMacro(event) {
        event.preventDefault();

        const macroData = this.item.getFlag("rmss", "macro");
        if (!macroData || !macroData.command.trim()) {
            ui.notifications.warn("No macro available to create");
            return;
        }

        // Generate a global macro script that includes the item context.
        const globalCommand = `
// Macro generated from item: ${this.item.name}
const item = game.items.get("${this.item.id}") || 
            game.actors.contents.flatMap(a => a.items.contents).find(i => i.id === "${this.item.id}");

if (!item) {
  ui.notifications.error("Could not find the associated item");
  return;
}

const actor = item.parent;
const token = actor?.getActiveTokens()?.[0];

// Original macro code
${macroData.command}`;

        try {
            // Create the global macro with the same name and updated command.
            const macro = await Macro.create({
                name: macroData.name,
                type: "script",
                command: globalCommand,
                img: this.item.img || "icons/svg/dice-target.svg" // Default image if none is provided.
            });

            ui.notifications.info(`Global macro created: ${macro.name}`);

        } catch (error) {
            console.error("Error creating global macro:", error);
            ui.notifications.error("Error creating the global macro");
        }
    }
}