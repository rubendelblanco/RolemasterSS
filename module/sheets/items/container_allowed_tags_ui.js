import { getItemTagListId, normalizeTagArray } from "./item_tags_ui.js";

/**
 * Allowed tags for a container item ({@link Item#system.container.allowedTags}).
 * Same UX as item tags: chips + datalist from {@link CONFIG.rmss.item_type_tags}.
 */

export function getContainerAllowedTagsArray(system) {
    return normalizeTagArray(system?.container?.allowedTags);
}

export function getContainerAllowedTagListId(item) {
    return `${getItemTagListId(item)}-container-allowed`;
}

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 */
export function bindContainerAllowedTagsEditor(sheet, html) {
    if (!sheet.isEditable) return;

    html.find(".rmss-container-allowed-tags [data-action='container-allowed-tag-remove']").on("click", async (ev) => {
        ev.preventDefault();
        const chip = ev.currentTarget.closest("[data-tag-index]");
        if (!chip) return;
        const idx = Number(chip.dataset.tagIndex);
        if (!Number.isFinite(idx)) return;
        const tags = [...getContainerAllowedTagsArray(sheet.item.system)];
        tags.splice(idx, 1);
        await sheet.item.update({ "system.container.allowedTags": tags });
        sheet.render(false);
    });

    html.find(".rmss-container-allowed-tags input.rmss-container-allowed-tag-input").on("keydown", async (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        const input = ev.currentTarget;
        const v = String(input.value ?? "").trim();
        if (!v) return;
        const tags = [...getContainerAllowedTagsArray(sheet.item.system)];
        const lower = tags.map((t) => t.toLowerCase());
        if (lower.includes(v.toLowerCase())) {
            input.value = "";
            return;
        }
        tags.push(v);
        await sheet.item.update({ "system.container.allowedTags": tags });
        input.value = "";
        sheet.render(false);
    });
}
