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
 * v14 removed MeasuredTemplate entirely - "circle templates" are now single-shape circle
 * Regions (placed via Region Controls > Draw Circle / Measured Template Mode). Regions carry
 * no author field of their own, so registerCombatHooks() stamps flags.rmss.authorId/createdAt
 * on them right after creation (via a GM socket call, since a player may not have update
 * permission on the Region document otherwise) - see rmss.js's "stampCircleTemplateAuthor".
 * @param {RegionDocument|object} doc
 * @returns {string|null}
 */
export function getTemplateAuthorUserId(doc) {
    return doc?.getFlag?.("rmss", "authorId") ?? doc?.flags?.rmss?.authorId ?? null;
}

/**
 * Single-shape circle on a Region document, or null if it isn't a plain circle template.
 * @param {RegionDocument|object} doc
 * @returns {{type: string, x: number, y: number, radius: number}|null}
 */
function getCircleShape(doc) {
    const shapes = doc?.shapes;
    if (!Array.isArray(shapes) || shapes.length !== 1) return null;
    const shape = shapes[0];
    return shape?.type === "circle" ? shape : null;
}

/**
 * Most recently created circle template Region on the current scene placed by the given user.
 * @param {string} userId
 * @returns {Region|null}
 */
export function getLatestCircleTemplateForUser(userId) {
    if (typeof canvas === "undefined" || !canvas?.ready || !canvas.regions?.placeables) return null;
    const candidates = canvas.regions.placeables.filter((r) => {
        if (!getCircleShape(r.document)) return false;
        return getTemplateAuthorUserId(r.document) === userId;
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        const ta = a.document?.getFlag?.("rmss", "createdAt") ?? 0;
        const tb = b.document?.getFlag?.("rmss", "createdAt") ?? 0;
        if (tb !== ta) return tb - ta;
        return String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
    return candidates[0];
}

/**
 * Whether a world/canvas point lies inside the circle template (plain distance check against
 * the shape's own x/y/radius, which Region stores in scene pixel units - same coordinate space
 * as Token#center).
 * @param {Region} template
 * @param {{ x: number, y: number }} point
 * @returns {boolean}
 */
export function isPointInsideTemplate(template, point) {
    const shape = getCircleShape(template?.document);
    if (!shape || !point) return false;
    const dx = point.x - shape.x;
    const dy = point.y - shape.y;
    return (dx * dx + dy * dy) <= shape.radius * shape.radius;
}

/**
 * Tokens with actors (armor_info) whose center lies inside the template shape.
 * @param {Region} template
 * @returns {Token[]}
 */
export function getTokensInsideTemplate(template) {
    if (!getCircleShape(template?.document)) return [];
    return canvas.tokens.placeables.filter((t) => {
        if (!t.actor?.system?.armor_info) return false;
        return isPointInsideTemplate(template, t.center);
    });
}

/**
 * Epicenter (world x,y) for a circle template.
 * @param {Region} template
 * @returns {{ x: number, y: number }|null}
 */
export function getCircleEpicenter(template) {
    const shape = getCircleShape(template?.document);
    return shape ? { x: shape.x, y: shape.y } : null;
}

/**
 * Circle template radius converted from scene pixels (how Region stores it) to grid distance
 * units (e.g. feet) - the unit the old MeasuredTemplateDocument#distance field used to give
 * directly, and what spellContext.areaDiameter/callers downstream still expect.
 * @param {Region} template
 * @returns {number|null}
 */
export function getCircleRadiusInGridUnits(template) {
    const shape = getCircleShape(template?.document);
    if (!shape) return null;
    const gridSize = canvas?.grid?.size || 100;
    const gridDistance = canvas?.grid?.distance || 1;
    return (shape.radius / gridSize) * gridDistance;
}

/**
 * GM-only: stamp the creating user's id onto a freshly-placed circle template Region.
 * Called via socket.executeAsGM from registerCombatHooks()'s "createRegion" hook, since the
 * creating player may not hold update permission on the Region document.
 * @param {string} regionUuid
 * @param {string} userId
 */
export async function stampCircleTemplateAuthorGM(regionUuid, userId) {
    const region = await fromUuid(regionUuid);
    if (!region) return;
    if (region.getFlag("rmss", "authorId")) return;
    await region.update({ "flags.rmss.authorId": userId, "flags.rmss.createdAt": Date.now() });
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
