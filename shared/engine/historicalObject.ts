import { xxHash32 } from '../util/xxhash';
import { compressSigned, uncompressSigned } from '../util/FastIntegerCompression';
import {
  runLengthEncode,
  deltaEncode,
  quantize,
  deltaDecode,
  runLengthDecode,
  unquantize,
} from '../util/compression';

export type FieldConfig = Array<string | { name: string; precision: number }>;
const MAX_FIELDS = 16;
const PACKED_VERSION = 1;

type NormalizedFieldConfig = Array<{ name: string; precision: number }>;
export type Sample = { time: number; value: number };
export type History = { initialValue: number; samples: Sample[] };

export class HistoricalObject<T extends Record<string, number>> {
  startTs?: number;
  fieldConfig: NormalizedFieldConfig;
  data: T;
  history: Record<string, History> = {};

  constructor(fields: FieldConfig, initialValue: T) {
    if (fields.length > MAX_FIELDS) throw new Error(`HistoricalObject can have at most ${MAX_FIELDS} fields.`);
    this.fieldConfig = normalizeFieldConfig(fields);
    this.checkShape(initialValue);
    this.data = initialValue;
  }

  historyLength() {
    return Object.values(this.history).reduce((acc, h) => acc + h.samples.length, 0);
  }

  checkShape(data: any) {
    for (const [key, value] of Object.entries(data)) {
      if (!this.fieldConfig.find((f) => f.name === key)) throw new Error(`Cannot set undeclared field '${key}'`);
      if (typeof value !== 'number')
        throw new Error(`HistoricalObject only supports numeric values, found: ${JSON.stringify(value)}`);
    }
  }

  update(now: number, data: T) {
    this.checkShape(data);
    for (const [key, value] of Object.entries(data)) {
      const currentValue = (this.data as any)[key];
      if (currentValue !== value) {
        let history = this.history[key];
        if (!history) this.history[key] = history = { initialValue: currentValue, samples: [] };
        const { samples } = history;
        let inserted = false;
        if (samples.length > 0) {
          const last = samples[samples.length - 1];
          if (now < last.time) throw new Error(`Server time moving backwards: ${now} < ${last.time}`);
          if (now === last.time) {
            last.value = value;
            inserted = true;
          }
        }
        if (!inserted) samples.push({ time: now, value });
      }
    }
    this.data = data;
  }

  pack(): ArrayBuffer | null {
    if (this.historyLength() === 0) return null;
    return packSampleRecord(this.fieldConfig, this.history);
  }
}

function packFieldConfig(fields: NormalizedFieldConfig) {
  const out = new ArrayBuffer(1024);
  const outView = new DataView(out);
  let pos = 0;
  outView.setUint8(pos, PACKED_VERSION);
  pos += 1;
  const encoder = new TextEncoder();
  for (const fc of fields) {
    const name = encoder.encode(fc.name);
    outView.setUint8(pos, name.length);
    pos += 1;
    new Uint8Array(out, pos, name.length).set(name);
    pos += name.length;
    outView.setUint8(pos, fc.precision);
    pos += 1;
  }
  return out.slice(0, pos);
}

