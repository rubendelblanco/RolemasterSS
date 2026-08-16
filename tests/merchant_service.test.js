/**
 * Tests for MerchantService: direct GM sale, player purchase requests, and GM
 * accept/reject resolution — including the UUID-based document resolution that
 * fixes stale/default data on unlinked-token merchants (see PR #117).
 */
import { jest } from '@jest/globals';
import MerchantService from '../module/actors/services/merchant_service.js';
import CurrencyService from '../module/actors/services/currency_service.js';

global.CONFIG = {
  rmss: {
    currency_exchange_rates: {
      mithril: 10000000,
      platinum: 1000000,
      gold: 100000,
      silver: 10000,
      bronze: 1000,
      copper: 100,
      tin: 10,
      iron: 1
    }
  }
};

/** Applies a Foundry-style {"system.foo.bar": value} update onto a plain object. */
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
    uuid: 'Actor.merchant1.Item.item1',
    name: 'Healing Herb',
    img: 'icons/item1.webp',
    flags: {},
    system: {
      quantity: 10,
      cost: 50,
      weight: 5,
      unitCost: 5,
      unitWeight: 0.5,
      currency_type: 'silver',
      ...system
    },
    ...rest
  };
  item.toObject = () => JSON.parse(JSON.stringify({
    _id: item.id, name: item.name, img: item.img, flags: item.flags, system: item.system
  }));
  item.update = jest.fn(async (data) => { applyPathUpdate(item, data); return item; });
  item.delete = jest.fn(async () => { item.deleted = true; return item; });
  item.getFlag = jest.fn((scope, key) => item.flags?.[scope]?.[key]);
  item.setFlag = jest.fn(async (scope, key, value) => {
    item.flags[scope] = item.flags[scope] ?? {};
    item.flags[scope][key] = value;
    return item;
  });
  return item;
}

function makeBuyer(overrides = {}) {
  const { system, ...rest } = overrides;
  const buyer = {
    id: 'buyer1',
    uuid: 'Actor.buyer1',
    name: 'Zirga',
    img: 'icons/buyer1.webp',
    system: { money: { mithril: 0, platinum: 0, gold: 0, silver: 20, bronze: 0, copper: 0, tin: 0, iron: 0 }, ...system },
    createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    testUserPermission: jest.fn(() => true),
    ...rest
  };
  buyer.update = jest.fn(async (data) => { applyPathUpdate(buyer, data); return buyer; });
  return buyer;
}

function makeMerchant(items, overrides = {}) {
  const { system, ...rest } = overrides;
  const itemsById = new Map(items.map(i => [i.id, i]));
  const merchant = {
    id: 'merchant1',
    uuid: 'Actor.merchant1',
    name: 'Shopkeep',
    items: { get: (id) => itemsById.get(id) },
    system: { money: { silver: 0 }, buyRate: 50, ...system },
    createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    testUserPermission: jest.fn(() => true),
    ...rest
  };
  merchant.update = jest.fn(async (data) => { applyPathUpdate(merchant, data); return merchant; });
  items.forEach(i => { i.parent = merchant; });
  return merchant;
}

beforeEach(() => {
  jest.clearAllMocks();
  game.user = { isGM: true };
  game.users = [{ id: 'gm1', isGM: true }];
  game.i18n.format = jest.fn((key, data) => `${key}::${JSON.stringify(data ?? {})}`);
  // Returns the render data as JSON so tests can assert on it directly instead of
  // depending on real Handlebars/the request-card.html template.
  global.renderTemplate = jest.fn(async (_path, data) => JSON.stringify(data));
  global.fromUuid = jest.fn(async () => null);
  global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
});

