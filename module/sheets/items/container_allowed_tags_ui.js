import { getItemTagListId, normalizeTagArray } from "./item_tags_ui.js";
import { isDatalistSelection } from "../tag_input_util.js";

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

    // The tag in the field goes in with Enter, or as soon as one of the suggestions is picked
    const addTag = async (input) => {
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
    };

    const field = html.find(".rmss-container-allowed-tags input.rmss-container-allowed-tag-input");
    field.on("keydown", async (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        await addTag(ev.currentTarget);
    });
    field.on("input", async (ev) => {
        if (isDatalistSelection(ev, ev.currentTarget)) await addTag(ev.currentTarget);
    });
}
