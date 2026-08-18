import { normalizeTagArray } from "../items/item_tags_ui.js";

/**
 * Shared UI for {@link Actor#system.creature_tags} on npc/creature actors — what
 * kind(s) of creature this is (undead, dragon, orc...), so weapons with a matching
 * {@link Item#system.slaying} tag can auto-select the Slaying critical column
 * (see RMSSWeaponCriticalManager.getDefaultCriticalSubtype). Same vocabulary as
 * weapon_slaying_ui.js (CONFIG.rmss.slaying_types) so both sides can be compared.
 */

/**
 * @param {object} system - actor.system
 * @returns {string[]}
 */
export function getCreatureTagsArray(system) {
    return normalizeTagArray(system?.creature_tags);
}

/**
 * Stable id for datalist (must not change every render).
 * @param {Actor} actor
 */
export function getCreatureTagListId(actor) {
    return actor.id ?? actor._id ?? "rmss-creature-new";
}

/**
 * @param {ActorSheet} sheet
 * @param {jQuery} html
 */
export function bindCreatureTagsEditor(sheet, html) {
    if (!sheet.isEditable) return;

    const ns = ".rmssCreatureTagsUi";
    html.off(`click${ns}`, ".rmss-creature-tags [data-action='creature-tag-remove']");
    html.on(`click${ns}`, ".rmss-creature-tags [data-action='creature-tag-remove']", async (ev) => {
        ev.preventDefault();
        const chip = ev.currentTarget.closest("[data-tag-index]");
        if (!chip) return;
        const idx = Number(chip.dataset.tagIndex);
        if (!Number.isFinite(idx)) return;
        const tags = [...getCreatureTagsArray(sheet.actor.system)];
        tags.splice(idx, 1);
        await sheet.actor.update({ "system.creature_tags": tags });
        sheet.render(false);
    });

    html.off(`keydown${ns}`, ".rmss-creature-tags input.rmss-creature-tag-input");
    html.on(`keydown${ns}`, ".rmss-creature-tags input.rmss-creature-tag-input", async (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        ev.stopPropagation();
        const input = ev.currentTarget;
        const v = String(input.value ?? "").trim();
        if (!v) return;
        const tags = [...getCreatureTagsArray(sheet.actor.system)];
        const lower = tags.map((t) => t.toLowerCase());
        if (lower.includes(v.toLowerCase())) {
            input.value = "";
            return;
        }
        tags.push(v);
        await sheet.actor.update({ "system.creature_tags": tags });
        input.value = "";
        sheet.render(false);
    });
}
