/**
 * Tests for RollTableStockService: populating a merchant's/loot's stock from a
 * Foundry RollTable, Enhanced-Journal-style.
 */
import { jest } from '@jest/globals';
import RollTableStockService from '../module/actors/services/roll_table_stock_service.js';

function applyPathUpdate(target, data) {
  for (const [path, value] of Object.entries(data)) {
    const parts = path.split('.');
    let obj = target;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = obj[parts[i]] ?? {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }
}

function makeSourceItem(overrides = {}) {
  const { system, ...rest } = overrides;
  const item = {
    id: 'src1',
    uuid: 'Compendium.rmss.items.Item.src1',
    documentName: 'Item',
    type: 'item',
    name: 'Ration',
    img: 'icons/ration.webp',
    flags: {},
    system: { quantity: 1, cost: 5, unitCost: 5, weight: 1, unitWeight: 1, currency_type: 'copper', ...system },
    ...rest
  };
  item.toObject = () => JSON.parse(JSON.stringify({
    _id: item.id, name: item.name, img: item.img, flags: item.flags, system: item.system, type: item.type
  }));
  return item;
}

function makeStockItem(overrides = {}) {
  const item = makeSourceItem({ id: 'stock1', uuid: 'Actor.merchant1.Item.stock1', ...overrides });
  item.update = jest.fn(async (data) => { applyPathUpdate(item, data); return item; });
  item.delete = jest.fn(async () => { item.deleted = true; return item; });
  return item;
}

function makeActor(existingItems = []) {
  const items = existingItems;
  items.filter = Array.prototype.filter.bind(items);
  items.find = Array.prototype.find.bind(items);

  const actor = {
    items,
    createEmbeddedDocuments: jest.fn(async (docType, dataArr) => {
      const created = dataArr.map(d => {
        const doc = { id: `new-${items.length}-${Math.random()}`, ...JSON.parse(JSON.stringify(d)) };
        doc.update = jest.fn(async (data) => { applyPathUpdate(doc, data); return doc; });
        return doc;
      });
      items.push(...created);
      return created;
    }),
    deleteEmbeddedDocuments: jest.fn(async (docType, ids) => {
      for (const id of ids) {
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) items.splice(idx, 1);
      }
    })
  };
  return actor;
}

function makeTable(drawSequence) {
  let callIndex = 0;
  return {
    formula: '1d10',
    draw: jest.fn(async () => {
      if (callIndex >= drawSequence.length) throw new Error('table exhausted');
      return { results: drawSequence[callIndex++] };
    }),
    resetResults: jest.fn(async () => { callIndex = 0; })
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.Roll = class {
    constructor(formula) { this.formula = String(formula); }
    async evaluate() {
      const n = Number(this.formula);
      this.total = Number.isFinite(n) ? n : 3; // dice formulas resolve to a fixed 3 for deterministic tests
      return this;
    }
  };
  global.fromUuid = jest.fn(async () => null);
  global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
});

