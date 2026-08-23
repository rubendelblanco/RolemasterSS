/**
 * Let a GM drag a Macro from the Macros directory straight onto an item sheet
 * (or the item macro editor window) to link it as that item's embedded macro
 * (system.flags.rmss.macro), instead of copy-pasting the command by hand.
 */

/**
 * @param {{item: Item, render: Function}} sheet - an ItemSheet subclass or ItemMacroEditor (both expose .item and .render)
 * @param {jQuery|HTMLElement} html
 */
export function bindMacroDropZone(sheet, html) {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  root.addEventListener("dragover", (ev) => {
    ev.preventDefault();
  });

  root.addEventListener("drop", async (ev) => {
    let data;
    try {
      data = JSON.parse(ev.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data?.type !== "Macro") return;
    ev.preventDefault();
    ev.stopPropagation();

    const macro = await fromUuid(data.uuid);
    if (!macro || macro.documentName !== "Macro") return;

    if (macro.type !== "script") {
      ui.notifications.warn(game.i18n.localize("rmss.item.macro_drop_script_only"));
      return;
    }

    await sheet.item.setFlag("rmss", "macro", {
      name: macro.name,
      command: macro.command,
      type: "script"
    });

    ui.notifications.info(game.i18n.format("rmss.item.macro_drop_linked", {
      macroName: macro.name,
      itemName: sheet.item.name
    }));

    sheet.render(false);
  });
}
