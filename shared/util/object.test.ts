import { parseMap, serializeMap } from './object';

type SerializedItem = { id: string; value: number };

class Item {
  id: string;
  value: number;
  constructor(serialized: SerializedItem) {
    this.id = serialized.id;
    this.value = serialized.value;
  }
  serialize(): SerializedItem {
    return { id: this.id, value: this.value };
  }
}

describe('parseMap', () => {
  it('builds a Map keyed by the id selector', () => {
    const records: SerializedItem[] = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ];
    const map = parseMap(records, Item, (i) => i.id);
    expect(map.size).toBe(2);
    expect(map.get('a')?.value).toBe(1);
    expect(map.get('b')?.value).toBe(2);
    expect(map.get('a')).toBeInstanceOf(Item);
  });

  it('returns an empty Map for empty input', () => {
    const map = parseMap<string, SerializedItem, Item>([], Item, (i) => i.id);
    expect(map.size).toBe(0);
  });

  it('throws on duplicate IDs', () => {
    const records: SerializedItem[] = [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
    ];
    expect(() => parseMap(records, Item, (i) => i.id)).toThrow('Duplicate ID a');
  });
});

describe('serializeMap', () => {
  it('serializes every value via its serialize() method', () => {
    const map = new Map<string, Item>();
    map.set('a', new Item({ id: 'a', value: 1 }));
    map.set('b', new Item({ id: 'b', value: 2 }));
    expect(serializeMap(map)).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ]);
  });

  it('returns an empty array for an empty map', () => {
    expect(serializeMap(new Map())).toEqual([]);
  });

  it('round-trips through parseMap', () => {
    const records: SerializedItem[] = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ];
    const parsed = parseMap(records, Item, (i) => i.id);
    expect(serializeMap(parsed)).toEqual(records);
  });
});
