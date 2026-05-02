import {
  History,
  HistoricalObject,
  packSampleRecord,
  unpackSampleRecord,
} from './historicalObject';

describe('packSampleRecord', () => {
  test('roundtrips multiple fields with quantization error within precision', () => {
    const data: Record<string, History> = {
      x: {
        initialValue: 0,
        samples: [
          { time: 1696021246740, value: 1 },
          { time: 1696021246756, value: 2 },
          { time: 1696021246772, value: 3 },
          { time: 1696021246788, value: 4 },
        ],
      },
      y: {
        initialValue: 140.2,
        samples: [
          { time: 1696021246740, value: 169.7 },
          { time: 1696021246756, value: 237.59 },
          { time: 1696021246772, value: 344.44 },
          { time: 1696021246788, value: 489.13 },
        ],
      },
    };
    const fields = [
      { name: 'x', precision: 4 },
      { name: 'y', precision: 4 },
    ];
    const packed = packSampleRecord(fields, data);
    const unpacked = unpackSampleRecord(fields, packed);
    const maxError = Math.max(1 / (1 << 4), 1e-8);

    expect(Object.keys(data)).toEqual(Object.keys(unpacked));
    for (const key of Object.keys(data)) {
      const { initialValue, samples } = data[key];
      const { initialValue: unpackedInitialValue, samples: unpackedSamples } = unpacked[key];
      expect(Math.abs(initialValue - unpackedInitialValue)).toBeLessThanOrEqual(maxError);
      expect(samples.length).toEqual(unpackedSamples.length);
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i].time).toEqual(unpackedSamples[i].time);
        expect(Math.abs(samples[i].value - unpackedSamples[i].value)).toBeLessThanOrEqual(maxError);
      }
    }
  });

  test('skips fields with no samples', () => {
    const fields = [
      { name: 'x', precision: 4 },
      { name: 'y', precision: 4 },
    ];
    const data: Record<string, History> = {
      x: { initialValue: 0, samples: [{ time: 1000, value: 1 }] },
    };
    const packed = packSampleRecord(fields, data);
    const unpacked = unpackSampleRecord(fields, packed);
    expect(Object.keys(unpacked)).toEqual(['x']);
    expect(unpacked.x.samples).toHaveLength(1);
  });

  test('detects field-config mismatches via the config hash', () => {
    const writeFields = [{ name: 'x', precision: 4 }];
    const data: Record<string, History> = {
      x: { initialValue: 0, samples: [{ time: 1, value: 1 }] },
    };
    const packed = packSampleRecord(writeFields, data);
    const readFields = [{ name: 'x', precision: 8 }];
    expect(() => unpackSampleRecord(readFields, packed)).toThrow(/Config hash mismatch/);
  });
});

describe('HistoricalObject', () => {
  test('constructor accepts up to 16 fields', () => {
    const fields = Array.from({ length: 16 }, (_, i) => `f${i}`);
    const initial = Object.fromEntries(fields.map((f) => [f, 0])) as Record<string, number>;
    expect(() => new HistoricalObject(fields, initial)).not.toThrow();
  });

  test('constructor rejects more than 16 fields', () => {
    const fields = Array.from({ length: 17 }, (_, i) => `f${i}`);
    const initial = Object.fromEntries(fields.map((f) => [f, 0])) as Record<string, number>;
    expect(() => new HistoricalObject(fields, initial)).toThrow(/at most 16 fields/);
  });

  test('rejects undeclared fields and non-numeric values', () => {
    const obj = new HistoricalObject(['x'], { x: 0 });
    expect(() => obj.update(1, { y: 1 } as any)).toThrow(/undeclared field 'y'/);
    expect(() => obj.update(1, { x: 'hi' as any })).toThrow(/only supports numeric values/);
  });

  test('records a sample only when the value changes', () => {
    const obj = new HistoricalObject(['x', 'y'], { x: 0, y: 0 });
    obj.update(1, { x: 0, y: 0 });
    expect(obj.historyLength()).toBe(0);
    obj.update(2, { x: 1, y: 0 });
    expect(obj.historyLength()).toBe(1);
    expect(obj.history.x.initialValue).toBe(0);
    expect(obj.history.x.samples).toEqual([{ time: 2, value: 1 }]);
    expect(obj.history.y).toBeUndefined();
  });

  test('replaces the latest sample when called twice with the same timestamp', () => {
    const obj = new HistoricalObject(['x'], { x: 0 });
    obj.update(10, { x: 1 });
    obj.update(10, { x: 5 });
    expect(obj.history.x.samples).toEqual([{ time: 10, value: 5 }]);
  });

  test('throws if time goes backwards', () => {
    const obj = new HistoricalObject(['x'], { x: 0 });
    obj.update(10, { x: 1 });
    expect(() => obj.update(9, { x: 2 })).toThrow(/Server time moving backwards/);
  });

  test('pack returns null when no samples have been recorded', () => {
    const obj = new HistoricalObject(['x'], { x: 0 });
    expect(obj.pack()).toBeNull();
  });

  test('pack/unpack round-trips a populated HistoricalObject', () => {
    const obj = new HistoricalObject(
      [
        { name: 'x', precision: 8 },
        { name: 'y', precision: 8 },
      ],
      { x: 0, y: 0 },
    );
    obj.update(1000, { x: 1.5, y: 2.5 });
    obj.update(1100, { x: 2.0, y: 3.0 });
    obj.update(1200, { x: 2.5, y: 3.5 });
    const packed = obj.pack();
    expect(packed).not.toBeNull();

    const unpacked = unpackSampleRecord(obj.fieldConfig, packed!);
    expect(Object.keys(unpacked).sort()).toEqual(['x', 'y']);
    expect(unpacked.x.samples).toHaveLength(3);
    expect(unpacked.y.samples).toHaveLength(3);
    const tolerance = 1 / (1 << 8);
    expect(Math.abs(unpacked.x.samples[2].value - 2.5)).toBeLessThanOrEqual(tolerance);
    expect(unpacked.x.samples[2].time).toBe(1200);
  });
});
