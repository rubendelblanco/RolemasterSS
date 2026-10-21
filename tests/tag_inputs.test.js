/**
 * The tag editors add the tag in the field with Enter, and also as soon as one of the suggestions is picked.
 */
import { jest } from '@jest/globals';
import { isDatalistSelection } from '../module/sheets/tag_input_util.js';
import { bindWeaponSlayingEditor } from '../module/sheets/items/weapon_slaying_ui.js';
import { bindItemTagsEditor } from '../module/sheets/items/item_tags_ui.js';
import { bindCreatureTagsEditor } from '../module/sheets/actors/creature_tags_ui.js';
import { bindContainerAllowedTagsEditor } from '../module/sheets/items/container_allowed_tags_ui.js';

const field = (value, suggestions = ["fire", "cold", "undead"]) => ({
  value,
  list: { options: suggestions.map((s) => ({ value: s })) }
});

const typing = { originalEvent: { inputType: "insertText" } };
const picking = { originalEvent: { inputType: "insertReplacementText" } };

describe('isDatalistSelection', () => {
  test('picking a suggestion is a selection', () => {
    expect(isDatalistSelection(picking, field("cold"))).toBe(true);
  });

  test('so is an input event with no type at all (a browser that sends a plain event)', () => {
    expect(isDatalistSelection({}, field("cold"))).toBe(true);
    expect(isDatalistSelection({ originalEvent: {} }, field("cold"))).toBe(true);
  });

  test('typing is not, even when what has been typed is a whole suggestion', () => {
    expect(isDatalistSelection(typing, field("cold"))).toBe(false);
    expect(isDatalistSelection({ originalEvent: { inputType: "deleteContentBackward" } }, field("cold"))).toBe(false);
    expect(isDatalistSelection({ originalEvent: { inputType: "insertFromPaste" } }, field("cold"))).toBe(false);
  });

  test('a replacement that is not one of the suggestions is not a pick', () => {
    expect(isDatalistSelection(picking, field("colder"))).toBe(false);
    expect(isDatalistSelection(picking, field(""))).toBe(false);
  });

  test('it does not mind case or spaces around the text', () => {
    expect(isDatalistSelection(picking, field("  Cold "))).toBe(true);
  });

  test('a field with no list of suggestions never has a pick', () => {
    expect(isDatalistSelection(picking, { value: "cold" })).toBe(false);
  });
});

/** A stand-in for the jQuery of a sheet: it keeps the handlers by event and selector. */
function fakeHtml() {
  const handlers = {};
  const key = (event, selector) => `${String(event).split(".")[0]}|${selector}`;
  return {
    handlers,
    off: () => {},
    on(event, selector, fn) { handlers[key(event, selector)] = fn; },
    find(selector) {
      return { on: (event, fn) => { handlers[key(event, selector)] = fn; } };
    }
  };
}

const press = (html, selector, event) => html.handlers[`${event}|${selector}`];

const EDITORS = [
  {
    name: 'slaying tags (weapons, ammunition, spells)',
    selector: '.rmss-weapon-slaying input.rmss-weapon-slaying-input',
    path: 'system.slaying',
    bind: (html, sheet) => bindWeaponSlayingEditor(sheet, html),
    sheet: (update) => ({ isEditable: true, render: jest.fn(), item: { system: { slaying: ["dragon"] }, update } })
  },
  {
    name: 'item tags',
    selector: '.rmss-item-tags input.rmss-item-tag-input',
    path: 'system.tags',
    bind: (html, sheet) => bindItemTagsEditor(sheet, html),
    sheet: (update) => ({ isEditable: true, render: jest.fn(), item: { system: { tags: ["metal"] }, update } })
  },
  {
    name: 'creature tags',
    selector: '.rmss-creature-tags input.rmss-creature-tag-input',
    path: 'system.creature_tags',
    bind: (html, sheet) => bindCreatureTagsEditor(sheet, html),
    sheet: (update) => ({ isEditable: true, render: jest.fn(), actor: { system: { creature_tags: ["orc"] }, update } })
  },
  {
    name: 'container allowed tags',
    selector: '.rmss-container-allowed-tags input.rmss-container-allowed-tag-input',
    path: 'system.container.allowedTags',
    bind: (html, sheet) => bindContainerAllowedTagsEditor(sheet, html),
    sheet: (update) => ({ isEditable: true, render: jest.fn(), item: { system: { container: { allowedTags: ["spell"] } }, update } })
  }
];

describe.each(EDITORS)('$name', ({ selector, path, bind, sheet: makeSheet }) => {
  let update, sheet, html;

  beforeEach(() => {
    update = jest.fn(async () => {});
    sheet = makeSheet(update);
    html = fakeHtml();
    bind(html, sheet);
  });

  const typedInput = (value) => ({ ...field(value), value });
  const tagsAfter = () => update.mock.calls[0][0][path];

  test('picking a suggestion adds it, with no Enter', async () => {
    const input = typedInput("cold");
    await press(html, selector, "input")({ ...picking, currentTarget: input });
    expect(update).toHaveBeenCalledTimes(1);
    expect(tagsAfter()).toContain("cold");
    expect(input.value).toBe("");
    expect(sheet.render).toHaveBeenCalled();
  });

  test('Enter still adds what has been typed, even when it is not a suggestion', async () => {
    const input = typedInput("homemade");
    await press(html, selector, "keydown")({ key: "Enter", currentTarget: input, preventDefault() {}, stopPropagation() {} });
    expect(tagsAfter()).toContain("homemade");
  });

  test('typing a whole suggestion does not add it until Enter or a pick', async () => {
    const input = typedInput("cold");
    await press(html, selector, "input")({ ...typing, currentTarget: input });
    expect(update).not.toHaveBeenCalled();
    expect(input.value).toBe("cold");
  });

  test('picking a tag the item already has adds nothing and clears the field', async () => {
    const input = typedInput("x");
    const already = (sheet.item ?? sheet.actor).system;
    const first = path.split('.').slice(1).reduce((o, k) => o[k], already)[0];
    input.value = first;
    input.list = { options: [{ value: first }] };
    await press(html, selector, "input")({ ...picking, currentTarget: input });
    expect(update).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  test('a replacement that is not one of the suggestions adds nothing', async () => {
    const input = typedInput("coldd");
    await press(html, selector, "input")({ ...picking, currentTarget: input });
    expect(update).not.toHaveBeenCalled();
  });
});
