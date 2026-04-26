/**
 * Geometry and defense helpers for BE area (ball) spells using Foundry measured templates.
 */

/**
 * DB for area elemental attacks: ignore shield bonus when breakdown exists.
 * @param {Actor} actor
 * @returns {number}
 */
export function getAreaDefenseDb(actor) {
    const info = actor?.system?.armor_info;
    if (!info) return 0;
    const total = Number(info.total_db) || 0;
    const shield = Number(info.shield_bonus);
    if (Number.isFinite(shield)) {
        return Math.max(0, total - shield);
    }
    return Math.max(0, total);
}

/**
 * @param {MeasuredTemplateDocument|object} doc
 * @returns {string|null}
 */
export function getTemplateAuthorUserId(doc) {
    if (!doc) return null;
    const a = doc.author;
    if (typeof a === "string") return a;
    if (a && typeof a === "object" && a.id) return a.id;
    const u = doc.user;
    if (typeof u === "string") return u;
    if (u && typeof u === "object" && u.id) return u.id;
    return null;
}

/**
 * Most recently updated circle template on the current scene placed by the given user.
 * @param {string} userId
 * @returns {MeasuredTemplate|null}
 */
export function getLatestCircleTemplateForUser(userId) {
    if (typeof canvas === "undefined" || !canvas?.ready || !canvas.templates?.placeables) return null;
    const candidates = canvas.templates.placeables.filter((t) => {
        if (t.document?.t !== "circle") return false;
        return getTemplateAuthorUserId(t.document) === userId;
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        const ta = a.document?._stats?.modifiedTime ?? 0;
        const tb = b.document?._stats?.modifiedTime ?? 0;
        if (tb !== ta) return tb - ta;
        return String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
    return candidates[0];
}

/**
 * Whether a world/canvas point lies inside the template (handles v13 local shape vs world coords).
 * @param {MeasuredTemplate} template
 * @param {{ x: number, y: number }} point
 * @returns {boolean}
 */
export function isPointInsideTemplate(template, point) {
    if (!template || template.document?.t !== "circle" || !point) return false;
    if (typeof template.testPoint === "function") {
        return template.testPoint(point);
    }
    const shape = template.shape;
    if (!shape?.contains) return false;
    return shape.contains(point.x, point.y);
}

/**
 * Tokens with actors (armor_info) whose center lies inside the template shape.
 * @param {MeasuredTemplate} template
 * @returns {Token[]}
 */
export function getTokensInsideTemplate(template) {
    if (!template || template.document?.t !== "circle") return [];
    return canvas.tokens.placeables.filter((t) => {
        if (!t.actor?.system?.armor_info) return false;
        return isPointInsideTemplate(template, t.center);
    });
}

/**
 * Epicenter (world x,y) for a circle template.
 * @param {MeasuredTemplate} template
 * @returns {{ x: number, y: number }|null}
 */
export function getCircleEpicenter(template) {
    const d = template?.document;
    if (!d || d.t !== "circle") return null;
    return { x: d.x, y: d.y };
}

/**
 * True if token center is near the epicenter (for +20 center bonus).
 * @param {Token} token
 * @param {number} epicenterX
 * @param {number} epicenterY
 * @returns {boolean}
 */
export function isTokenAtEpicenter(token, epicenterX, epicenterY) {
    const c = token.center;
    const gridSize = canvas?.grid?.size ?? 100;
    const epsilon = Math.max(20, gridSize * 0.15);
    const dx = c.x - epicenterX;
    const dy = c.y - epicenterY;
    return dx * dx + dy * dy <= epsilon * epsilon;
}

/**
 * Stable order: distance to epicenter, then token id.
 * @param {Token[]} tokens
 * @param {number} epicenterX
 * @param {number} epicenterY
 * @returns {Token[]}
 */
export function sortTokensByEpicenter(tokens, epicenterX, epicenterY) {
    const copy = [...tokens];
    copy.sort((a, b) => {
        const ca = a.center;
        const cb = b.center;
        const da = (ca.x - epicenterX) ** 2 + (ca.y - epicenterY) ** 2;
        const db = (cb.x - epicenterX) ** 2 + (cb.y - epicenterY) ** 2;
        if (da !== db) return da - db;
        return String(a.id).localeCompare(String(b.id));
    });
    return copy;
}
