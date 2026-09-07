/**
 * @jest-environment node
 */
import RMSSTableManager from "../module/combat/rmss_table_manager.js";
import {
    getAreaDefenseDb,
    isPointInsideTemplate,
    getCircleEpicenter,
    getCircleRadiusInGridUnits,
    getTemplateAuthorUserId
} from "../module/combat/services/area_spell_resolution_service.js";

function makeRow(resultRange, at1 = "-") {
    const r = { Result: resultRange, "1": at1 };
    for (let i = 2; i <= 20; i++) {
        r[String(i)] = at1;
    }
    return r;
}

const sampleBallTable = {
    um: ["01-04", "96-100"],
    rows: [
        makeRow("01-04", "F"),
        makeRow("05-10", "1"),
        makeRow("11-95", "5"),
        makeRow("96-100", "9")
    ]
};

describe("resolveBallEarAttackValue", () => {
    test("natural in UM band keeps natural as attack column", () => {
        const r = RMSSTableManager.resolveBallEarAttackValue("test", 3, 99, sampleBallTable);
        expect(r).toEqual({ attackColumnValue: 3, isUm: true });
    });

    test("natural outside UM: total mod. sólo en complemento de `um` (p. ej. 5..95), nunca 01-04 vía mod.", () => {
        expect(
            RMSSTableManager.resolveBallEarAttackValue("test", 50, 120, sampleBallTable)
        ).toEqual({ attackColumnValue: 95, isUm: false });
        expect(
            RMSSTableManager.resolveBallEarAttackValue("test", 50, 1, sampleBallTable)
        ).toEqual({ attackColumnValue: 5, isUm: false });
    });

    test("natural 10, total 0: no se mete en 01-04 por modificador; mín. 5", () => {
        expect(
            RMSSTableManager.resolveBallEarAttackValue("test", 10, 0, sampleBallTable)
        ).toEqual({ attackColumnValue: 5, isUm: false });
    });
});

describe("isNaturalInUnmodifiedRanges", () => {
    test("3 entra en 01-04", () => {
        expect(
            RMSSTableManager.isNaturalInUnmodifiedRanges(3, {
                um: ["01-04", "96-100"]
            })
        ).toBe(true);
    });
    test("10 no entra en 01-04+96+ en esa tabla de prueba", () => {
        expect(
            RMSSTableManager.isNaturalInUnmodifiedRanges(10, {
                um: ["01-04", "96-100"]
            })
        ).toBe(false);
    });
});

describe("getResultIndexBoundsOutsideUnmodified / getSpellModifiedClamps", () => {
    const umOnly = {
        um: ["01-04", "96-100"],
        rows: sampleBallTable.rows
    };
    test("sin anulación: complemento de `um` en 1..100 (ej. 5..95)", () => {
        expect(RMSSTableManager.getResultIndexBoundsOutsideUnmodified(umOnly, 100)).toEqual({
            min: 5,
            max: 95
        });
    });
    test("modified_result_clamps min bajo el derivado se ignora (no violar tramos um)", () => {
        const c = RMSSTableManager.getSpellModifiedClamps(
            { ...umOnly, modified_result_clamps: { min: 3 } },
            100
        );
        expect(c).toEqual({ min: 5, max: 95 });
    });
    test("modified_result_clamps puede estrechar: min 8", () => {
        const c = RMSSTableManager.getSpellModifiedClamps(
            { ...umOnly, modified_result_clamps: { min: 8 } },
            100
        );
        expect(c).toEqual({ min: 8, max: 95 });
    });
});

