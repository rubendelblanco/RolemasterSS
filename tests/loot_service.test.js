/**
 * Tests for LootService: free item/money pickups from a fixed loot container,
 * requested by players and confirmed by the GM (built on RequestCardService).
 */
import { jest } from '@jest/globals';
import LootService from '../module/actors/services/loot_service.js';

global.CONFIG = {
  rmss: {
    currency_exchange_rates: {
      mithril: 10000000, platinum: 1000000, gold: 100000, silver: 10000,
      bronze: 1000, copper: 100, tin: 10, iron: 1
    }
  }
};

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

function makeItem(overrides = {}) {
  const { system, ...rest } = overrides;
  const item = {
    id: 'item1',
    uuid: 'Actor.chest1.Item.item1',
    name: 'Old Sword',
    flags: {},
    system: { quantity: 4, cost: 40, weight: 8, unitCost: 10, unitWeight: 2, currency_type: 'silver', ...system },
    ...rest
  };
  item.toObject = () => JSON.parse(JSON.stringify({ _id: item.id, name: item.name, img: item.img, flags: item.flags, system: item.system }));
  item.update = jest.fn(async (data) => { applyPathUpdate(item, data); return item; });
  item.delete = jest.fn(async () => { item.deleted = true; return item; });
  return item;
}

function makeReceiver(overrides = {}) {
  const { system, ...rest } = overrides;
  const receiver = {
    id: 'receiver1', uuid: 'Actor.receiver1', name: 'Zirga',
    system: { money: { mithril: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 0 }, ...system },
    createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    testUserPermission: jest.fn(() => true),
    ...rest
  };
  receiver.update = jest.fn(async (data) => { applyPathUpdate(receiver, data); return receiver; });
  return receiver;
}

function makeChest(items, overrides = {}) {
  const { system, ...rest } = overrides;
  const itemsById = new Map(items.map(i => [i.id, i]));
  const chest = {
    id: 'chest1', uuid: 'Actor.chest1', name: 'Old Chest',
    items: { get: (id) => itemsById.get(id) },
    system: { money: { mithril: 0, platinum: 0, gold: 2, silver: 5, bronze: 0, copper: 12, tin: 0, iron: 0 }, ...system },
    ...rest
  };
  chest.update = jest.fn(async (data) => { applyPathUpdate(chest, data); return chest; });
  items.forEach(i => { i.parent = chest; });
  return chest;
}

beforeEach(() => {
  jest.clearAllMocks();
  game.user = { isGM: true };
  game.users = [{ id: 'gm1', isGM: true }];
  game.i18n.format = jest.fn((key, data) => `${key}::${JSON.stringify(data ?? {})}`);
  global.renderTemplate = jest.fn(async (_path, data) => JSON.stringify(data));
  global.fromUuid = jest.fn(async () => null);
  global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
});

describe('LootService.requestItem', () => {
  test('requires a receiver', async () => {
    const item = makeItem();
    const chest = makeChest([item]);

    await LootService.requestItem(chest, item, null, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.loot.no_receiver_selected');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('out of stock: warns, does not post a card', async () => {
    const item = makeItem({ system: { quantity: 0 } });
    const chest = makeChest([item]);
    const receiver = makeReceiver();

    await LootService.requestItem(chest, item, receiver, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.loot.out_of_stock');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('posts a card with no cost fields at all, without mutating anything', async () => {
    const item = makeItem();
    const chest = makeChest([item]);
    const receiver = makeReceiver();

    await LootService.requestItem(chest, item, receiver, 2);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.lootItemRequest).toEqual(expect.objectContaining({
      sourceActorUuid: chest.uuid, itemUuid: item.uuid, receiverActorUuid: receiver.uuid,
      quantity: 2, itemName: item.name, receiverName: receiver.name, resolved: false
    }));
    expect(payload.flags.rmss.lootItemRequest.cost).toBeUndefined();

    expect(receiver.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
  });

  test('clamps requested quantity to available stock', async () => {
    const item = makeItem({ system: { quantity: 3 } });
    const chest = makeChest([item]);
    const receiver = makeReceiver();

    await LootService.requestItem(chest, item, receiver, 999);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.lootItemRequest.quantity).toBe(3);
  });
});

describe('LootService.resolveItemRequest', () => {
  function makeMessage(data) {
    return {
      getFlag: jest.fn((scope, key) => (scope === 'rmss' && key === 'lootItemRequest' ? data : undefined)),
      update: jest.fn().mockResolvedValue(undefined)
    };
  }

  test('accept: transfers the item for free, no currency touched', async () => {
    const item = makeItem(); // qty 4, weight 8 -> unit weight 2
    const chest = makeChest([item]);
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      quantity: 3, itemName: item.name, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveItemRequest(message, 'accept');

    expect(receiver.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 3, unitWeight: 2, weight: 6 }) })
    ]);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 1 }));
    expect(receiver.update).not.toHaveBeenCalled(); // no money moves for an item pickup
    expect(chest.update).not.toHaveBeenCalled();

    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'approved' }));
  });

  test('accept: partial fulfillment reports the quantity actually taken, not the originally requested one', async () => {
    // Only 1 left by accept time (someone else took 3 in the meantime), but the
    // card still remembers the original request for 3 — the message must say 1.
    const item = makeItem({ system: { quantity: 1, weight: 2 } });
    const chest = makeChest([item]);
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      quantity: 3, itemName: item.name, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveItemRequest(message, 'accept');

    expect(receiver.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 1 }) })
    ]);
    expect(game.i18n.format).toHaveBeenCalledWith('rmss.loot.item_taken_success', expect.objectContaining({ qty: 1 }));
  });

  test('taking the whole remaining stack deletes the source item', async () => {
    const item = makeItem({ system: { quantity: 2, weight: 4 } });
    const chest = makeChest([item]);
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      quantity: 2, itemName: item.name, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveItemRequest(message, 'accept');

    expect(item.delete).toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
  });

  test('accept: re-validates — item already gone means no transfer, reported not thrown', async () => {
    const item = makeItem({ system: { quantity: 0 } }); // someone else already took it
    const chest = makeChest([item]);
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      quantity: 1, itemName: item.name, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveItemRequest(message, 'accept');

    expect(receiver.createEmbeddedDocuments).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'stock_changed' }));
  });

  test('reject: no mutation, card marked rejected', async () => {
    const item = makeItem();
    const chest = makeChest([item]);
    const receiver = makeReceiver();
    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      quantity: 1, itemName: item.name, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveItemRequest(message, 'reject');

    expect(item.update).not.toHaveBeenCalled();
    expect(item.delete).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'rejected' }));
  });
});

