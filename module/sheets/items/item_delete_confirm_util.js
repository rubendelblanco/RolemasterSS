/**
 * Shared content builder for item-deletion confirmation dialogs: shows the item's
 * icon next to the text so a misclick is caught visually before reading the name.
 * @param {string} img - item image path
 * @param {string} text - already-localized confirmation text
 * @returns {string} HTML for Dialog.confirm's `content`
 */
export function buildDeleteConfirmContent(img, text) {
    const src = img || "icons/svg/item-bag.svg";
    return `<div style="display:flex;align-items:center;gap:10px;">
        <img src="${src}" width="48" height="48" style="border:1px solid #444;border-radius:4px;flex-shrink:0;">
        <p style="margin:0;">${text}</p>
    </div>`;
}