describe("capSpellDamageLookupIndex (índice daño vs UM 96–100)", () => {
    const tableMax = 100;
    test("no-UM: tope desde `getSpellModifiedClamps` (p. ej. 95) al pasar attackTable", () => {
        expect(
            RMSSTableManager.capSpellDamageLookupIndex(104, false, tableMax, sampleBallTable)
        ).toBe(95);
        expect(
            RMSSTableManager.capSpellDamageLookupIndex(100, false, tableMax, sampleBallTable)
        ).toBe(95);
    });
    test("UM: permite hasta tope de tabla (ej. 100)", () => {
        expect(
            RMSSTableManager.capSpellDamageLookupIndex(115, true, tableMax, sampleBallTable)
        ).toBe(100);
        expect(
            RMSSTableManager.capSpellDamageLookupIndex(99, true, tableMax, sampleBallTable)
        ).toBe(99);
    });
});

describe("isBallGlobalFailureRow", () => {
    test("AT1 F row is global failure", () => {
        expect(RMSSTableManager.isBallGlobalFailureRow("test", sampleBallTable, 3)).toBe(true);
    });
    test("normal row is not global failure", () => {
        expect(RMSSTableManager.isBallGlobalFailureRow("test", sampleBallTable, 50)).toBe(false);
    });
});

// v14 dropped MeasuredTemplate: a "circle template" is now a single-shape circle Region, with
// the shape's own x/y/radius (scene pixels) standing in for the old document.x/y/distance.
function makeCircleRegion({ x = 100, y = 200, radius = 50, authorId = null, createdAt = null } = {}) {
    return {
        document: {
            shapes: [{ type: "circle", x, y, radius }],
            flags: authorId ? { rmss: { authorId, createdAt } } : {},
            getFlag: (scope, key) => (scope === "rmss" ? { authorId, createdAt }[key] : undefined)
        }
    };
}

describe("isPointInsideTemplate", () => {
    test("point at/near the circle center is inside", () => {
        const template = makeCircleRegion({ x: 100, y: 200, radius: 50 });
        expect(isPointInsideTemplate(template, { x: 100, y: 200 })).toBe(true);
        expect(isPointInsideTemplate(template, { x: 130, y: 200 })).toBe(true);
    });
    test("point outside the radius is not inside", () => {
        const template = makeCircleRegion({ x: 100, y: 200, radius: 50 });
        expect(isPointInsideTemplate(template, { x: 500, y: 500 })).toBe(false);
    });
    test("non-circle or multi-shape region is never inside", () => {
        const notCircle = { document: { shapes: [{ type: "rectangle", x: 0, y: 0 }] } };
        expect(isPointInsideTemplate(notCircle, { x: 0, y: 0 })).toBe(false);
    });
});

describe("getCircleEpicenter", () => {
    test("returns the shape's x/y", () => {
        const template = makeCircleRegion({ x: 42, y: 84, radius: 10 });
        expect(getCircleEpicenter(template)).toEqual({ x: 42, y: 84 });
    });
    test("null for a non-circle template", () => {
        expect(getCircleEpicenter({ document: { shapes: [] } })).toBeNull();
    });
});

describe("getCircleRadiusInGridUnits", () => {
    const originalCanvas = global.canvas;
    afterEach(() => { global.canvas = originalCanvas; });

    test("converts scene-pixel radius to grid distance units", () => {
        global.canvas = { grid: { size: 100, distance: 5 } };
        const template = makeCircleRegion({ radius: 280 });
        expect(getCircleRadiusInGridUnits(template)).toBe(14);
    });
});

describe("getTemplateAuthorUserId", () => {
    test("reads flags.rmss.authorId via getFlag", () => {
        const region = makeCircleRegion({ authorId: "user123" }).document;
        expect(getTemplateAuthorUserId(region)).toBe("user123");
    });
    test("null when no author flag stamped yet", () => {
        expect(getTemplateAuthorUserId({ getFlag: () => undefined })).toBeNull();
    });
});

describe("getAreaDefenseDb", () => {
    test("subtracts shield_bonus when present", () => {
        const actor = { system: { armor_info: { total_db: 40, shield_bonus: 15 } } };
        expect(getAreaDefenseDb(actor)).toBe(25);
    });
    test("uses total_db when shield missing", () => {
        const actor = { system: { armor_info: { total_db: 30 } } };
        expect(getAreaDefenseDb(actor)).toBe(30);
    });
});
