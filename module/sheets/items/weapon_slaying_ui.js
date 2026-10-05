import { normalizeTagArray, getItemTagListId } from "./item_tags_ui.js";

/**
 * Shared UI for {@link Item#system.slaying} on weapon items — which creature
 * types this weapon is tailored to slay (RM "Slaying" weapon property). Separate
 * field from the generic {@link Item#system.tags} (container-filter classification):
 * they used to be conflated (typing here fed into system.tags and cleared itself),
 * which made it impossible to tell a slaying tag from an unrelated container tag.
 * Vocabulary is CONFIG.rmss.slaying_types, shared with creature_tags_ui.js so the
 * two sides can be compared (see RMSSWeaponCriticalManager.getDefaultCriticalSubtype).
 */

/**
 * @param {object} system - weapon item.system
 * @returns {string[]}
 */
export function getWeaponSlayingArray(system) {
    return normalizeTagArray(system?.slaying);
}

/**
 * Stable id for datalist (must not change every render).
 * @param {Item} item
 */
export function getWeaponSlayingListId(item) {
    return `${getItemTagListId(item)}-slaying`;
}

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 * @param {{ path?: string }} [options] - where the tag list lives on the item (default
 *   "system.slaying"; ammo keeps it in "system.ammo_effects.slaying")
 */
export function bindWeaponSlayingEditor(sheet, html, { path = "system.slaying" } = {}) {
    if (!sheet.isEditable) return;
    const readTags = () => normalizeTagArray(path.split(".").reduce((o, k) => o?.[k], sheet.item));

    const ns = ".rmssWeaponSlayingUi";
    html.off(`click${ns}`, ".rmss-weapon-slaying [data-action='weapon-slaying-remove']");
    html.on(`click${ns}`, ".rmss-weapon-slaying [data-action='weapon-slaying-remove']", async (ev) => {
        ev.preventDefault();
        const chip = ev.currentTarget.closest("[data-tag-index]");
        if (!chip) return;
        const idx = Number(chip.dataset.tagIndex);
        if (!Number.isFinite(idx)) return;
        const tags = [...readTags()];
        tags.splice(idx, 1);
        await sheet.item.update({ [path]: tags });
        sheet.render(false);
    });

    html.off(`keydown${ns}`, ".rmss-weapon-slaying input.rmss-weapon-slaying-input");
    html.on(`keydown${ns}`, ".rmss-weapon-slaying input.rmss-weapon-slaying-input", async (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        ev.stopPropagation();
        const input = ev.currentTarget;
        const v = String(input.value ?? "").trim();
        if (!v) return;
        const tags = [...readTags()];
        const lower = tags.map((t) => t.toLowerCase());
        if (lower.includes(v.toLowerCase())) {
            input.value = "";
            return;
        }
        tags.push(v);
        await sheet.item.update({ [path]: tags });
        input.value = "";
        sheet.render(false);
    });
}