describe('MerchantService.sellItem (GM direct sale)', () => {
  test('non-GM cannot sell', async () => {
    game.user.isGM = false;
    const item = makeItem();
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    const result = await MerchantService.sellItem(merchant, item, buyer, 1);

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.gm_only');
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('requires a buyer', async () => {
    const item = makeItem();
    const merchant = makeMerchant([item]);

    const result = await MerchantService.sellItem(merchant, item, null, 1);

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.no_buyer_selected');
  });

  test('successful sale grants the item, debits the buyer, credits the till', async () => {
    const item = makeItem(); // qty 10, cost 50, weight 5 -> unit 5/0.5, silver
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer(); // 20 sp = 200000 base units

    const result = await MerchantService.sellItem(merchant, item, buyer, 3);

    expect(result).toBe(true);
    expect(buyer.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 3, unitCost: 5, cost: 15, unitWeight: 0.5, weight: 1.5 }) })
    ]);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 7, 'system.cost': 35 }));
    expect(item.delete).not.toHaveBeenCalled();
    // 15 sp spent = 150000 base units; remainder 50000 -> 5 sp
    expect(buyer.system.money.silver).toBe(5);
    expect(merchant.system.money.silver).toBe(15);
    expect(ui.notifications.info).toHaveBeenCalled();
  });

  test('selling the entire stack removes the merchant\'s item instead of updating it', async () => {
    const item = makeItem({ system: { quantity: 3, cost: 15, weight: 1.5 } });
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    await MerchantService.sellItem(merchant, item, buyer, 3);

    expect(item.delete).toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
  });

  test('consumable item (food, lodging...): money changes hands but nothing is added to the buyer\'s inventory', async () => {
    const item = makeItem();
    item.flags.rmss = { consumable: true };
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    const result = await MerchantService.sellItem(merchant, item, buyer, 3);

    expect(result).toBe(true);
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
    // Stock still depletes and money still moves, same as a normal sale.
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 7 }));
    expect(buyer.system.money.silver).toBe(5);
    expect(merchant.system.money.silver).toBe(15);
  });

  test('out of stock: no mutation, warns and returns false', async () => {
    const item = makeItem({ system: { quantity: 0, cost: 0, weight: 0 } });
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    const result = await MerchantService.sellItem(merchant, item, buyer, 1);

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.out_of_stock');
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('insufficient funds: no mutation, warns and returns false', async () => {
    const item = makeItem({ system: { quantity: 10, cost: 50000, weight: 5, currency_type: 'silver' } }); // 5000 sp each
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer(); // only 20 sp

    const result = await MerchantService.sellItem(merchant, item, buyer, 1);

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalled();
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
  });
});

describe('MerchantService.requestItem (player request)', () => {
  test('requires a buyer, does not touch chat', async () => {
    const item = makeItem();
    const merchant = makeMerchant([item]);

    await MerchantService.requestItem(merchant, item, null, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.no_buyer_selected');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('out of stock: warns, does not post a chat card', async () => {
    const item = makeItem({ system: { quantity: 0 } });
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    await MerchantService.requestItem(merchant, item, buyer, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.out_of_stock');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('posts a whispered chat card carrying UUIDs, without mutating anything', async () => {
    const item = makeItem();
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();
    game.users = [{ id: 'gm1', isGM: true }, { id: 'gm2', isGM: true }, { id: 'player1', isGM: false }];
    buyer.testUserPermission = jest.fn((user) => user.id === 'player1');

    await MerchantService.requestItem(merchant, item, buyer, 4);

    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    const [payload] = ChatMessage.create.mock.calls[0];

    expect(payload.whisper.sort()).toEqual(['gm1', 'gm2', 'player1']);
    expect(payload.flags.rmss.merchantRequest).toEqual(expect.objectContaining({
      merchantActorUuid: merchant.uuid,
      itemUuid: item.uuid,
      buyerActorUuid: buyer.uuid,
      quantity: 4,
      itemName: item.name,
      buyerName: buyer.name,
      resolved: false
    }));
    const bodyHtml = payload.flags.rmss.merchantRequest.bodyHtml;
    expect(typeof bodyHtml).toBe('string');
    // Buyer and item show up as avatar/icon chips, not just plain text.
    expect(bodyHtml).toContain(buyer.img);
    expect(bodyHtml).toContain(item.img);
    expect(bodyHtml).toContain('rmss-request-chip');

    // Nothing actually changes hands until the GM accepts.
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.delete).not.toHaveBeenCalled();
    expect(buyer.update).not.toHaveBeenCalled();
    expect(merchant.update).not.toHaveBeenCalled();
  });

  test('clamps the requested quantity to available stock', async () => {
    const item = makeItem({ system: { quantity: 5, cost: 25, weight: 2.5 } });
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();

    await MerchantService.requestItem(merchant, item, buyer, 999);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.merchantRequest.quantity).toBe(5);
  });

  test('weapon/armor: requested quantity is clamped to 1, never a stack, even if more is asked and available', async () => {
    const sword = makeItem({ type: 'weapon', system: { quantity: 3, cost: 0, unitCost: 30, weight: 4 } });
    const merchant = makeMerchant([sword]);
    const buyer = makeBuyer();

    await MerchantService.requestItem(merchant, sword, buyer, 3);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.merchantRequest.quantity).toBe(1);
  });

  test('generic item marked is_stackable: false (e.g. a unique quest item) is also clamped to 1', async () => {
    const relic = makeItem({ type: 'item', system: { quantity: 3, cost: 30, is_stackable: false } });
    const merchant = makeMerchant([relic]);
    const buyer = makeBuyer();

    await MerchantService.requestItem(merchant, relic, buyer, 3);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.merchantRequest.quantity).toBe(1);
  });

  test('weapon/armor stock: prices from system.unitCost, not system.cost', async () => {
    const armor = makeItem({ type: 'armor', system: { quantity: 1, cost: 0, unitCost: 60, weight: 8, currency_type: 'gold' } });
    const merchant = makeMerchant([armor]);
    const buyer = makeBuyer();

    await MerchantService.requestItem(merchant, armor, buyer, 1);

    const [payload] = ChatMessage.create.mock.calls[0];
    const bodyHtml = payload.flags.rmss.merchantRequest.bodyHtml;
    expect(bodyHtml).toContain('"cost":60');
  });
});