export function packSampleRecord(
  fields: NormalizedFieldConfig,
  sampleRecord: Record<string, History>,
): ArrayBuffer {
  const out = new ArrayBuffer(65536);
  const outView = new DataView(out);
  let pos = 0;
  const configHash = xxHash32(new Uint8Array(packFieldConfig(fields)));
  outView.setUint32(pos, configHash, true);
  pos += 4;

  for (let fieldNumber = 0; fieldNumber < fields.length; fieldNumber += 1) {
    const { name, precision } = fields[fieldNumber];
    const history = sampleRecord[name];
    if (!history || history.samples.length === 0) continue;

    const timestamps = history.samples.map((s) => Math.floor(s.time));
    const initialTimestamp = timestamps[0];
    const encodedTimestamps = runLengthEncode(deltaEncode(timestamps.slice(1), initialTimestamp));
    const compressedTimestamps = compressSigned(encodedTimestamps);
    if (compressedTimestamps.byteLength >= 1 << 16)
      throw new Error(`Compressed buffer too long: ${compressedTimestamps.byteLength}`);

    const values = [history.initialValue, ...history.samples.map((s) => s.value)];
    const quantized = quantize(values, precision);
    const deltaEncoded = deltaEncode(quantized);
    const runLengthEncoded = runLengthEncode(deltaEncoded);
    const useRLE = runLengthEncoded.length < deltaEncoded.length;
    let fieldHeader = fieldNumber;
    if (useRLE) fieldHeader |= 1 << 4;
    const encoded = useRLE ? runLengthEncoded : deltaEncoded;
    const compressed = compressSigned(encoded);
    if (compressed.byteLength >= 1 << 16)
      throw new Error(`Compressed buffer too long: ${compressed.byteLength}`);

    outView.setUint8(pos, fieldHeader);
    pos += 1;
    outView.setBigUint64(pos, BigInt(initialTimestamp), true);
    pos += 8;
    outView.setUint16(pos, compressedTimestamps.byteLength, true);
    pos += 2;
    new Uint8Array(out, pos, compressedTimestamps.byteLength).set(new Uint8Array(compressedTimestamps));
    pos += compressedTimestamps.byteLength;
    outView.setUint16(pos, compressed.byteLength, true);
    pos += 2;
    new Uint8Array(out, pos, compressed.byteLength).set(new Uint8Array(compressed));
    pos += compressed.byteLength;
  }
  return out.slice(0, pos);
}

export function unpackSampleRecord(fields: FieldConfig, buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let pos = 0;
  const normalizedFields = normalizeFieldConfig(fields);
  const expectedConfigHash = xxHash32(new Uint8Array(packFieldConfig(normalizedFields)));
  const configHash = view.getUint32(pos, true);
  pos += 4;
  if (configHash !== expectedConfigHash)
    throw new Error(`Config hash mismatch: ${configHash} !== ${expectedConfigHash}`);
  const out: Record<string, History> = {};
  while (pos < buffer.byteLength) {
    const fieldHeader = view.getUint8(pos);
    pos += 1;
    const fieldNumber = fieldHeader & 0b00001111;
    const useRLE = (fieldHeader & (1 << 4)) !== 0;
    const fieldConfig = normalizedFields[fieldNumber];
    if (!fieldConfig) throw new Error(`Invalid field number: ${fieldNumber}`);
    const initialTimestamp = Number(view.getBigUint64(pos, true));
    pos += 8;
    const compressedTimestampLength = view.getUint16(pos, true);
    pos += 2;
    const compressedTimestampBuffer = buffer.slice(pos, pos + compressedTimestampLength);
    pos += compressedTimestampLength;
    const timestamps = [
      initialTimestamp,
      ...deltaDecode(runLengthDecode(uncompressSigned(compressedTimestampBuffer)), initialTimestamp),
    ];
    const compressedLength = view.getUint16(pos, true);
    pos += 2;
    const compressedBuffer = buffer.slice(pos, pos + compressedLength);
    pos += compressedLength;
    const encoded = uncompressSigned(compressedBuffer);
    const deltaEncoded = useRLE ? runLengthDecode(encoded) : encoded;
    const quantized = deltaDecode(deltaEncoded);
    const values = unquantize(quantized, fieldConfig.precision);
    if (timestamps.length + 1 !== values.length)
      throw new Error(`Invalid sample record: ${timestamps.length} + 1 !== ${values.length}`);
    const initialValue = values[0];
    const samples: Sample[] = [];
    for (let i = 0; i < timestamps.length; i++) samples.push({ time: timestamps[i], value: values[i + 1] });
    out[fieldConfig.name] = { initialValue, samples };
  }
  return out;
}

function normalizeFieldConfig(fields: FieldConfig): NormalizedFieldConfig {
  return fields.map((f) => (typeof f === 'string' ? { name: f, precision: 0 } : f));
}
