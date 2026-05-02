import {
  deltaDecode,
  deltaEncode,
  quantize,
  runLengthDecode,
  runLengthEncode,
  unquantize,
} from './compression';

describe('compression', () => {
  test('quantize/unquantize roundtrip stays within precision tolerance', () => {
    const precisions = [-1, 0, 1, 4, 8];
    const datasets = [
      [-29109.4, 24836.16, 59528.43, 5706.02, 61844.35, -46030.94, 10288.24, -48623.38],
      [-67.02, -117.41, -243.41, 160.38, 191.79, 89.76, -10.71, 205.25],
      [14.99, -14.2, -1.5, -8.61, 15.14, -0.75, -4.37, -14.29],
    ];
    for (const values of datasets) {
      for (const precision of precisions) {
        const maxError = Math.max(1 / (1 << precision), 1e-8);
        const roundTripped = unquantize(quantize(values, precision), precision);
        expect(roundTripped.length).toBe(values.length);
        for (let i = 0; i < values.length; i++) {
          expect(Math.abs(values[i] - roundTripped[i])).toBeLessThanOrEqual(maxError);
        }
      }
    }
  });

  test('quantize floors values toward negative infinity', () => {
    expect(quantize([1.7, -1.2, 0], 0)).toEqual([1, -2, 0]);
    expect(quantize([1.6, -0.5], 1)).toEqual([3, -1]);
  });

  test('deltaEncode/deltaDecode roundtrip', () => {
    const data = [41476, -13450, -59451, -65102, -32493, -39078, 40784, 17184];
    expect(deltaDecode(deltaEncode(data))).toEqual(data);
  });

  test('deltaEncode honors the optional initial value', () => {
    expect(deltaEncode([10, 12, 15], 10)).toEqual([0, 2, 3]);
    expect(deltaDecode([0, 2, 3], 10)).toEqual([10, 12, 15]);
  });

  test('deltaEncode of an empty array is empty', () => {
    expect(deltaEncode([])).toEqual([]);
    expect(deltaDecode([])).toEqual([]);
  });

  test('runLengthEncode emits [value, count] pairs', () => {
    expect(runLengthEncode([5, 5, 5, 7, 7, 9])).toEqual([5, 3, 7, 2, 9, 1]);
  });

  test('runLengthEncode/runLengthDecode roundtrip across patterns', () => {
    const datasets = [
      [41476, -13450, -59451, 17184, -45215, -39037, 28001, -64417],
      [10, 10, 10, 10, 10, 10],
      [11],
      [1, 2, 3, 4, 4, 4, 4, 5, 6, 7],
      [],
    ];
    for (const data of datasets) {
      expect(runLengthDecode(runLengthEncode(data))).toEqual(data);
    }
  });

  test('runLengthDecode rejects malformed (odd-length) input', () => {
    expect(() => runLengthDecode([1, 2, 3])).toThrow('Invalid RLE encoded length: 3');
  });
});