describe('MerchantService.resolveRequest (GM accept/reject)', () => {
  function makeMessage(data) {
    const message = {
      getFlag: jest.fn((scope, key) => (scope === 'rmss' && key === 'merchantRequest' ? data : undefined)),
      update: jest.fn().mockResolvedValue(undefined)
    };
    return message;
  }

  test('non-GM cannot resolve a request', async () => {
    game.user.isGM = false;
    const message = makeMessage({ resolved: false });

    await MerchantService.resolveRequest(message, 'accept');

    expect(message.update).not.toHaveBeenCalled();
  });

  test('an already-resolved request is a no-op (prevents double accept/reject)', async () => {
    const message = makeMessage({ resolved: true });

    await MerchantService.resolveRequest(message, 'accept');

    expect(message.update).not.toHaveBeenCalled();
  });

  test('reject: marks the card rejected without touching any actor', async () => {
    const item = makeItem();
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();
    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, merchantActorUuid: merchant.uuid, buyerActorUuid: buyer.uuid,
      quantity: 2, itemName: item.name, buyerName: buyer.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveRequest(message, 'reject');

    expect(item.update).not.toHaveBeenCalled();
    expect(buyer.update).not.toHaveBeenCalled();
    expect(merchant.update).not.toHaveBeenCalled();

    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'rejected' }));
    expect(flags.rmss.merchantRequest).toEqual(expect.objectContaining({ resolved: true, decision: 'reject' }));
  });

  test('accept: resolves merchant/item/buyer by UUID (not by bare id) and completes the sale', async () => {
    const item = makeItem();
    const merchant = makeMerchant([item]); // sets item.parent = merchant
    const buyer = makeBuyer();
    global.fromUuid = jest.fn(async (uuid) => ({
      [item.uuid]: item,
      [buyer.uuid]: buyer
    }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, merchantActorUuid: merchant.uuid, buyerActorUuid: buyer.uuid,
      quantity: 2, itemName: item.name, buyerName: buyer.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveRequest(message, 'accept');

    // The actual sale ran, crediting the *item's parent* merchant — this is the fix for
    // unlinked-token merchants, where a bare-id lookup would have hit the wrong (base) actor.
    expect(buyer.createEmbeddedDocuments).toHaveBeenCalled();
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 8 }));
    expect(merchant.system.money.silver).toBeGreaterThan(0);

    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'approved' }));
    expect(flags.rmss.merchantRequest).toEqual(expect.objectContaining({ resolved: true, decision: 'accept' }));
  });

  test('accept: partial fulfillment reports the quantity actually sold, not the originally requested one', async () => {
    // Only 2 left by accept time (someone else bought 8 in the meantime), but the
    // card still remembers the original request for 5 — the message must say 2.
    const item = makeItem({ system: { quantity: 2, cost: 10, weight: 1 } });
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer();
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [buyer.uuid]: buyer }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, merchantActorUuid: merchant.uuid, buyerActorUuid: buyer.uuid,
      quantity: 5, itemName: item.name, buyerName: buyer.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveRequest(message, 'accept');

    expect(buyer.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 2 }) })
    ]);
    expect(game.i18n.format).toHaveBeenCalledWith('rmss.merchant.sale_success', expect.objectContaining({ qty: 2 }));
  });

  test('accept: re-validates at resolution time — stock/funds changed since the request means no sale', async () => {
    const item = makeItem({ system: { quantity: 10, cost: 50000, weight: 5 } }); // now far too expensive
    const merchant = makeMerchant([item]);
    const buyer = makeBuyer(); // only 20 sp
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [buyer.uuid]: buyer }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, merchantActorUuid: merchant.uuid, buyerActorUuid: buyer.uuid,
      quantity: 1, itemName: item.name, buyerName: buyer.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveRequest(message, 'accept');

    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'stock_changed' }));
  });

  test('accept: missing entity (e.g. item deleted before the GM resolved it) is reported, not thrown', async () => {
    global.fromUuid = jest.fn().mockResolvedValue(null);
    const message = makeMessage({
      resolved: false, itemUuid: 'Actor.gone.Item.gone', merchantActorUuid: 'Actor.gone', buyerActorUuid: 'Actor.buyer1',
      quantity: 1, itemName: 'Ghost Item', buyerName: 'Zirga', bodyHtml: '<p>quote</p>'
    });

    await expect(MerchantService.resolveRequest(message, 'accept')).resolves.not.toThrow();

    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'stock_changed' }));
  });
});

