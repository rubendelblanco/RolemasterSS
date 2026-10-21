/**
 * Shared by the tag editors (item tags, container allowed tags, creature tags, slaying and spell tags): the field is a text
 * input with a list of suggestions, and a tag is added with Enter. Choosing a suggestion from that list also adds it, without
 * having to press Enter.
 */

/**
 * Whether an `input` event is the user picking one of the suggestions of the field (and not typing in it).
 * Picking a suggestion fires an `input` event of type "insertReplacementText" (Chromium, Electron) or one with no type at all
 * (an event that is not an InputEvent); typing has its own types (insertText, deleteContentBackward...). The text must also
 * be one of the suggestions, so a spell-checker replacement or anything else is not taken for a pick.
 * @param {Event|JQuery.Event} ev
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
export function isDatalistSelection(ev, input) {
    const type = ev?.originalEvent?.inputType ?? ev?.inputType;
    if (type !== undefined && type !== "insertReplacementText") return false;
    const value = String(input?.value ?? "").trim().toLowerCase();
    if (!value) return false;
    return [...(input?.list?.options ?? [])].some((option) => String(option.value).trim().toLowerCase() === value);
}
