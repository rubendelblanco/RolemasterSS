// Our Item Sheet extends the default

export default class RMSSWeaponSheet extends ItemSheet {

  // Set the height and width
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 530,
      height: 440,
      template: "systems/rmss/templates/sheets/items/rmss-weapon-sheet.html",
      classes: ["rmss", "sheet", "item"]
    });
  }

  // If our sheet is called here it is.
  get template() {
    return "systems/rmss/templates/sheets/items/rmss-weapon-sheet.html";
  }

  // Make the data available to the sheet template
  async getData() {
    const baseData = await super.getData();

    let enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });

    let sheetData = {
      owner: this.item.isOwner,
      editable: this.isEditable,
      item: baseData.item,
      system: baseData.item.system,
      config: CONFIG.rmss,
      enrichedDescription: enrichedDescription,
      armsTables: await this.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.arms_tables),
      criticalTables: await this.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.critical_tables),
      offensiveSkills: await this.getOffensiveSkills()
    };

    console.log(sheetData.criticalTables);

    return sheetData;
  }

  async getJSONFileNamesFromDirectory(directory) {
    // Open the file picker and retrieve the files from the specified directory
    const picker = await FilePicker.browse("data", directory);

    const jsonFilesObject = picker.files
      .filter(file => file.endsWith(".json"))
      .reduce((obj, file) => {
        const fileName = file.split('/').pop().replace(".json", "");
        obj[fileName] = fileName; // Create an entry where key and value are the same
        return obj;
      }, {});

    return jsonFilesObject;
  }

  async getOffensiveSkills() {
    if (!this.object.parent) {
      return null
    }

    const offensiveSkills = this.actor.items
      .filter(item => item.type === "skill" && (item.system.offensive_skill !== "none" && item.system.offensive_skill !== ""))
      .map(item => ({ name: item.name, id: item.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return offensiveSkills;
  }
  /** @override */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();

    if (this.isEditable) {
      buttons.unshift({
        label: "Macro",
        class: "item-macro-button",
        icon: "fas fa-code",
        onclick: ev => this._onOpenMacroEditor(ev)
      });
    }

    return buttons;
  }

  /**
   * Abrir el editor de macro del item
   */
  _onOpenMacroEditor(event) {
    new ItemMacroEditor(this.item).render(true);
  }
}
class ItemMacroEditor extends Application {

  constructor(item, options = {}) {
    super(options);
    this.item = item;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "item-macro-editor",
      classes: ["sheet", "item-macro-editor"],
      title: "Editor de Macro del Item",
      template: "systems/rmss/templates/sheets/items/rmss-macro-editor.hbs", // Ruta a tu template
      width: 600,
      height: 500,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      tabs: []
    });
  }

  /** @override */
  get title() {
    return `Macro: ${this.item.name}`;
  }

  /** @override */
  getData() {
    const data = super.getData();

    // Obtener la macro actual del item (guardada en flags)
    const macroData = this.item.getFlag("rmss", "macro") || {
      name: `${this.item.name} Macro`,
      command: "// Escribe tu código JavaScript aquí\n// El item está disponible como 'item'\n// Ejemplo:\nconsole.log('Ejecutando macro de:', item.name);",
      type: "script"
    };

    data.item = this.item;
    data.macro = macroData;
    data.hasExistingMacro = !!this.item.getFlag("rmss", "macro");

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Botón guardar
    html.find('.save-macro').click(this._onSaveMacro.bind(this));

    // Botón ejecutar
    html.find('.execute-macro').click(this._onExecuteMacro.bind(this));

    // Botón eliminar
    html.find('.delete-macro').click(this._onDeleteMacro.bind(this));

    // Botón crear macro global
    html.find('.create-global-macro').click(this._onCreateGlobalMacro.bind(this));

    // Auto-resize del textarea
    const textarea = html.find('textarea[name="command"]')[0];
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';

      textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    }
  }

  /**
   * Guardar la macro en el item
   */
  async _onSaveMacro(event) {
    event.preventDefault();

    const form = this.element.find('form')[0];
    const formData = new FormDataExtended(form);
    const macroData = formData.object;

    // Validar que hay código
    if (!macroData.command.trim()) {
      ui.notifications.warn("La macro no puede estar vacía");
      return;
    }

    // Guardar en los flags del item
    await this.item.setFlag("rmss", "macro", macroData);

    ui.notifications.info(`Macro guardada para ${this.item.name}`);

    // Actualizar la ventana
    this.render();
  }

  /**
   * Ejecutar la macro
   */
  async _onExecuteMacro(event) {
    event.preventDefault();

    const macroData = this.item.getFlag("rmss", "macro");
    if (!macroData || !macroData.command.trim()) {
      ui.notifications.warn("No hay macro para ejecutar");
      return;
    }

    try {
      // Crear contexto para la macro
      const item = this.item;
      const actor = this.item.parent;
      const token = actor?.getActiveTokens()?.[0];

      // Ejecutar el código
      const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
      const fn = new AsyncFunction('item', 'actor', 'token', macroData.command);
      await fn(item, actor, token);

      ui.notifications.info("Macro ejecutada correctamente");

    } catch (error) {
      console.error("Error ejecutando macro:", error);
      ui.notifications.error(`Error en la macro: ${error.message}`);
    }
  }

  /**
   * Eliminar la macro del item
   */
  async _onDeleteMacro(event) {
    event.preventDefault();

    const confirmed = await Dialog.confirm({
      title: "Confirmar eliminación",
      content: "¿Estás seguro de que quieres eliminar esta macro?",
      defaultYes: false
    });

    if (confirmed) {
      await this.item.unsetFlag("rmss", "macro");
      ui.notifications.info("Macro eliminada");
      this.render();
    }
  }

  /**
   * Crear una macro global en el directorio de macros
   */
  async _onCreateGlobalMacro(event) {
    event.preventDefault();

    const macroData = this.item.getFlag("rmss", "macro");
    if (!macroData || !macroData.command.trim()) {
      ui.notifications.warn("No hay macro para crear");
      return;
    }

    // Modificar el código para incluir la búsqueda del item
    const globalCommand = `
// Macro generada desde el item: ${this.item.name}
const item = game.items.get("${this.item.id}") || 
            game.actors.contents.flatMap(a => a.items.contents).find(i => i.id === "${this.item.id}");

if (!item) {
  ui.notifications.error("No se pudo encontrar el item asociado");
  return;
}

const actor = item.parent;
const token = actor?.getActiveTokens()?.[0];

// Código original de la macro
${macroData.command}`;

    try {
      const macro = await Macro.create({
        name: macroData.name,
        type: "script",
        command: globalCommand,
        img: this.item.img || "icons/svg/dice-target.svg"
      });

      ui.notifications.info(`Macro global creada: ${macro.name}`);

    } catch (error) {
      console.error("Error creando macro global:", error);
      ui.notifications.error("Error creando la macro global");
    }
  }
}