function makeSeller(overrides = {}) {
  return makeBuyer({ id: 'seller1', uuid: 'Actor.seller1', name: 'Zirga', img: 'icons/seller1.webp', ...overrides });
}

describe('MerchantService.requestSell (player sells to merchant)', () => {
  test('requires a merchant, does not touch chat', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1' });
    const seller = makeSeller();
    item.parent = seller;

    await MerchantService.requestSell(seller, item, null, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.no_merchant_selected');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('out of stock: warns, does not post a chat card', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1', system: { quantity: 0 } });
    const seller = makeSeller();
    const merchant = makeMerchant([]);
    item.parent = seller;

    await MerchantService.requestSell(seller, item, merchant, 1);

    expect(ui.notifications.warn).toHaveBeenCalledWith('rmss.merchant.out_of_stock');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('posts a whispered chat card offering buyRate% of the item\'s cost, without mutating anything', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1' }); // qty 10, cost 50 -> unit 5
    const seller = makeSeller();
    const merchant = makeMerchant([], { system: { buyRate: 50 } }); // pays 50%
    item.parent = seller;
    game.users = [{ id: 'gm1', isGM: true }, { id: 'player1', isGM: false }];
    seller.testUserPermission = jest.fn((user) => user.id === 'player1');

    await MerchantService.requestSell(seller, item, merchant, 4);

    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    const [payload] = ChatMessage.create.mock.calls[0];

    expect(payload.whisper.sort()).toEqual(['gm1', 'player1']);
    expect(payload.flags.rmss.merchantSellRequest).toEqual(expect.objectContaining({
      sellerActorUuid: seller.uuid,
      itemUuid: item.uuid,
      merchantActorUuid: merchant.uuid,
      quantity: 4,
      itemName: item.name,
      sellerName: seller.name,
      merchantName: merchant.name,
      resolved: false
    }));
    const bodyHtml = payload.flags.rmss.merchantSellRequest.bodyHtml;
    // Offer = unit 5 * 50% * qty 4 = 10, embedded in the (mocked) formatted body.
    expect(bodyHtml).toContain('"cost":10');
    expect(bodyHtml).toContain(seller.img);
    expect(bodyHtml).toContain(item.img);

    expect(merchant.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.delete).not.toHaveBeenCalled();
    expect(merchant.update).not.toHaveBeenCalled();
  });

  test('clamps the requested quantity to available stock', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1', system: { quantity: 3, cost: 15, weight: 1.5 } });
    const seller = makeSeller();
    const merchant = makeMerchant([]);
    item.parent = seller;

    await MerchantService.requestSell(seller, item, merchant, 999);

    const [payload] = ChatMessage.create.mock.calls[0];
    expect(payload.flags.rmss.merchantSellRequest.quantity).toBe(3);
  });

  test('weapon/armor: prices from system.unitCost, not system.cost (their sheets never populate cost)', async () => {
    // A weapon's own sheet only ever writes system.unitCost; system.cost stays 0.
    const weapon = makeItem({
      uuid: 'Actor.seller1.Item.item1', type: 'weapon',
      system: { quantity: 1, cost: 0, unitCost: 30, weight: 2, currency_type: 'gold' }
    });
    const seller = makeSeller();
    const merchant = makeMerchant([], { system: { buyRate: 50 } });
    weapon.parent = seller;

    await MerchantService.requestSell(seller, weapon, merchant, 1);

    const [payload] = ChatMessage.create.mock.calls[0];
    const bodyHtml = payload.flags.rmss.merchantSellRequest.bodyHtml;
    // Offer = unitCost 30 * 50% * qty 1 = 15, NOT 0 (which is what system.cost/quantity would give).
    expect(bodyHtml).toContain('"cost":15');
  });
});

