/**
 * Shared UI for {@link Item#system.tags} on item types that use the "item" data template.
 */

/**
 * Normalize stored tag lists (array or comma-separated string).
 * @param {string[]|string|null|undefined} raw
 * @returns {string[]}
 */
export function normalizeTagArray(raw) {
    if (Array.isArray(raw)) {
        return raw.map((t) => String(t).trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * @param {object} system - item.system
 * @returns {string[]}
 */
export function getItemTagsArray(system) {
    return normalizeTagArray(system?.tags);
}

/**
 * Stable id for datalist (must not change every render).
 * @param {Item} item
 */
export function getItemTagListId(item) {
    return item.id ?? item._id ?? "rmss-item-new";
}

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 */
export function bindItemTagsEditor(sheet, html) {
    if (!sheet.isEditable) return;

    // Delegación + namespace: la hoja puede re-renderizarse; evita listeners huérfanos y fallos si el DOM se reordena.
    const ns = ".rmssItemTagsUi";
    html.off(`click${ns}`, ".rmss-item-tags [data-action='item-tag-remove']");
    html.on(`click${ns}`, ".rmss-item-tags [data-action='item-tag-remove']", async (ev) => {
        ev.preventDefault();
        const chip = ev.currentTarget.closest("[data-tag-index]");
        if (!chip) return;
        const idx = Number(chip.dataset.tagIndex);
        if (!Number.isFinite(idx)) return;
        const tags = [...getItemTagsArray(sheet.item.system)];
        tags.splice(idx, 1);
        await sheet.item.update({ "system.tags": tags });
        sheet.render(false);
    });

    html.off(`keydown${ns}`, ".rmss-item-tags input.rmss-item-tag-input");
    html.on(`keydown${ns}`, ".rmss-item-tags input.rmss-item-tag-input", async (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        ev.stopPropagation();
        const input = ev.currentTarget;
        const v = String(input.value ?? "").trim();
        if (!v) return;
        const tags = [...getItemTagsArray(sheet.item.system)];
        const lower = tags.map((t) => t.toLowerCase());
        if (lower.includes(v.toLowerCase())) {
            input.value = "";
            return;
        }
        tags.push(v);
        await sheet.item.update({ "system.tags": tags });
        input.value = "";
        sheet.render(false);
    });
}
