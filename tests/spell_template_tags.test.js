/**
 * The spell template has the list of tags written on a spell, empty by default.
 */
import { readFileSync } from 'node:fs';

const template = JSON.parse(readFileSync(new URL('../template.json', import.meta.url), 'utf8'));

describe('template.json: spell', () => {
  test('has spell_tags, an empty list', () => {
    expect(template.Item.spell.spell_tags).toEqual([]);
  });

  test('keeps its own tags apart: those are what the containers filter by', () => {
    expect(template.Item.spell.tags).toEqual(["spell"]);
  });
});
