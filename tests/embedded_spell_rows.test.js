/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { embeddedSpellRows } from "../module/sheets/spell_lists/embedded_spell_rows.js";

const spell = (name, level) => ({ name, system: { level } });

describe("embeddedSpellRows: sorted by level, each row keeps its position in the stored array", () => {
  it("a list stored in level order: the position is the same as the row", () => {
    const rows = embeddedSpellRows([spell("A", 1), spell("B", 2), spell("C", 3)]);
    expect(rows.map((r) => r._idx)).toEqual([0, 1, 2]);
  });

  it("a list NOT stored in level order: the row shows the sorted order but _idx points at the stored spell", () => {
    const stored = [spell("Tercero", 5), spell("Primero", 1), spell("Segundo", 3)];
    const rows = embeddedSpellRows(stored);
    expect(rows.map((r) => r.name)).toEqual(["Primero", "Segundo", "Tercero"]);
    // what the edit, delete and drag handlers read: stored[_idx] is the very spell of the row
    for (const row of rows) expect(stored[row._idx].name).toBe(row.name);
  });

  it("editing the row of the first spell touches the stored spell, not the one that happens to be at that sorted position", () => {
    const stored = [spell("Nivel 7", 7), spell("Nivel 1", 1)];
    const [primera] = embeddedSpellRows(stored);
    expect(primera.name).toBe("Nivel 1");
    expect(primera._idx).toBe(1);   // with the sorted position (0) this would have overwritten "Nivel 7"
  });

  it("spells of the same level keep their stored order, and each has its own position", () => {
    const stored = [spell("X", 2), spell("Y", 2), spell("Z", 2)];
    const rows = embeddedSpellRows(stored);
    expect(rows.map((r) => `${r.name}${r._idx}`)).toEqual(["X0", "Y1", "Z2"]);
  });

  it("does not change the stored array or its spells", () => {
    const stored = [spell("B", 2), spell("A", 1)];
    const copia = JSON.stringify(stored);
    embeddedSpellRows(stored);
    expect(JSON.stringify(stored)).toBe(copia);
    expect(stored[0]._idx).toBeUndefined();
  });

  it("copes with no spells, missing levels and non-numeric levels", () => {
    expect(embeddedSpellRows(undefined)).toEqual([]);
    expect(embeddedSpellRows([])).toEqual([]);
    const rows = embeddedSpellRows([{ name: "sin nivel" }, spell("con nivel", 3), spell("texto", "2")]);
    expect(rows.map((r) => r.name)).toEqual(["sin nivel", "texto", "con nivel"]);
  });
});
