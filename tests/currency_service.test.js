/**
 * Tests for CurrencyService (8-denomination RMSS money model).
 */
import { jest } from '@jest/globals';
import CurrencyService from '../module/actors/services/currency_service.js';

// Same cascading 1:10 table as module/config.js — highest denomination first.
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

describe('CurrencyService.toBaseUnits', () => {
  test('sums a mixed-denomination money object into base units (iron = 1)', () => {
    const money = { mithril: 0, platinum: 0, gold: 1, silver: 2, bronze: 0, copper: 0, tin: 0, iron: 50 };
    expect(CurrencyService.toBaseUnits(money)).toBe(100000 + 20000 + 50);
  });

  test('missing/undefined denominations are treated as 0', () => {
    expect(CurrencyService.toBaseUnits({ gold: 3 })).toBe(300000);
  });

  test('empty money object sums to 0', () => {
    expect(CurrencyService.toBaseUnits({})).toBe(0);
  });
});

describe('CurrencyService.baseUnitsToDenomination', () => {
  test('converts base units into the given denomination (nominal, no rounding)', () => {
    expect(CurrencyService.baseUnitsToDenomination(1000000, 'gold')).toBe(10);
    expect(CurrencyService.baseUnitsToDenomination(150000, 'silver')).toBe(15);
  });

  test('unknown denomination returns the base units unchanged', () => {
    expect(CurrencyService.baseUnitsToDenomination(500, 'unknown')).toBe(500);
  });
});

describe('CurrencyService.spend', () => {
  test('exact spend leaves the payer with nothing', () => {
    const money = { mithril: 0, platinum: 0, gold: 1, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 0 };
    const { success, newMoney } = CurrencyService.spend(money, 100000);
    expect(success).toBe(true);
    expect(newMoney).toEqual({ mithril: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 0 });
  });

  test('insufficient funds: fails without mutating the caller\'s money object', () => {
    const money = { mithril: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 100 };
    const result = CurrencyService.spend(money, 200);
    expect(result).toEqual({ success: false, newMoney: null });
    expect(money.iron).toBe(100); // untouched
  });

  test('re-mints remaining balance greedily from highest to lowest denomination', () => {
    const money = { mithril: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, copper: 0, tin: 0, iron: 250 };
    const { success, newMoney } = CurrencyService.spend(money, 5);
    // remainder = 245 -> 2 copper (200) + 4 tin (40) + 5 iron
    expect(success).toBe(true);
    expect(newMoney).toEqual({ mithril: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, copper: 2, tin: 4, iron: 5 });
  });

  test('total value is preserved across re-minting', () => {
    const money = { mithril: 0, platinum: 4, gold: 1, silver: 4, bronze: 3, copper: 3, tin: 3, iron: 0 };
    const before = CurrencyService.toBaseUnits(money);
    const { newMoney } = CurrencyService.spend(money, 12345);
    expect(CurrencyService.toBaseUnits(newMoney)).toBe(before - 12345);
  });
});

describe('CurrencyService.creditTill', () => {
  test('adds the sale amount to the merchant\'s existing balance in that denomination', async () => {
    const merchantActor = {
      system: { money: { silver: 5 } },
      update: jest.fn().mockResolvedValue(undefined)
    };
    await CurrencyService.creditTill(merchantActor, 'silver', 3);
    expect(merchantActor.update).toHaveBeenCalledWith({ 'system.money.silver': 8 });
  });

  test('missing denomination on the merchant defaults to 0 before crediting', async () => {
    const merchantActor = { system: { money: {} }, update: jest.fn().mockResolvedValue(undefined) };
    await CurrencyService.creditTill(merchantActor, 'gold', 10);
    expect(merchantActor.update).toHaveBeenCalledWith({ 'system.money.gold': 10 });
  });
});
