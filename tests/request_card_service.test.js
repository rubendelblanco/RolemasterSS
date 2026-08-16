/**
 * Tests for RequestCardService: the shared "player requests -> GM confirms in
 * chat" engine used by both MerchantService and LootService.
 */
import { jest } from '@jest/globals';
import RequestCardService from '../module/chat/request_card_service.js';

beforeEach(() => {
  jest.clearAllMocks();
  game.user = { isGM: true };
  game.users = [{ id: 'gm1', isGM: true }];
  global.renderTemplate = jest.fn(async (_path, data) => JSON.stringify(data));
});

function makeReceiver(overrides = {}) {
  return {
    id: 'receiver1',
    uuid: 'Actor.receiver1',
    name: 'Zirga',
    testUserPermission: jest.fn(() => true),
    ...overrides
  };
}

function makeMessage(data) {
  return {
    getFlag: jest.fn((scope, key) => (scope === 'rmss' && key === 'someRequest' ? data : undefined)),
    update: jest.fn().mockResolvedValue(undefined)
  };
}

describe('RequestCardService.chip', () => {
  test('renders an avatar image plus the name', () => {
    const html = RequestCardService.chip('icons/zirga.webp', 'Zirga');
    expect(html).toContain('src="icons/zirga.webp"');
    expect(html).toContain('>Zirga<');
    expect(html).toContain('class="rmss-request-chip"');
  });

  test('escapes HTML-significant characters in the name', () => {
    const html = RequestCardService.chip('icons/x.webp', '<script>alert(1)</script> & "Bob"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;Bob&quot;');
  });
});

describe('RequestCardService.whisperTargets', () => {
  test('dedupes GMs and the receiver\'s owners', () => {
    game.users = [
      { id: 'gm1', isGM: true },
      { id: 'gm2', isGM: true },
      { id: 'player1', isGM: false }
    ];
    const receiver = makeReceiver({ testUserPermission: jest.fn((u) => u.id === 'player1' || u.id === 'gm1') });

    const targets = RequestCardService.whisperTargets(receiver).sort();

    expect(targets).toEqual(['gm1', 'gm2', 'player1']);
  });
});

describe('RequestCardService.post', () => {
  test('creates a whispered pending card with domain data merged into the flag', async () => {
    game.users = [{ id: 'gm1', isGM: true }, { id: 'player1', isGM: false }];
    const receiver = makeReceiver({ testUserPermission: jest.fn((u) => u.id === 'player1') });
    const speaker = { name: 'Old Chest' };

    await RequestCardService.post({
      requestKind: 'someRequest',
      title: 'Some Title',
      icon: 'fa-box',
      bodyHtml: '<p>body</p>',
      speakerActor: speaker,
      receiverActor: receiver,
      data: { foo: 'bar' }
    });

    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    const [payload] = ChatMessage.create.mock.calls[0];

    expect(payload.speaker).toEqual({ alias: 'Old Chest' });
    expect(payload.whisper).toEqual(['gm1', 'player1']);
    expect(payload.flags.rmss.someRequest).toEqual({
      foo: 'bar', title: 'Some Title', icon: 'fa-box', bodyHtml: '<p>body</p>', resolved: false
    });

    const rendered = JSON.parse(payload.content);
    expect(rendered).toEqual(expect.objectContaining({ pending: true, title: 'Some Title', icon: 'fa-box', requestKind: 'someRequest' }));
  });
});

describe('RequestCardService.resolve', () => {
  test('non-GM cannot resolve', async () => {
    game.user.isGM = false;
    const message = makeMessage({ resolved: false });
    const onAccept = jest.fn();

    await RequestCardService.resolve(message, 'someRequest', 'accept', { onAccept, rejectedMessage: jest.fn() });

    expect(onAccept).not.toHaveBeenCalled();
    expect(message.update).not.toHaveBeenCalled();
  });

  test('already-resolved is a no-op', async () => {
    const message = makeMessage({ resolved: true });
    const onAccept = jest.fn();

    await RequestCardService.resolve(message, 'someRequest', 'accept', { onAccept, rejectedMessage: jest.fn() });

    expect(onAccept).not.toHaveBeenCalled();
    expect(message.update).not.toHaveBeenCalled();
  });

  test('reject calls rejectedMessage, never onAccept, and persists resolved+decision', async () => {
    const data = { title: 'T', icon: 'fa-box', bodyHtml: '<p>b</p>', resolved: false, foo: 'bar' };
    const message = makeMessage(data);
    const onAccept = jest.fn();
    const rejectedMessage = jest.fn(() => 'nope');

    await RequestCardService.resolve(message, 'someRequest', 'reject', { onAccept, rejectedMessage });

    expect(onAccept).not.toHaveBeenCalled();
    expect(rejectedMessage).toHaveBeenCalledWith(data);

    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ pending: false, statusClass: 'rejected', statusMessage: 'nope' }));
    expect(flags.rmss.someRequest).toEqual(expect.objectContaining({ foo: 'bar', resolved: true, decision: 'reject' }));
  });

  test('accept delegates entirely to onAccept for the outcome', async () => {
    const data = { title: 'T', icon: 'fa-box', bodyHtml: '<p>b</p>', resolved: false };
    const message = makeMessage(data);
    const onAccept = jest.fn().mockResolvedValue({ statusClass: 'approved', statusMessage: 'done' });

    await RequestCardService.resolve(message, 'someRequest', 'accept', { onAccept, rejectedMessage: jest.fn() });

    expect(onAccept).toHaveBeenCalledWith(data);
    const [{ content, flags }] = message.update.mock.calls[0];
    expect(JSON.parse(content)).toEqual(expect.objectContaining({ statusClass: 'approved', statusMessage: 'done' }));
    expect(flags.rmss.someRequest).toEqual(expect.objectContaining({ resolved: true, decision: 'accept' }));
  });
});
