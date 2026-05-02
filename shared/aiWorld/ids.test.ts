import { allocGameId, parseGameId } from './ids';

describe('parseGameId', () => {
  it('accepts a well-formed id of the requested type', () => {
    expect(parseGameId('players', 'p:0')).toBe('p:0');
    expect(parseGameId('agents', 'a:42')).toBe('a:42');
    expect(parseGameId('conversations', 'c:7')).toBe('c:7');
    expect(parseGameId('operations', 'o:99')).toBe('o:99');
  });

  it('rejects an id whose prefix does not match the requested type', () => {
    expect(() => parseGameId('players', 'a:0')).toThrow(/Invalid game ID type/);
    expect(() => parseGameId('agents', 'p:1')).toThrow(/Invalid game ID type/);
  });

  it('rejects ids with unknown prefixes', () => {
    expect(() => parseGameId('players', 'x:0')).toThrow(/Invalid game ID type/);
  });

  it('rejects non-numeric, fractional, and negative numbers', () => {
    expect(() => parseGameId('players', 'p:abc')).toThrow(/Invalid game ID number/);
    expect(() => parseGameId('players', 'p:1.5')).toThrow(/Invalid game ID number/);
    expect(() => parseGameId('players', 'p:-1')).toThrow(/Invalid game ID number/);
    expect(() => parseGameId('players', 'p:')).toThrow(/Invalid game ID number/);
  });
});

describe('allocGameId', () => {
  it('formats ids as <prefix>:<number>', () => {
    expect(allocGameId('players', 0)).toBe('p:0');
    expect(allocGameId('agents', 5)).toBe('a:5');
    expect(allocGameId('conversations', 17)).toBe('c:17');
    expect(allocGameId('operations', 31)).toBe('o:31');
  });

  it('round-trips through parseGameId', () => {
    const id = allocGameId('players', 12);
    expect(parseGameId('players', id)).toBe(id);
  });
});
