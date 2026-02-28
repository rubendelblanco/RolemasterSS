/**
 * Service to calculate facing (attacker vs defender) from token positions and rotation.
 * Foundry: rotation 0° = token faces south (down). Angles in degrees 0-360.
 */
export default class FacingService {

    /**
     * Facing values for the confirm-attack select: "" (front), "15" (flank), "25" (rear_flank), "35" (rear)
     */
    static FACING = {
        FRONT: "",
        FLANK: "15",
        REAR_FLANK: "25",
        REAR: "35"
    };

    /**
     * Calculate facing: where is the ATTACKER relative to the DEFENDER's orientation.
     * Front = attacker in front of defender; Rear = attacker behind defender.
     * @param {Token} attackerToken - Attacker's token
     * @param {Token} defenderToken - Defender's token
     * @returns {string} Facing value for the select: "", "15", "25", "35"
     */
    static calculateFacing(attackerToken, defenderToken) {
        if (!attackerToken || !defenderToken) return this.FACING.FRONT;

        const attCenter = this._getTokenCenter(attackerToken);
        const defCenter = this._getTokenCenter(defenderToken);
        const defDoc = defenderToken?.document ?? defenderToken;
        const defenderRotation = Number(defDoc.rotation ?? defenderToken?.rotation ?? 0);

        // Angle from defender to attacker (degrees: 0=east, 90=south in canvas)
        const dx = attCenter.x - defCenter.x;
        const dy = attCenter.y - defCenter.y;
        const angleToAttacker = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;

        // Foundry: rotation 0 = south (90° in math). Defender's facing = 90 + rotation.
        let diff = angleToAttacker - (90 + defenderRotation);
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        diff = Math.abs(diff);

        // Four 45° zones: front (0-45), flank (45-90), rear_flank (90-135), rear (135-180)
        if (diff <= 45) return this.FACING.FRONT;
        if (diff <= 90) return this.FACING.FLANK;
        if (diff <= 135) return this.FACING.REAR_FLANK;
        return this.FACING.REAR;
    }

    /**
     * Get Foundry rotation (0-360°) for attacker token to face the defender.
     * Foundry: rotation 0 = south. Uses canvas math: 0°=east, 90°=south.
     * @param {Token} attackerToken - Attacker's token
     * @param {Token} defenderToken - Defender's token
     * @returns {number|null} Rotation in degrees, or null if tokens invalid
     */
    static getRotationToFaceTarget(attackerToken, defenderToken) {
        if (!attackerToken || !defenderToken) return null;

        const attCenter = this._getTokenCenter(attackerToken);
        const defCenter = this._getTokenCenter(defenderToken);

        const dx = defCenter.x - attCenter.x;
        const dy = defCenter.y - attCenter.y;
        const angleToDefender = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;

        // Foundry rotation 0 = south (90° in math). rotation = angleToDefender - 90
        return (angleToDefender - 90 + 360) % 360;
    }

    /**
     * Get token center coordinates. Handles both Token (PlaceableObject) and TokenDocument.
     * @private
     */
    static _getTokenCenter(token) {
        if (token?.center) return { x: token.center.x, y: token.center.y };
        const doc = token?.document ?? token;
        const x = Number(doc.x ?? token?.x ?? 0);
        const y = Number(doc.y ?? token?.y ?? 0);
        const w = Number(doc.width ?? token?.width ?? 1);
        const h = Number(doc.height ?? token?.height ?? 1);
        return { x: x + w / 2, y: y + h / 2 };
    }

    /**
     * Get facing from token IDs. Fetches tokens from the scene.
     * @param {string} sceneId - Scene document ID
     * @param {string} attackerTokenId - Attacker token document ID
     * @param {string} defenderTokenId - Defender token document ID
     * @returns {string} Facing value
     */
    static getFacingFromTokenIds(sceneId, attackerTokenId, defenderTokenId) {
        if (!sceneId || !attackerTokenId || !defenderTokenId) return this.FACING.FRONT;

        const scene = game.scenes.get(sceneId);
        if (!scene) return this.FACING.FRONT;

        const tokens = scene.tokens ?? scene.getEmbeddedCollection?.("Token") ?? scene.data?.tokens;
        if (!tokens) return this.FACING.FRONT;

        const attackerToken = tokens.get?.(attackerTokenId) ?? tokens.find?.(t => t.id === attackerTokenId);
        const defenderToken = tokens.get?.(defenderTokenId) ?? tokens.find?.(t => t.id === defenderTokenId);

        if (!attackerToken || !defenderToken) return this.FACING.FRONT;

        return this.calculateFacing(attackerToken, defenderToken);
    }
}