describe('MerchantService.resolveSellRequest (GM accept/reject)', () => {
  function makeMessage(data) {
    return {
      getFlag: jest.fn((scope, key) => (scope === 'rmss' && key === 'merchantSellRequest' ? data : undefined)),
      update: jest.fn().mockResolvedValue(undefined)
    };
  }

  test('reject: marks the card rejected without touching any actor', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1' });
    const seller = makeSeller();
    const merchant = makeMerchant([]);
    item.parent = seller;
    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sellerActorUuid: seller.uuid, merchantActorUuid: merchant.uuid,
      quantity: 2, itemName: item.name, sellerName: seller.name, merchantName: merchant.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveSellRequest(message, 'reject');

    expect(item.update).not.toHaveBeenCalled();
    expect(merchant.update).not.toHaveBeenCalled();
    expect(merchant.createEmbeddedDocuments).not.toHaveBeenCalled();

    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'rejected' }));
    expect(flags.rmss.merchantSellRequest).toEqual(expect.objectContaining({ resolved: true, decision: 'reject' }));
  });

  test('accept: resolves seller/item/merchant by UUID, moves the item to stock, pays the seller from the till', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1' }); // qty 10, cost 50, silver -> unit 5
    const seller = makeSeller();
    // Kept under 100 sp so the change stays in silver (CurrencyService.spend remints the
    // *entire* remainder greedily, so a bigger till would convert some of it into gold).
    const merchant = makeMerchant([], { system: { money: { silver: 10 }, buyRate: 50 } });
    item.parent = seller; // item lives on the SELLER, not the merchant
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [merchant.uuid]: merchant }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sellerActorUuid: seller.uuid, merchantActorUuid: merchant.uuid,
      quantity: 2, itemName: item.name, sellerName: seller.name, merchantName: merchant.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveSellRequest(message, 'accept');

    // Item moves to the merchant's stock (full listed value there), not the seller's.
    expect(merchant.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 2, unitCost: 5, cost: 10 }) })
    ]);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.quantity': 8 }));
    // Merchant pays 50% of unit cost * qty = 5 sp out of its till; seller is credited that.
    expect(merchant.system.money.silver).toBe(5);
    expect(seller.system.money.silver).toBeGreaterThan(0);

    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'approved' }));
    expect(flags.rmss.merchantSellRequest).toEqual(expect.objectContaining({ resolved: true, decision: 'accept' }));
  });

  test('accept: partial fulfillment reports the quantity actually sold, not the originally requested one', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1', system: { quantity: 2, cost: 10, weight: 1 } });
    const seller = makeSeller();
    const merchant = makeMerchant([], { system: { money: { silver: 100 }, buyRate: 50 } });
    item.parent = seller;
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [merchant.uuid]: merchant }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sellerActorUuid: seller.uuid, merchantActorUuid: merchant.uuid,
      quantity: 5, itemName: item.name, sellerName: seller.name, merchantName: merchant.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveSellRequest(message, 'accept');

    expect(merchant.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ system: expect.objectContaining({ quantity: 2 }) })
    ]);
    expect(game.i18n.format).toHaveBeenCalledWith('rmss.merchant.sell_success', expect.objectContaining({ qty: 2 }));
  });

  test('accept: re-validates at resolution time — merchant\'s till can no longer afford it', async () => {
    const item = makeItem({ uuid: 'Actor.seller1.Item.item1', system: { quantity: 10, cost: 50000, weight: 5 } }); // now very expensive
    const seller = makeSeller();
    const merchant = makeMerchant([], { system: { money: { silver: 20 }, buyRate: 50 } }); // till too small
    item.parent = seller;
    global.fromUuid = jest.fn(async (uuid) => ({ [item.uuid]: item, [merchant.uuid]: merchant }[uuid] ?? null));

    const message = makeMessage({
      resolved: false, itemUuid: item.uuid, sellerActorUuid: seller.uuid, merchantActorUuid: merchant.uuid,
      quantity: 1, itemName: item.name, sellerName: seller.name, merchantName: merchant.name, bodyHtml: '<p>quote</p>'
    });

    await MerchantService.resolveSellRequest(message, 'accept');

    expect(merchant.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'stock_changed' }));
  });

  test('accept: missing entity is reported, not thrown', async () => {
    global.fromUuid = jest.fn().mockResolvedValue(null);
    const message = makeMessage({
      resolved: false, itemUuid: 'Actor.gone.Item.gone', sellerActorUuid: 'Actor.gone', merchantActorUuid: 'Actor.merchant1',
      quantity: 1, itemName: 'Ghost Item', sellerName: 'Zirga', merchantName: 'Shopkeep', bodyHtml: '<p>quote</p>'
    });

    await expect(MerchantService.resolveSellRequest(message, 'accept')).resolves.not.toThrow();

    const [{ content }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'stock_changed' }));
  });
});
