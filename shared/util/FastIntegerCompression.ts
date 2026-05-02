// FastIntegerCompression port (Apache 2.0). Used for compact path encoding.

function bytelog(val: number) {
  if (val < 1 << 7) return 1;
  if (val < 1 << 14) return 2;
  if (val < 1 << 21) return 3;
  if (val < 1 << 28) return 4;
  return 5;
}
function zigzag_encode(val: number) {
  return (val + val) ^ (val >> 31);
}
function zigzag_decode(val: number) {
  return (val >> 1) ^ -(val & 1);
}

export function computeCompressedSizeInBytes(input: number[]) {
  let answer = 0;
  for (let i = 0; i < input.length; i++) answer += bytelog(input[i]);
  return answer;
}
export function computeCompressedSizeInBytesSigned(input: number[]) {
  let answer = 0;
  for (let i = 0; i < input.length; i++) answer += bytelog(zigzag_encode(input[i]));
  return answer;
}

function _encode(view: Int8Array, pos: number, val: number) {
  if (val < 1 << 7) {
    view[pos++] = val;
  } else if (val < 1 << 14) {
    view[pos++] = (val & 0x7f) | 0x80;
    view[pos++] = val >>> 7;
  } else if (val < 1 << 21) {
    view[pos++] = (val & 0x7f) | 0x80;
    view[pos++] = ((val >>> 7) & 0x7f) | 0x80;
    view[pos++] = val >>> 14;
  } else if (val < 1 << 28) {
    view[pos++] = (val & 0x7f) | 0x80;
    view[pos++] = ((val >>> 7) & 0x7f) | 0x80;
    view[pos++] = ((val >>> 14) & 0x7f) | 0x80;
    view[pos++] = val >>> 21;
  } else {
    view[pos++] = (val & 0x7f) | 0x80;
    view[pos++] = ((val >>> 7) & 0x7f) | 0x80;
    view[pos++] = ((val >>> 14) & 0x7f) | 0x80;
    view[pos++] = ((val >>> 21) & 0x7f) | 0x80;
    view[pos++] = val >>> 28;
  }
  return pos;
}

export function compress(input: number[]) {
  const buf = new ArrayBuffer(computeCompressedSizeInBytes(input));
  const view = new Int8Array(buf);
  let pos = 0;
  for (let i = 0; i < input.length; i++) pos = _encode(view, pos, input[i]);
  return buf;
}
export function compressSigned(input: number[]) {
  const buf = new ArrayBuffer(computeCompressedSizeInBytesSigned(input));
  const view = new Int8Array(buf);
  let pos = 0;
  for (let i = 0; i < input.length; i++) pos = _encode(view, pos, zigzag_encode(input[i]));
  return buf;
}
function _decodeOne(inbyte: Int8Array, posRef: { p: number }) {
  let c = inbyte[posRef.p++];
  let v = c & 0x7f;
  if (c >= 0) return v;
  c = inbyte[posRef.p++];
  v |= (c & 0x7f) << 7;
  if (c >= 0) return v;
  c = inbyte[posRef.p++];
  v |= (c & 0x7f) << 14;
  if (c >= 0) return v;
  c = inbyte[posRef.p++];
  v |= (c & 0x7f) << 21;
  if (c >= 0) return v;
  c = inbyte[posRef.p++];
  v |= c << 28;
  return v >>> 0;
}
export function uncompress(input: ArrayBuffer) {
  const arr: number[] = [];
  const inbyte = new Int8Array(input);
  const posRef = { p: 0 };
  while (inbyte.length > posRef.p) arr.push(_decodeOne(inbyte, posRef));
  return arr;
}
export function uncompressSigned(input: ArrayBuffer) {
  const arr: number[] = [];
  const inbyte = new Int8Array(input);
  const posRef = { p: 0 };
  while (inbyte.length > posRef.p) arr.push(zigzag_decode(_decodeOne(inbyte, posRef)));
  return arr;
}
export function computeHowManyIntegers(input: ArrayBuffer) {
  const view = new Uint8Array(input);
  let count = 0;
  for (let i = 0; i < view.length; i++) count += view[i] >>> 7;
  return view.length - count;
}