describe('RollTableStockService.populate', () => {
  test('draws a linked item and adds it as new stock with correct unit cost/weight', async () => {
    const source = makeSourceItem({ system: { quantity: 1, cost: 8, unitCost: 8, weight: 2, unitWeight: 2 } });
    global.fromUuid = jest.fn(async (uuid) => (uuid === source.uuid ? source : null));
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '1' });

    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 1, unitCost: 8, cost: 8, unitWeight: 2, weight: 2 }) })
    ]);
  });

  test('weapon/armor sources: unit cost/weight come from unitCost/weight, not cost/quantity', async () => {
    const sword = makeSourceItem({
      type: 'weapon', uuid: 'Compendium.rmss.weapons.Item.sword',
      system: { quantity: 1, cost: 0, unitCost: 30, weight: 4, unitWeight: 0 }
    });
    global.fromUuid = jest.fn(async (uuid) => (uuid === sword.uuid ? sword : null));
    const table = makeTable([[{ documentUuid: sword.uuid }]]);
    const actor = makeActor([]);

    await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '1' });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ unitCost: 30, cost: 30, unitWeight: 4, weight: 4 }) })
    ]);
  });

  test('weapon/armor: quantity formula is ignored — always draws exactly 1, never a stack', async () => {
    const sword = makeSourceItem({ type: 'weapon', system: { quantity: 1, cost: 0, unitCost: 30, weight: 4 } });
    global.fromUuid = jest.fn(async () => sword);
    const table = makeTable([[{ documentUuid: sword.uuid }]]);
    const actor = makeActor([]);

    // The local Roll mock would resolve "1d6" to 3 for a stackable item; a weapon must ignore that.
    await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '1d6' });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 1 }) })
    ]);
  });

  test('weapon/armor: drawing the same weapon twice creates two separate entries instead of merging quantity', async () => {
    const sword = makeSourceItem({ type: 'weapon', name: 'Iron Sword', system: { quantity: 1, cost: 0, unitCost: 30, weight: 4 } });
    global.fromUuid = jest.fn(async () => sword);
    const table = makeTable([[{ documentUuid: sword.uuid }], [{ documentUuid: sword.uuid }]]);
    const actor = makeActor([]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 2, duplicateItems: 'add' });

    expect(added).toBe(2);
    expect(skipped).toBe(0);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
    // Every created entry stays at quantity 1 — none of them get merged into an "x2".
    for (const [, dataArr] of actor.createEmbeddedDocuments.mock.calls) {
      expect(dataArr[0].system.quantity).toBe(1);
    }
  });

  test('generic item marked is_stackable: false is also drawn one at a time', async () => {
    const relic = makeSourceItem({ type: 'item', system: { quantity: 1, cost: 10, unitCost: 10, is_stackable: false } });
    global.fromUuid = jest.fn(async () => relic);
    const table = makeTable([[{ documentUuid: relic.uuid }]]);
    const actor = makeActor([]);

    await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '1d6' });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 1 }) })
    ]);
  });

  test('text-only results (no linked document) are skipped', async () => {
    const table = makeTable([[{ documentUuid: null }]]);
    const actor = makeActor([]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 1 });

    expect(added).toBe(0);
    expect(skipped).toBe(1);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('results resolving to a non-Item or disallowed item type are skipped', async () => {
    const notAnItem = { documentName: 'Actor', type: 'character', uuid: 'Actor.someone' };
    const wrongType = makeSourceItem({ type: 'spell', uuid: 'Compendium.rmss.spells.Item.fireball' });
    global.fromUuid = jest.fn(async (uuid) => ({ [notAnItem.uuid]: notAnItem, [wrongType.uuid]: wrongType }[uuid] ?? null));
    const table = makeTable([[{ documentUuid: notAnItem.uuid }, { documentUuid: wrongType.uuid }]]);
    const actor = makeActor([]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 1 });

    expect(added).toBe(0);
    expect(skipped).toBe(2);
  });

  test('quantity formula: dice notation is rolled per drawn item', async () => {
    const source = makeSourceItem();
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([]);

    await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '1d6' });

    // The local Roll mock resolves any dice formula to a fixed 3.
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 3 }) })
    ]);
  });

  test('duplicate items, mode "add": merges the new draw into the existing stock entry\'s quantity', async () => {
    const source = makeSourceItem({ name: 'Ration', img: 'icons/ration.webp' });
    const existing = makeStockItem({ name: 'Ration', img: 'icons/ration.webp', system: { quantity: 5, cost: 25, unitCost: 5, weight: 5, unitWeight: 1 } });
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([existing]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 1, quantityFormula: '2', duplicateItems: 'add' });

    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 7 }));
  });

  test('duplicate items, mode "ignore": leaves the existing stock entry untouched', async () => {
    const source = makeSourceItem({ name: 'Ration', img: 'icons/ration.webp' });
    const existing = makeStockItem({ name: 'Ration', img: 'icons/ration.webp', system: { quantity: 5 } });
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([existing]);

    const { added, skipped } = await RollTableStockService.populate(actor, table, { draws: 1, duplicateItems: 'ignore' });

    expect(added).toBe(0);
    expect(skipped).toBe(1);
    expect(existing.update).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('clearItems "clear": removes existing stock before populating', async () => {
    const oldStock = makeStockItem();
    const source = makeSourceItem({ name: 'New Item' });
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([oldStock]);

    await RollTableStockService.populate(actor, table, { draws: 1, clearItems: 'clear' });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', [oldStock.id]);
  });

  test('clearItems "keep" (default): does not touch existing stock', async () => {
    const oldStock = makeStockItem();
    const source = makeSourceItem({ name: 'New Item' });
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const actor = makeActor([oldStock]);

    await RollTableStockService.populate(actor, table, { draws: 1, clearItems: 'keep' });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('table exhausted, no reset requested: stops early instead of throwing', async () => {
    const source = makeSourceItem();
    global.fromUuid = jest.fn(async () => source);
    const table = makeTable([[{ documentUuid: source.uuid }]]); // only 1 draw available
    const actor = makeActor([]);

    const { added } = await RollTableStockService.populate(actor, table, { draws: 3, resetWhenExhausted: false });

    expect(added).toBe(1); // only the first draw succeeded
    expect(table.resetResults).not.toHaveBeenCalled();
  });

  test('table exhausted, reset requested: resets and keeps drawing', async () => {
    const source = makeSourceItem();
    global.fromUuid = jest.fn(async () => source);
    // Only one entry "available" per reset cycle; drawSequence models 2 successful
    // draws before exhaustion on each cycle (draw() throws once exhausted).
    const table = makeTable([[{ documentUuid: source.uuid }]]);
    const originalDraw = table.draw;
    let resetCount = 0;
    table.resetResults = jest.fn(async () => { resetCount++; });
    // After the first (only) queued draw, force every subsequent draw to also throw
    // unless a reset just happened — simulate via a small wrapper.
    let drawsSinceReset = 0;
    table.draw = jest.fn(async () => {
      if (drawsSinceReset >= 1) throw new Error('exhausted');
      drawsSinceReset++;
      return { results: [{ documentUuid: source.uuid }] };
    });
    const originalReset = table.resetResults;
    table.resetResults = jest.fn(async () => { drawsSinceReset = 0; resetCount++; });

    const actor = makeActor([]);
    const { added } = await RollTableStockService.populate(actor, table, { draws: 2, resetWhenExhausted: true, duplicateItems: 'add' });

    expect(resetCount).toBeGreaterThan(0);
    expect(added).toBe(2);
  });
});