describe('LootService.requestMoney', () => {
  test('requires a receiver', async () => {
    const chest = makeChest([]);

    await LootService.requestMoney(chest, null, { gold: 1 });

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.loot.no_receiver_selected');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('clamps requested amounts to what is actually in the chest, per denomination', async () => {
    const chest = makeChest([]); // gold:2, silver:5, copper:12
    const receiver = makeReceiver();

    await LootService.requestMoney(chest, receiver, { gold: 999, silver: 2, copper: 0, platinum: 5 });

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.lootMoneyRequest.amounts).toEqual({
      mithril: 0, platinum: 0, gold: 2, silver: 2, bronze: 0, copper: 0, tin: 0, iron: 0
    });
  });

  test('selecting nothing (all zero) warns and posts no card', async () => {
    const chest = makeChest([]);
    const receiver = makeReceiver();

    await LootService.requestMoney(chest, receiver, {});

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.loot.no_money_selected');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });
});

describe('LootService.resolveMoneyRequest', () => {
  function makeMessage(data) {
    return {
      getFlag: jest.fn((scope, key) => (scope === 'rmss' && key === 'lootMoneyRequest' ? data : undefined)),
      update: jest.fn().mockResolvedValue(undefined)
    };
  }

  test('accept: moves exact coins between chest and receiver, no exchange-rate math', async () => {
    const chest = makeChest([]); // gold:2, silver:5, copper:12
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [chest.uuid]: chest, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      amounts: { mithril: 0, platinum: 0, gold: 1, silver: 5, bronze: 0, copper: 0, tin: 0, iron: 0 },
      receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveMoneyRequest(message, 'accept');

    expect(chest.system.money.gold).toBe(1);
    expect(chest.system.money.silver).toBe(0);
    expect(chest.system.money.copper).toBe(12); // untouched, not requested
    expect(receiver.system.money.gold).toBe(1);
    expect(receiver.system.money.silver).toBe(5);

    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'approved' }));
  });

  test('accept: re-validates — coins already taken by someone else means no transfer', async () => {
    const chest = makeChest([], { system: { money: { gold: 0, silver: 0 } } }); // emptied since the request was made
    const receiver = makeReceiver();
    global.fromUuid = jest.fn(async (uuid) => ({ [chest.uuid]: chest, [receiver.uuid]: receiver }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      amounts: { mithril: 0, platinum: 0, gold: 2, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 0 },
      receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveMoneyRequest(message, 'accept');

    expect(receiver.update).not.toHaveBeenCalled();
    expect(chest.update).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'stock_changed' }));
  });

  test('reject: no mutation, card marked rejected', async () => {
    const chest = makeChest([]);
    const receiver = makeReceiver();
    const message = makeMessage({
      resolved: false, sourceActorUuid: chest.uuid, receiverActorUuid: receiver.uuid,
      amounts: { gold: 1 }, receiverName: receiver.name, bodyHtml: '<p>q</p>'
    });

    await LootService.resolveMoneyRequest(message, 'reject');

    expect(chest.update).not.toHaveBeenCalled();
    expect(receiver.update).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'rejected' }));
  });
});
